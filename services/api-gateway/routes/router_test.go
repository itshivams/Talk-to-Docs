package routes

import (
	"net/http"
	"testing"
)

func TestStripUpstreamCORSHeaders(t *testing.T) {
	header := http.Header{}
	header.Set("Access-Control-Allow-Origin", "http://localhost:3000")
	header.Set("Access-Control-Allow-Credentials", "true")
	header.Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
	header.Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	header.Set("Access-Control-Expose-Headers", "X-Request-ID")
	header.Set("Access-Control-Max-Age", "600")
	header.Set("Content-Type", "application/json")

	stripUpstreamCORS(header)

	for _, key := range []string{
		"Access-Control-Allow-Origin",
		"Access-Control-Allow-Credentials",
		"Access-Control-Allow-Headers",
		"Access-Control-Allow-Methods",
		"Access-Control-Expose-Headers",
		"Access-Control-Max-Age",
	} {
		if values := header.Values(key); len(values) != 0 {
			t.Fatalf("expected %s to be stripped, got %v", key, values)
		}
	}
	if got := header.Get("Content-Type"); got != "application/json" {
		t.Fatalf("expected non-CORS headers to remain, got Content-Type %q", got)
	}
}
