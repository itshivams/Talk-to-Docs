package middleware

import (
	"net"
	"net/http"
	"sync"
	"time"
)

type bucket struct {
	count int
	reset time.Time
}

func RateLimit(limit int) func(http.Handler) http.Handler {
	if limit <= 0 {
		limit = 120
	}

	var mu sync.Mutex
	buckets := map[string]bucket{}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ip := clientIP(r)
			now := time.Now()

			mu.Lock()
			b := buckets[ip]
			if b.reset.IsZero() || now.After(b.reset) {
				b = bucket{count: 0, reset: now.Add(time.Minute)}
			}
			b.count++
			buckets[ip] = b
			allowed := b.count <= limit
			mu.Unlock()

			if !allowed {
				http.Error(w, `{"error":"rate limit exceeded"}`, http.StatusTooManyRequests)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func clientIP(r *http.Request) string {
	if forwarded := r.Header.Get("X-Forwarded-For"); forwarded != "" {
		return forwarded
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
