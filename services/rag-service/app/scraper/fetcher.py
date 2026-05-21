import httpx

from app.core.config import settings
from app.core.security import URLRejected, validate_response, validate_url_shape


async def fetch_page(raw_url: str) -> tuple[str, str]:
    url = validate_url_shape(raw_url)
    timeout = httpx.Timeout(settings.scrape_timeout_seconds)
    headers = {
        "User-Agent": "TalkToDocsBot/1.0 (+documentation QA)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.8,text/plain;q=0.6",
    }
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True, max_redirects=4) as client:
        response = await client.get(url, headers=headers)
        content = response.content[: settings.max_page_bytes + 1]
        html = content.decode(response.encoding or "utf-8", errors="ignore")
        await validate_response(url, response, html)
        if len(content) > settings.max_page_bytes:
            raise URLRejected(settings.invalid_url_message)
        return str(response.url), html
