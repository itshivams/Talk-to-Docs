import ipaddress
import re
import socket
from urllib.parse import urlparse, urlunparse

import httpx

from app.core.config import settings

BLOCKED_DOMAINS = {
    "youtube.com",
    "youtu.be",
    "instagram.com",
    "facebook.com",
    "twitter.com",
    "x.com",
    "linkedin.com",
    "tiktok.com",
    "spotify.com",
    "soundcloud.com",
    "vimeo.com",
}

MEDIA_EXTENSIONS = {
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".webp",
    ".svg",
    ".mp4",
    ".mov",
    ".avi",
    ".mkv",
    ".mp3",
    ".wav",
    ".m4a",
    ".flac",
    ".zip",
    ".tar",
    ".gz",
    ".pdf",
}


class URLRejected(ValueError):
    pass


def normalize_url(raw_url: str) -> str:
    parsed = urlparse(raw_url.strip())
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise URLRejected(settings.invalid_url_message)
    path = parsed.path or "/"
    normalized = parsed._replace(netloc=parsed.netloc.lower(), path=path, fragment="")
    return urlunparse(normalized)


def validate_url_shape(raw_url: str) -> str:
    url = normalize_url(raw_url)
    parsed = urlparse(url)
    host = parsed.hostname or ""
    if _blocked_host(host) or _media_path(parsed.path):
        raise URLRejected(settings.invalid_url_message)
    assert_public_host(host)
    return url


def assert_public_host(host: str) -> None:
    if not host:
        raise URLRejected(settings.invalid_url_message)
    try:
        ip = ipaddress.ip_address(host)
        if _private_ip(ip):
            raise URLRejected(settings.invalid_url_message)
        return
    except ValueError:
        pass

    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror as exc:
        raise URLRejected(settings.invalid_url_message) from exc
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if _private_ip(ip):
            raise URLRejected(settings.invalid_url_message)


async def validate_response(url: str, response: httpx.Response, html: str) -> None:
    final_host = urlparse(str(response.url)).hostname or ""
    assert_public_host(final_host)
    content_type = response.headers.get("content-type", "").lower()
    if response.status_code < 200 or response.status_code >= 300:
        raise URLRejected(settings.invalid_url_message)
    if not any(kind in content_type for kind in ("text/html", "application/xhtml+xml", "text/plain")):
        raise URLRejected(settings.invalid_url_message)
    if len(html.encode("utf-8")) > settings.max_page_bytes:
        raise URLRejected(settings.invalid_url_message)


def looks_like_documentation(url: str, html: str, text: str) -> bool:
    if len(text) < settings.min_text_chars:
        return False
    lower_url = url.lower()
    lower_html = html.lower()
    hints = ("docs", "documentation", "developer", "guide", "reference", "api", "manual", "article", "blog", "tutorial", "learn")
    score = sum(1 for hint in hints if hint in lower_url or hint in lower_html)
    score += len(re.findall(r"<p[\s>]", lower_html))
    score += len(re.findall(r"<h[1-3][\s>]", lower_html))
    score += len(re.findall(r"<pre[\s>]", lower_html)) * 2
    score += len(re.findall(r"<code[\s>]", lower_html))
    return len(text) >= 1200 or score >= 6


def _blocked_host(host: str) -> bool:
    host = host.lower().removeprefix("www.")
    return any(host == domain or host.endswith(f".{domain}") for domain in BLOCKED_DOMAINS)


def _media_path(path: str) -> bool:
    lower = path.lower()
    return any(lower.endswith(ext) for ext in MEDIA_EXTENSIONS)


def _private_ip(ip: ipaddress._BaseAddress) -> bool:
    return ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast or ip.is_unspecified
