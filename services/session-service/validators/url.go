package validators

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"mime"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"talk-to-docs/session-service/config"
)

type ValidationResult struct {
	Valid     bool   `json:"valid"`
	URL       string `json:"url"`
	Title     string `json:"title"`
	URLHash   string `json:"url_hash"`
	TextChars int    `json:"text_chars"`
	Error     string `json:"error,omitempty"`
}

type URLValidator struct {
	cfg    config.Config
	client *http.Client
}

func NewURLValidator(cfg config.Config) *URLValidator {
	return &URLValidator{
		cfg: cfg,
		client: &http.Client{
			Timeout: cfg.ScrapeTimeout,
			CheckRedirect: func(req *http.Request, via []*http.Request) error {
				if len(via) >= 4 {
					return errors.New("too many redirects")
				}
				return validateHost(req.URL.Hostname())
			},
		},
	}
}

func (v *URLValidator) Validate(ctx context.Context, rawURL string) (ValidationResult, error) {
	parsed, err := normalizeURL(rawURL)
	if err != nil {
		return ValidationResult{Valid: false, Error: v.cfg.InvalidURLMessage}, nil
	}
	if err := validateHost(parsed.Hostname()); err != nil {
		return ValidationResult{Valid: false, URL: parsed.String(), Error: v.cfg.InvalidURLMessage}, nil
	}
	if blockedDomain(parsed.Hostname()) || mediaExtension(parsed.Path) {
		return ValidationResult{Valid: false, URL: parsed.String(), Error: v.cfg.InvalidURLMessage}, nil
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, parsed.String(), nil)
	if err != nil {
		return ValidationResult{Valid: false, URL: parsed.String(), Error: v.cfg.InvalidURLMessage}, nil
	}
	req.Header.Set("User-Agent", "TalkToDocsBot/1.0 (+documentation QA)")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.8,text/plain;q=0.6")

	resp, err := v.client.Do(req)
	if err != nil {
		return ValidationResult{Valid: false, URL: parsed.String(), Error: v.cfg.InvalidURLMessage}, nil
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return ValidationResult{Valid: false, URL: parsed.String(), Error: v.cfg.InvalidURLMessage}, nil
	}
	if !textualContentType(resp.Header.Get("Content-Type")) {
		return ValidationResult{Valid: false, URL: parsed.String(), Error: v.cfg.InvalidURLMessage}, nil
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, v.cfg.MaxPageBytes+1))
	if err != nil || int64(len(body)) > v.cfg.MaxPageBytes {
		return ValidationResult{Valid: false, URL: parsed.String(), Error: v.cfg.InvalidURLMessage}, nil
	}

	html := string(body)
	title := extractTitle(html)
	text := extractMeaningfulText(html)
	if len(text) < v.cfg.MinTextChars || !looksLikeDocumentation(parsed, html, text) {
		return ValidationResult{Valid: false, URL: parsed.String(), Error: v.cfg.InvalidURLMessage}, nil
	}

	canonical := parsed.String()
	return ValidationResult{
		Valid:     true,
		URL:       canonical,
		Title:     title,
		URLHash:   hashURL(canonical),
		TextChars: len(text),
	}, nil
}

func normalizeURL(raw string) (*url.URL, error) {
	raw = strings.TrimSpace(raw)
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return nil, errors.New("invalid url")
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return nil, errors.New("unsupported scheme")
	}
	parsed.Fragment = ""
	parsed.Host = strings.ToLower(parsed.Host)
	return parsed, nil
}

func validateHost(host string) error {
	if host == "" {
		return errors.New("missing host")
	}
	if ip := net.ParseIP(host); ip != nil {
		if privateIP(ip) {
			return errors.New("private ip blocked")
		}
		return nil
	}
	ips, err := net.LookupIP(host)
	if err != nil || len(ips) == 0 {
		return errors.New("host lookup failed")
	}
	for _, ip := range ips {
		if privateIP(ip) {
			return errors.New("private ip blocked")
		}
	}
	return nil
}

func privateIP(ip net.IP) bool {
	if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsUnspecified() {
		return true
	}
	return false
}

func blockedDomain(host string) bool {
	host = strings.TrimPrefix(strings.ToLower(host), "www.")
	blocked := []string{
		"youtube.com", "youtu.be", "instagram.com", "facebook.com", "twitter.com", "x.com",
		"linkedin.com", "tiktok.com", "spotify.com", "soundcloud.com", "vimeo.com",
	}
	for _, domain := range blocked {
		if host == domain || strings.HasSuffix(host, "."+domain) {
			return true
		}
	}
	return false
}

func mediaExtension(path string) bool {
	path = strings.ToLower(path)
	extensions := []string{
		".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".mp4", ".mov", ".avi", ".mkv",
		".mp3", ".wav", ".m4a", ".flac", ".zip", ".tar", ".gz", ".pdf",
	}
	for _, ext := range extensions {
		if strings.HasSuffix(path, ext) {
			return true
		}
	}
	return false
}

func textualContentType(contentType string) bool {
	mediaType, _, err := mime.ParseMediaType(contentType)
	if err != nil {
		mediaType = strings.ToLower(strings.Split(contentType, ";")[0])
	}
	return mediaType == "text/html" || mediaType == "application/xhtml+xml" || mediaType == "text/plain"
}

func extractTitle(html string) string {
	re := regexp.MustCompile(`(?is)<title[^>]*>(.*?)</title>`)
	match := re.FindStringSubmatch(html)
	if len(match) < 2 {
		return "Untitled documentation"
	}
	title := cleanWhitespace(stripTags(match[1]))
	if title == "" {
		return "Untitled documentation"
	}
	if len(title) > 180 {
		return title[:180]
	}
	return title
}

func extractMeaningfulText(html string) string {
	noise := regexp.MustCompile(`(?is)<(script|style|noscript|svg|canvas|iframe|nav|footer|aside|form|button)[^>]*>.*?</\1>`)
	html = noise.ReplaceAllString(html, " ")
	return cleanWhitespace(stripTags(html))
}

func stripTags(input string) string {
	re := regexp.MustCompile(`(?is)<[^>]+>`)
	return re.ReplaceAllString(input, " ")
}

func cleanWhitespace(input string) string {
	space := regexp.MustCompile(`\s+`)
	return strings.TrimSpace(space.ReplaceAllString(input, " "))
}

func looksLikeDocumentation(parsed *url.URL, html string, text string) bool {
	lowerURL := strings.ToLower(parsed.Host + parsed.Path)
	lowerHTML := strings.ToLower(html)
	docHints := []string{"docs", "documentation", "developer", "guide", "reference", "api", "manual", "article", "blog", "tutorial", "learn"}
	score := 0
	for _, hint := range docHints {
		if strings.Contains(lowerURL, hint) || strings.Contains(lowerHTML, hint) {
			score++
		}
	}
	score += strings.Count(lowerHTML, "<p")
	score += strings.Count(lowerHTML, "<pre") * 2
	score += strings.Count(lowerHTML, "<code")
	score += strings.Count(lowerHTML, "<h1") + strings.Count(lowerHTML, "<h2") + strings.Count(lowerHTML, "<h3")
	return len(text) >= 1200 || score >= 6
}

func hashURL(value string) string {
	sum := sha256.Sum256([]byte(strings.ToLower(strings.TrimSpace(value))))
	return hex.EncodeToString(sum[:])
}

func TimeoutContext(parent context.Context, timeout time.Duration) (context.Context, context.CancelFunc) {
	return context.WithTimeout(parent, timeout)
}
