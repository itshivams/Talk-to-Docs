package validators

import (
	"strings"
	"testing"
)

func TestExtractMeaningfulTextRemovesNoiseBlocks(t *testing.T) {
	html := `<html><head><title>Docs</title><style>.hidden{}</style><script>alert("x")</script></head><body><nav>Menu</nav><main><h1>Install</h1><p>Run the setup command.</p></main><footer>Footer</footer></body></html>`

	text := extractMeaningfulText(html)

	if !strings.Contains(text, "Install Run the setup command.") {
		t.Fatalf("expected meaningful body text, got %q", text)
	}
	for _, noise := range []string{"alert", ".hidden", "Menu", "Footer"} {
		if strings.Contains(text, noise) {
			t.Fatalf("expected noise %q to be removed, got %q", noise, text)
		}
	}
}
