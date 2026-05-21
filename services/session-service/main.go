package main

import (
	"context"
	"log"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"talk-to-docs/session-service/config"
	"talk-to-docs/session-service/handlers"
	"talk-to-docs/session-service/repository"
	"talk-to-docs/session-service/validators"
)

func main() {
	cfg := config.Load()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	db, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("connect postgres: %v", err)
	}
	defer db.Close()
	if err := db.Ping(ctx); err != nil {
		log.Fatalf("ping postgres: %v", err)
	}

	redisClient := redis.NewClient(&redis.Options{Addr: cfg.RedisAddr, Password: cfg.RedisPassword, DB: cfg.RedisDB})
	if err := redisClient.Ping(ctx).Err(); err != nil {
		log.Fatalf("ping redis: %v", err)
	}
	defer redisClient.Close()

	sessionHandler := handlers.NewSessionHandler(
		repository.NewRepository(db),
		redisClient,
		validators.NewURLValidator(cfg),
		cfg,
	)

	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ok","service":"session-service"}`))
	})
	mux.HandleFunc("/sessions/new", method(http.MethodPost, sessionHandler.NewSession))
	mux.HandleFunc("/sessions", sessionHandler.Sessions)
	mux.HandleFunc("/sessions/", sessionHandler.SessionByID)
	mux.HandleFunc("/documents/validate-url", method(http.MethodPost, sessionHandler.ValidateURL))
	mux.HandleFunc("/documents/ingest", method(http.MethodPost, sessionHandler.EnqueueIngest))
	mux.HandleFunc("/documents/", sessionHandler.DocumentByID)

	server := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      mux,
		ReadTimeout:  20 * time.Second,
		WriteTimeout: 20 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	log.Printf("session-service listening on :%s", cfg.Port)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("listen: %v", err)
	}
}

func method(expected string, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != expected {
			w.Header().Set("Allow", expected)
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		next(w, r)
	}
}
