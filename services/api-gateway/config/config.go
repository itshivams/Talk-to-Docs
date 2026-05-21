package config

import (
	"os"
	"strconv"
)

type Config struct {
	Port               string
	AuthServiceURL     string
	SessionServiceURL  string
	RAGServiceURL      string
	JWTSecret          string
	AllowedOrigins     string
	RateLimitPerMinute int
}

func Load() Config {
	return Config{
		Port:               getEnv("PORT", "8080"),
		AuthServiceURL:     getEnv("AUTH_SERVICE_URL", "http://auth-service:8081"),
		SessionServiceURL:  getEnv("SESSION_SERVICE_URL", "http://session-service:8082"),
		RAGServiceURL:      getEnv("RAG_SERVICE_URL", "http://rag-service:8000"),
		JWTSecret:          getEnv("JWT_SECRET", "change-me-in-production"),
		AllowedOrigins:     getEnv("ALLOWED_ORIGINS", "http://localhost:3000"),
		RateLimitPerMinute: getEnvInt("RATE_LIMIT_PER_MINUTE", 120),
	}
}

func getEnv(key, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}

func getEnvInt(key string, fallback int) int {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return parsed
}
