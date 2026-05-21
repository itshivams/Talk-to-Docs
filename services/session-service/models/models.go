package models

import "time"

type Document struct {
	ID           string    `json:"id"`
	UserID       string    `json:"user_id"`
	SourceURL    string    `json:"source_url"`
	URLHash      string    `json:"url_hash"`
	Title        string    `json:"title"`
	Status       string    `json:"status"`
	ErrorMessage string    `json:"error_message,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type ChatSession struct {
	ID        string    `json:"id"`
	UserID    string    `json:"user_id"`
	DocID     string    `json:"doc_id"`
	SourceURL string    `json:"source_url"`
	Title     string    `json:"title"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type IngestJob struct {
	UserID    string `json:"user_id"`
	SessionID string `json:"session_id"`
	DocID     string `json:"doc_id"`
	SourceURL string `json:"source_url"`
	Title     string `json:"title"`
	Attempt   int    `json:"attempt"`
}
