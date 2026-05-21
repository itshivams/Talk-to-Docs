package config

import (
	"os"
	"strconv"
	"time"
)

type Config struct {
	Port         string
	DatabaseURL  string
	JWTSecret    string
	JWTExpiresIn time.Duration
}

func Load() Config {
	return Config{
		Port:         getEnv("PORT", "8081"),
		DatabaseURL:  getEnv("DATABASE_URL", "postgres://talk:talk@postgres:5432/talk_to_docs?sslmode=disable"),
		JWTSecret:    getEnv("JWT_SECRET", "change-me-in-production"),
		JWTExpiresIn: time.Duration(getEnvInt("JWT_EXPIRES_MINUTES", 60)) * time.Minute,
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
