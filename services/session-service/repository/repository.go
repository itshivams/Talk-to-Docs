package repository

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"talk-to-docs/session-service/models"
)

type Repository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

func (r *Repository) UpsertDocument(ctx context.Context, userID, sourceURL, urlHash, title string) (models.Document, error) {
	row := r.db.QueryRow(ctx, `
		INSERT INTO documents (user_id, source_url, url_hash, title, status)
		VALUES ($1, $2, $3, $4, 'queued')
		ON CONFLICT (user_id, url_hash)
		DO UPDATE SET title = COALESCE(NULLIF(EXCLUDED.title, ''), documents.title),
			updated_at = now(),
			status = CASE WHEN documents.status = 'error' THEN 'queued' ELSE documents.status END,
			error_message = CASE WHEN documents.status = 'error' THEN NULL ELSE documents.error_message END
		RETURNING id::text, user_id::text, source_url, url_hash, title, status, COALESCE(error_message, ''), created_at, updated_at
	`, userID, sourceURL, urlHash, title)
	return scanDocument(row)
}

func (r *Repository) CreateSession(ctx context.Context, userID, docID, sourceURL, title string) (models.ChatSession, error) {
	row := r.db.QueryRow(ctx, `
		INSERT INTO chat_sessions (user_id, doc_id, source_url, title, status)
		VALUES ($1, $2, $3, $4, 'queued')
		RETURNING id::text, user_id::text, doc_id::text, source_url, title, status, created_at, updated_at
	`, userID, docID, sourceURL, title)

	var session models.ChatSession
	if err := row.Scan(&session.ID, &session.UserID, &session.DocID, &session.SourceURL, &session.Title, &session.Status, &session.CreatedAt, &session.UpdatedAt); err != nil {
		return models.ChatSession{}, err
	}
	return session, nil
}

func (r *Repository) ListSessions(ctx context.Context, userID string) ([]models.ChatSession, error) {
	rows, err := r.db.Query(ctx, `
		SELECT s.id::text, s.user_id::text, s.doc_id::text, s.source_url, s.title,
			s.status, s.created_at, s.updated_at
		FROM chat_sessions s
		WHERE s.user_id = $1
		ORDER BY s.updated_at DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	sessions := make([]models.ChatSession, 0)
	for rows.Next() {
		var session models.ChatSession
		if err := rows.Scan(&session.ID, &session.UserID, &session.DocID, &session.SourceURL, &session.Title, &session.Status, &session.CreatedAt, &session.UpdatedAt); err != nil {
			return nil, err
		}
		sessions = append(sessions, session)
	}
	return sessions, rows.Err()
}

func (r *Repository) GetSession(ctx context.Context, userID, sessionID string) (models.ChatSession, error) {
	row := r.db.QueryRow(ctx, `
		SELECT s.id::text, s.user_id::text, s.doc_id::text, s.source_url, s.title,
			s.status, s.created_at, s.updated_at
		FROM chat_sessions s
		WHERE s.user_id = $1 AND s.id = $2
	`, userID, sessionID)

	var session models.ChatSession
	if err := row.Scan(&session.ID, &session.UserID, &session.DocID, &session.SourceURL, &session.Title, &session.Status, &session.CreatedAt, &session.UpdatedAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return models.ChatSession{}, ErrNotFound
		}
		return models.ChatSession{}, err
	}
	return session, nil
}

func (r *Repository) DeleteSession(ctx context.Context, userID, sessionID string) error {
	tag, err := r.db.Exec(ctx, `DELETE FROM chat_sessions WHERE user_id = $1 AND id = $2`, userID, sessionID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *Repository) GetDocument(ctx context.Context, userID, docID string) (models.Document, error) {
	row := r.db.QueryRow(ctx, `
		SELECT id::text, user_id::text, source_url, url_hash, title, status, COALESCE(error_message, ''), created_at, updated_at
		FROM documents
		WHERE user_id = $1 AND id = $2
	`, userID, docID)
	return scanDocument(row)
}

func (r *Repository) MarkDocumentQueued(ctx context.Context, userID, docID string) (models.Document, error) {
	row := r.db.QueryRow(ctx, `
		UPDATE documents
		SET status = 'queued', error_message = NULL, updated_at = now()
		WHERE user_id = $1 AND id = $2
		RETURNING id::text, user_id::text, source_url, url_hash, title, status, COALESCE(error_message, ''), created_at, updated_at
	`, userID, docID)
	return scanDocument(row)
}

func scanDocument(row pgx.Row) (models.Document, error) {
	var doc models.Document
	if err := row.Scan(&doc.ID, &doc.UserID, &doc.SourceURL, &doc.URLHash, &doc.Title, &doc.Status, &doc.ErrorMessage, &doc.CreatedAt, &doc.UpdatedAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return models.Document{}, ErrNotFound
		}
		return models.Document{}, err
	}
	return doc, nil
}

var ErrNotFound = errors.New("not found")
