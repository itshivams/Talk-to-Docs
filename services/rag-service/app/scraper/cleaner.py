from bs4 import BeautifulSoup


NOISE_SELECTORS = [
    "script",
    "style",
    "noscript",
    "svg",
    "canvas",
    "iframe",
    "nav",
    "footer",
    "aside",
    "form",
    "button",
    "[aria-hidden='true']",
    ".ad",
    ".ads",
    ".advertisement",
    ".cookie",
    ".newsletter",
]


def clean_html(html: str) -> BeautifulSoup:
    soup = BeautifulSoup(html, "html.parser")
    for selector in NOISE_SELECTORS:
        for node in soup.select(selector):
            node.decompose()
    return soup


def meaningful_text(soup: BeautifulSoup) -> str:
    text = soup.get_text(" ", strip=True)
    return " ".join(text.split())
