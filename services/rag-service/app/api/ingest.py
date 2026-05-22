import hashlib
from typing import Any

import psycopg
from fastapi import APIRouter, Header, HTTPException
from psycopg.rows import dict_row

from app.core.config import settings
from app.core.security import URLRejected, looks_like_documentation
from app.models.schemas import IngestRequest, ValidateURLRequest
from app.rag.chunker import chunk_document
from app.rag.vector_store import VectorStore
from app.scraper.cleaner import clean_html, meaningful_text
from app.scraper.fetcher import fetch_page
from app.scraper.parser import parse_document

router = APIRouter()


@router.post("/documents/validate-url")
async def validate_url(payload: ValidateURLRequest) -> dict[str, Any]:
    try:
        final_url, html = await fetch_page(str(payload.url))
        soup = clean_html(html)
        text = meaningful_text(soup)
        if not looks_like_documentation(final_url, html, text):
            raise URLRejected(settings.invalid_url_message)
        parsed = parse_document(soup)
        return {
            "valid": True,
            "url": final_url,
            "title": parsed.title,
            "url_hash": hashlib.sha256(final_url.lower().encode("utf-8")).hexdigest(),
            "text_chars": len(text),
        }
    except URLRejected as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/documents/ingest")
async def ingest_document(payload: IngestRequest, x_user_id: str = Header(default="")) -> dict[str, Any]:
    if x_user_id and x_user_id != payload.user_id:
        raise HTTPException(status_code=403, detail="user mismatch")
    return await _ingest(payload)


@router.post("/internal/ingest-job")
async def ingest_job(payload: IngestRequest) -> dict[str, Any]:
    return await _ingest(payload)


@router.get("/documents/{doc_id}/status")
def document_status(doc_id: str, x_user_id: str = Header(default="")) -> dict[str, Any]:
    with psycopg.connect(settings.database_url, row_factory=dict_row) as conn:
        row = conn.execute(
            """
            SELECT id::text, user_id::text, source_url, title, status, COALESCE(error_message, '') AS error_message, created_at, updated_at
            FROM documents
            WHERE id = %s AND (%s = '' OR user_id = %s)
            """,
            (doc_id, x_user_id, x_user_id),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="document not found")
    return {"document": row}


async def _ingest(payload: IngestRequest) -> dict[str, Any]:
    try:
        _update_status(payload.doc_id, payload.session_id, payload.user_id, "fetching")
        final_url, html = await fetch_page(str(payload.source_url))
        _update_status(payload.doc_id, payload.session_id, payload.user_id, "parsing")
        soup = clean_html(html)
        text = meaningful_text(soup)
        if not looks_like_documentation(final_url, html, text):
            raise URLRejected(settings.invalid_url_message)
        parsed = parse_document(soup)
        _update_status(payload.doc_id, payload.session_id, payload.user_id, "chunking")
        chunks = chunk_document(parsed)
        if not chunks:
            raise URLRejected(settings.invalid_url_message)

        title = payload.title or parsed.title
        _update_status(payload.doc_id, payload.session_id, payload.user_id, "embedding")
        VectorStore().upsert_chunks(
            user_id=payload.user_id,
            session_id=payload.session_id,
            doc_id=payload.doc_id,
            source_url=final_url,
            title=title,
            chunks=chunks,
        )
        _mark_ready(payload.doc_id, payload.session_id, payload.user_id, title, len(chunks))
        return {"status": "ready", "doc_id": payload.doc_id, "session_id": payload.session_id, "chunks": len(chunks), "title": title}
    except Exception as exc:
        _update_status(payload.doc_id, payload.session_id, payload.user_id, "error", str(exc)[:500])
        raise


def _update_status(doc_id: str, session_id: str, user_id: str, status: str, error_message: str | None = None) -> None:
    with psycopg.connect(settings.database_url) as conn:
        conn.execute(
            """
            UPDATE documents
            SET status = %s, error_message = %s, updated_at = now()
            WHERE id = %s AND user_id = %s
            """,
            (status, error_message, doc_id, user_id),
        )
        conn.execute(
            """
            UPDATE chat_sessions
            SET status = %s, updated_at = now()
            WHERE id = %s AND doc_id = %s AND user_id = %s
            """,
            (status, session_id, doc_id, user_id),
        )
        conn.commit()


def _mark_ready(doc_id: str, session_id: str, user_id: str, title: str, chunk_count: int) -> None:
    with psycopg.connect(settings.database_url) as conn:
        conn.execute(
            """
            UPDATE documents
            SET status = 'ready', title = %s, chunk_count = %s, error_message = NULL, updated_at = now()
            WHERE id = %s AND user_id = %s
            """,
            (title, chunk_count, doc_id, user_id),
        )
        conn.execute(
            """
            UPDATE chat_sessions
            SET title = %s, status = 'ready', updated_at = now()
            WHERE id = %s AND doc_id = %s AND user_id = %s
            """,
            (title, session_id, doc_id, user_id),
        )
        conn.commit()
