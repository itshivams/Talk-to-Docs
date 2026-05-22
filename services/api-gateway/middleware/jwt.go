package middleware

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"
	"time"
)

type contextKey string

const (
	userIDKey    contextKey = "userID"
	userEmailKey contextKey = "userEmail"
)

type Claims struct {
	Sub   string `json:"sub"`
	Email string `json:"email"`
	Exp   int64  `json:"exp"`
}

func Auth(secret string, publicPaths map[string]bool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Method == http.MethodOptions || publicPaths[r.URL.Path] || r.URL.Path == "/health" {
				next.ServeHTTP(w, r)
				return
			}

			token := bearerToken(r.Header.Get("Authorization"))
			if token == "" && isWebSocketRequest(r) {
				token = strings.TrimSpace(r.URL.Query().Get("access_token"))
			}
			claims, err := parseJWT(token, secret)
			if err != nil {
				log.Printf("Auth failed for path %q: %v (Upgrade header: %q)", r.URL.Path, err, r.Header.Get("Upgrade"))
				http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
				return
			}

			r.Header.Set("X-User-ID", claims.Sub)
			r.Header.Set("X-User-Email", claims.Email)
			ctx := context.WithValue(r.Context(), userIDKey, claims.Sub)
			ctx = context.WithValue(ctx, userEmailKey, claims.Email)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func bearerToken(header string) string {
	if strings.HasPrefix(strings.ToLower(header), "bearer ") {
		return strings.TrimSpace(header[7:])
	}
	return ""
}

func isWebSocketRequest(r *http.Request) bool {
	return strings.EqualFold(r.Header.Get("Upgrade"), "websocket")
}

func parseJWT(token, secret string) (Claims, error) {
	if token == "" {
		return Claims{}, errors.New("missing token")
	}
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return Claims{}, errors.New("invalid token")
	}
	unsigned := parts[0] + "." + parts[1]
	expected := sign(unsigned, secret)
	if !hmac.Equal([]byte(expected), []byte(parts[2])) {
		return Claims{}, errors.New("invalid signature")
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return Claims{}, err
	}
	var claims Claims
	if err := json.Unmarshal(payload, &claims); err != nil {
		return Claims{}, err
	}
	if claims.Sub == "" || claims.Exp < time.Now().UTC().Unix() {
		return Claims{}, errors.New("expired or invalid claims")
	}
	return claims, nil
}

func sign(value, secret string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(value))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}
