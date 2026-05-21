package middleware

import (
	"context"
	"net/http"
	"strings"

	"talk-to-docs/auth-service/utils"
)

type contextKey string

const UserIDKey contextKey = "userID"

func JWT(secret string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			token := bearerToken(r.Header.Get("Authorization"))
			claims, err := utils.ParseJWT(token, secret)
			if err != nil {
				http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
				return
			}
			r.Header.Set("X-User-ID", claims.Sub)
			ctx := context.WithValue(r.Context(), UserIDKey, claims.Sub)
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
