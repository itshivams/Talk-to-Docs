from typing import Any

import httpx


async def ingest_job(rag_service_url: str, job: dict[str, Any], timeout_seconds: int) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=timeout_seconds) as client:
        response = await client.post(f"{rag_service_url.rstrip('/')}/internal/ingest-job", json=job)
        response.raise_for_status()
        return response.json()
