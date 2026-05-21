package routes

import (
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"

	"talk-to-docs/api-gateway/config"
)

var PublicPaths = map[string]bool{
	"/auth/register": true,
	"/auth/login":    true,
}

type Router struct {
	authProxy    *httputil.ReverseProxy
	sessionProxy *httputil.ReverseProxy
	ragProxy     *httputil.ReverseProxy
}

func NewRouter(cfg config.Config) *Router {
	return &Router{
		authProxy:    mustProxy(cfg.AuthServiceURL),
		sessionProxy: mustProxy(cfg.SessionServiceURL),
		ragProxy:     mustProxy(cfg.RAGServiceURL),
	}
}

func (r *Router) ServeHTTP(w http.ResponseWriter, req *http.Request) {
	path := req.URL.Path
	switch {
	case path == "/health":
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ok","service":"api-gateway"}`))
	case strings.HasPrefix(path, "/auth/"):
		r.authProxy.ServeHTTP(w, req)
	case strings.HasPrefix(path, "/sessions"):
		r.sessionProxy.ServeHTTP(w, req)
	case strings.HasPrefix(path, "/documents"):
		r.sessionProxy.ServeHTTP(w, req)
	case path == "/chat" || strings.HasPrefix(path, "/chat/"):
		r.ragProxy.ServeHTTP(w, req)
	default:
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
	}
}

func mustProxy(rawURL string) *httputil.ReverseProxy {
	target, err := url.Parse(rawURL)
	if err != nil {
		log.Fatalf("invalid upstream URL %q: %v", rawURL, err)
	}
	proxy := httputil.NewSingleHostReverseProxy(target)
	originalDirector := proxy.Director
	proxy.Director = func(req *http.Request) {
		originalHost := req.Host
		originalDirector(req)
		req.Host = target.Host
		req.Header.Set("X-Forwarded-Host", originalHost)
		req.Header.Set("X-Forwarded-Proto", "http")
	}
	proxy.ErrorHandler = func(w http.ResponseWriter, _ *http.Request, err error) {
		log.Printf("proxy error to %s: %v", target.String(), err)
		http.Error(w, `{"error":"upstream unavailable"}`, http.StatusBadGateway)
	}
	return proxy
}
