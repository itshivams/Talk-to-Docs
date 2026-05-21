package main

import (
	"log"
	"net/http"
	"time"

	"talk-to-docs/api-gateway/config"
	"talk-to-docs/api-gateway/middleware"
	"talk-to-docs/api-gateway/routes"
)

func main() {
	cfg := config.Load()
	router := routes.NewRouter(cfg)

	handler := middleware.CORS(cfg.AllowedOrigins)(
		middleware.RateLimit(cfg.RateLimitPerMinute)(
			middleware.Auth(cfg.JWTSecret, routes.PublicPaths)(router),
		),
	)

	server := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      handler,
		ReadTimeout:  20 * time.Second,
		WriteTimeout: 45 * time.Second,
		IdleTimeout:  90 * time.Second,
	}

	log.Printf("api-gateway listening on :%s", cfg.Port)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("listen: %v", err)
	}
}
