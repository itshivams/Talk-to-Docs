package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"golang.org/x/crypto/bcrypt"

	"talk-to-docs/auth-service/config"
	"talk-to-docs/auth-service/repository"
	"talk-to-docs/auth-service/utils"
)

type AuthHandler struct {
	repo *repository.UserRepository
	cfg  config.Config
}

func NewAuthHandler(repo *repository.UserRepository, cfg config.Config) *AuthHandler {
	return &AuthHandler{repo: repo, cfg: cfg}
}

type registerRequest struct {
	Name     string `json:"name"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var req registerRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if strings.TrimSpace(req.Name) == "" || !validEmail(req.Email) || len(req.Password) < 8 {
		writeError(w, http.StatusBadRequest, "name, valid email, and password with at least 8 characters are required")
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to hash password")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	user, err := h.repo.Create(ctx, req.Name, req.Email, string(hash))
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			writeError(w, http.StatusConflict, "email already registered")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to create user")
		return
	}

	token, err := utils.GenerateJWT(user.ID, user.Email, h.cfg.JWTSecret, h.cfg.JWTExpiresIn)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create token")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"token": token, "user": user.Public()})
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if !validEmail(req.Email) || req.Password == "" {
		writeError(w, http.StatusBadRequest, "valid email and password are required")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	user, err := h.repo.GetByEmail(ctx, req.Email)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		writeError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	token, err := utils.GenerateJWT(user.ID, user.Email, h.cfg.JWTSecret, h.cfg.JWTExpiresIn)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create token")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"token": token, "user": user.Public()})
}

func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	userID := strings.TrimSpace(r.Header.Get("X-User-ID"))
	if userID == "" {
		writeError(w, http.StatusUnauthorized, "missing authenticated user")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	user, err := h.repo.GetByID(ctx, userID)
	if err != nil {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"user": user.Public()})
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

func validEmail(email string) bool {
	email = strings.TrimSpace(email)
	return strings.Contains(email, "@") && strings.Contains(email, ".") && len(email) <= 254
}
