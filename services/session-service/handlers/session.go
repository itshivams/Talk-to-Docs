package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"

	"talk-to-docs/session-service/config"
	"talk-to-docs/session-service/models"
	"talk-to-docs/session-service/repository"
	"talk-to-docs/session-service/validators"
)

type SessionHandler struct {
	repo      *repository.Repository
	redis     *redis.Client
	validator *validators.URLValidator
	cfg       config.Config
}

func NewSessionHandler(repo *repository.Repository, redisClient *redis.Client, validator *validators.URLValidator, cfg config.Config) *SessionHandler {
	return &SessionHandler{repo: repo, redis: redisClient, validator: validator, cfg: cfg}
}

type urlRequest struct {
	URL string `json:"url"`
}

type ingestRequest struct {
	DocID     string `json:"doc_id"`
	SessionID string `json:"session_id"`
}

func (h *SessionHandler) ValidateURL(w http.ResponseWriter, r *http.Request) {
	var req urlRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), h.cfg.ScrapeTimeout+3*time.Second)
	defer cancel()

	result, _ := h.validator.Validate(ctx, req.URL)
	if !result.Valid {
		writeJSON(w, http.StatusBadRequest, result)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (h *SessionHandler) NewSession(w http.ResponseWriter, r *http.Request) {
	userID := authenticatedUserID(w, r)
	if userID == "" {
		return
	}

	var req urlRequest
	if !decodeJSON(w, r, &req) {
		return
	}

	validateCtx, validateCancel := context.WithTimeout(r.Context(), h.cfg.ScrapeTimeout+3*time.Second)
	defer validateCancel()
	result, _ := h.validator.Validate(validateCtx, req.URL)
	if !result.Valid {
		writeError(w, http.StatusBadRequest, h.cfg.InvalidURLMessage)
		return
	}

	dbCtx, dbCancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer dbCancel()

	doc, err := h.repo.UpsertDocument(dbCtx, userID, result.URL, result.URLHash, result.Title)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create document")
		return
	}
	session, err := h.repo.CreateSession(dbCtx, userID, doc.ID, result.URL, result.Title)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create session")
		return
	}

	if err := h.enqueue(r.Context(), models.IngestJob{
		UserID:    userID,
		SessionID: session.ID,
		DocID:     doc.ID,
		SourceURL: result.URL,
		Title:     result.Title,
		Attempt:   0,
	}); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to queue ingestion")
		return
	}

	writeJSON(w, http.StatusCreated, map[string]any{"session": session, "document": doc})
}

func (h *SessionHandler) Sessions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	userID := authenticatedUserID(w, r)
	if userID == "" {
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	sessions, err := h.repo.ListSessions(ctx, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list sessions")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"sessions": sessions})
}

func (h *SessionHandler) SessionByID(w http.ResponseWriter, r *http.Request) {
	userID := authenticatedUserID(w, r)
	if userID == "" {
		return
	}
	sessionID := strings.TrimPrefix(r.URL.Path, "/sessions/")
	if sessionID == "" || strings.Contains(sessionID, "/") {
		writeError(w, http.StatusNotFound, "session not found")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	switch r.Method {
	case http.MethodGet:
		session, err := h.repo.GetSession(ctx, userID, sessionID)
		if err != nil {
			statusFromError(w, err, "session not found")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"session": session})
	case http.MethodDelete:
		if err := h.repo.DeleteSession(ctx, userID, sessionID); err != nil {
			statusFromError(w, err, "session not found")
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (h *SessionHandler) EnqueueIngest(w http.ResponseWriter, r *http.Request) {
	userID := authenticatedUserID(w, r)
	if userID == "" {
		return
	}

	var req ingestRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.DocID == "" || req.SessionID == "" {
		writeError(w, http.StatusBadRequest, "doc_id and session_id are required")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	session, err := h.repo.GetSession(ctx, userID, req.SessionID)
	if err != nil || session.DocID != req.DocID {
		writeError(w, http.StatusNotFound, "session/document mapping not found")
		return
	}
	doc, err := h.repo.MarkDocumentQueued(ctx, userID, req.DocID)
	if err != nil {
		statusFromError(w, err, "document not found")
		return
	}

	if err := h.enqueue(r.Context(), models.IngestJob{
		UserID:    userID,
		SessionID: session.ID,
		DocID:     doc.ID,
		SourceURL: doc.SourceURL,
		Title:     doc.Title,
		Attempt:   0,
	}); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to queue ingestion")
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]any{"document": doc, "session": session})
}

func (h *SessionHandler) DocumentByID(w http.ResponseWriter, r *http.Request) {
	userID := authenticatedUserID(w, r)
	if userID == "" {
		return
	}
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	path := strings.TrimPrefix(r.URL.Path, "/documents/")
	docID := strings.TrimSuffix(path, "/status")
	if docID == "" || docID == path {
		writeError(w, http.StatusNotFound, "document not found")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	doc, err := h.repo.GetDocument(ctx, userID, docID)
	if err != nil {
		statusFromError(w, err, "document not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"document": doc})
}

func (h *SessionHandler) enqueue(ctx context.Context, job models.IngestJob) error {
	payload, err := json.Marshal(job)
	if err != nil {
		return err
	}
	queueCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	return h.redis.LPush(queueCtx, h.cfg.IngestQueue, payload).Err()
}

func authenticatedUserID(w http.ResponseWriter, r *http.Request) string {
	userID := strings.TrimSpace(r.Header.Get("X-User-ID"))
	if userID == "" {
		writeError(w, http.StatusUnauthorized, "missing authenticated user")
		return ""
	}
	return userID
}

func decodeJSON(w http.ResponseWriter, r *http.Request, dest any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(dest); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return false
	}
	return true
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

func statusFromError(w http.ResponseWriter, err error, notFoundMessage string) {
	if errors.Is(err, repository.ErrNotFound) {
		writeError(w, http.StatusNotFound, notFoundMessage)
		return
	}
	writeError(w, http.StatusInternalServerError, "request failed")
}
