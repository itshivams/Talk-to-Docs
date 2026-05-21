package config

import (
	"os"
	"strconv"
	"time"
)

type Config struct {
	Port              string
	DatabaseURL       string
	RedisAddr         string
	RedisPassword     string
	RedisDB           int
	IngestQueue       string
	ScrapeTimeout     time.Duration
	MaxPageBytes      int64
	MinTextChars      int
	AllowedOrigins    string
	InvalidURLMessage string
}

func Load() Config {
	return Config{
		Port:              getEnv("PORT", "8082"),
		DatabaseURL:       getEnv("DATABASE_URL", "postgres://talk:talk@postgres:5432/talk_to_docs?sslmode=disable"),
		RedisAddr:         getEnv("REDIS_ADDR", "redis:6379"),
		RedisPassword:     getEnv("REDIS_PASSWORD", ""),
		RedisDB:           getEnvInt("REDIS_DB", 0),
		IngestQueue:       getEnv("INGEST_QUEUE", "ingest_jobs"),
		ScrapeTimeout:     time.Duration(getEnvInt("SCRAPE_TIMEOUT_SECONDS", 12)) * time.Second,
		MaxPageBytes:      int64(getEnvInt("MAX_PAGE_BYTES", 2_000_000)),
		MinTextChars:      getEnvInt("MIN_TEXT_CHARS", 500),
		AllowedOrigins:    getEnv("ALLOWED_ORIGINS", "http://localhost:3000"),
		InvalidURLMessage: "This URL does not appear to be a valid documentation or article page.",
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
