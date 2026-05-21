import asyncio
from typing import Any

import psycopg
from fastapi import APIRouter, Header, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.encoders import jsonable_encoder
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from app.core.prompts import MISSING_ANSWER
from app.memory.redis_memory import RedisMemory
from app.models.schemas import ChatRequest, ChatResponse, SourceReference
from app.rag.generator import generate_answer
from app.rag.retriever import Retriever

router = APIRouter()


@router.post("/chat", response_model=ChatResponse)
async def chat(payload: ChatRequest, x_user_id: str = Header(default="")) -> ChatResponse:
    if not x_user_id:
        raise HTTPException(status_code=401, detail="missing authenticated user")
    session = _get_session(payload.session_id, x_user_id)
    if session["status"] != "ready":
        raise HTTPException(status_code=409, detail=f"document is {session['status']}")

    memory = RedisMemory()
    history = memory.history(user_id=x_user_id, session_id=payload.session_id, doc_id=session["doc_id"])
    chunks = Retriever().retrieve(user_id=x_user_id, session_id=payload.session_id, doc_id=session["doc_id"], question=payload.question)
    answer = await generate_answer(payload.question, chunks, history)
    sources = _sources(chunks if answer != MISSING_ANSWER else [])

    _save_message(payload.session_id, "user", payload.question, [])
    _save_message(payload.session_id, "assistant", answer, [source.model_dump() for source in sources])
    memory.append(user_id=x_user_id, session_id=payload.session_id, doc_id=session["doc_id"], source_url=session["source_url"], role="user", content=payload.question)
    memory.append(
        user_id=x_user_id,
        session_id=payload.session_id,
        doc_id=session["doc_id"],
        source_url=session["source_url"],
        role="assistant",
        content=answer,
        sources=[source.model_dump() for source in sources],
    )
    _touch_session(payload.session_id, x_user_id)

    return ChatResponse(answer=answer, sources=sources)


@router.get("/chat/{session_id}/messages")
def messages(session_id: str, x_user_id: str = Header(default="")) -> dict[str, Any]:
    if not x_user_id:
        raise HTTPException(status_code=401, detail="missing authenticated user")
    _get_session(session_id, x_user_id)
    with psycopg.connect(_database_url(), row_factory=dict_row) as conn:
        rows = conn.execute(
            """
            SELECT id::text, session_id::text, role, content, sources, created_at
            FROM messages
            WHERE session_id = %s
            ORDER BY created_at ASC
            """,
            (session_id,),
        ).fetchall()
    return {"messages": rows}


@router.websocket("/chat/{session_id}/stream")
async def stream(session_id: str, websocket: WebSocket, x_user_id: str = Header(default="")) -> None:
    if not x_user_id:
        await websocket.close(code=1008)
        return

    try:
        _get_session(session_id, x_user_id)
    except HTTPException:
        await websocket.close(code=1008)
        return

    await websocket.accept()
    last_signature = ""

    try:
        while True:
            payload = _session_snapshot(session_id, x_user_id)
            signature = _snapshot_signature(payload)
            if signature != last_signature:
                await websocket.send_json(jsonable_encoder({"type": "snapshot", **payload}))
                last_signature = signature
            await asyncio.sleep(2)
    except WebSocketDisconnect:
        return


def _get_session(session_id: str, user_id: str) -> dict[str, Any]:
    with psycopg.connect(_database_url(), row_factory=dict_row) as conn:
        row = conn.execute(
            """
            SELECT s.id::text, s.user_id::text, s.doc_id::text, s.source_url, s.title,
                s.status, d.title AS document_title
            FROM chat_sessions s
            JOIN documents d ON d.id = s.doc_id
            WHERE s.id = %s AND s.user_id = %s
            """,
            (session_id, user_id),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="session not found")
    return row


def _session_snapshot(session_id: str, user_id: str) -> dict[str, Any]:
    session = _get_session(session_id, user_id)
    return {"session": session, "messages": _get_messages(session_id)}


def _get_messages(session_id: str) -> list[dict[str, Any]]:
    with psycopg.connect(_database_url(), row_factory=dict_row) as conn:
        return conn.execute(
            """
            SELECT id::text, session_id::text, role, content, sources, created_at
            FROM messages
            WHERE session_id = %s
            ORDER BY created_at ASC
            """,
            (session_id,),
        ).fetchall()


def _snapshot_signature(payload: dict[str, Any]) -> str:
    session = payload["session"]
    messages = payload["messages"]
    latest_message = messages[-1] if messages else {}
    return "|".join(
        [
            str(session.get("status", "")),
            str(session.get("updated_at", "")),
            str(len(messages)),
            str(latest_message.get("id", "")),
            str(latest_message.get("created_at", "")),
        ]
    )


def _save_message(session_id: str, role: str, content: str, sources: list[dict[str, Any]]) -> None:
    with psycopg.connect(_database_url()) as conn:
        conn.execute(
            """
            INSERT INTO messages (session_id, role, content, sources)
            VALUES (%s, %s, %s, %s)
            """,
            (session_id, role, content, Jsonb(sources)),
        )
        conn.commit()


def _touch_session(session_id: str, user_id: str) -> None:
    with psycopg.connect(_database_url()) as conn:
        conn.execute("UPDATE chat_sessions SET updated_at = now() WHERE id = %s AND user_id = %s", (session_id, user_id))
        conn.commit()


def _sources(chunks: list[dict[str, Any]]) -> list[SourceReference]:
    refs: list[SourceReference] = []
    seen: set[tuple[str, int]] = set()
    for chunk in chunks:
        meta = chunk.get("metadata") or {}
        key = (str(meta.get("doc_id")), int(meta.get("chunk_index", 0)))
        if key in seen:
            continue
        seen.add(key)
        excerpt = " ".join(str(chunk.get("text", "")).split())[:320]
        refs.append(
            SourceReference(
                doc_id=str(meta.get("doc_id", "")),
                session_id=str(meta.get("session_id", "")),
                source_url=str(meta.get("source_url", "")),
                title=str(meta.get("title", "")),
                chunk_index=int(meta.get("chunk_index", 0)),
                heading=str(meta.get("heading") or "") or None,
                excerpt=excerpt,
            )
        )
    return refs


def _database_url() -> str:
    from app.core.config import settings

    return settings.database_url
