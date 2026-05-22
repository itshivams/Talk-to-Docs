import asyncio
from functools import lru_cache
from typing import Any

import psycopg
from fastapi import APIRouter, Header, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.encoders import jsonable_encoder
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from app.core.prompts import MISSING_ANSWER
from app.memory.redis_memory import RedisMemory
from app.models.schemas import ChatRequest, ChatResponse, SourceReference
from app.rag.generator import generate_answer, stream_answer
from app.rag.retriever import Retriever
from app.rag.vector_store import VectorStore

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
    greeting = _greeting_answer(payload.question, session) if payload.mode == "ask" else None
    if greeting:
        _store_turn(payload.session_id, x_user_id, session, payload.question, greeting, [], memory)
        return ChatResponse(answer=greeting, sources=[])
    chunks = Retriever().retrieve(user_id=x_user_id, session_id=payload.session_id, doc_id=session["doc_id"], question=payload.question)
    answer = await generate_answer(payload.question, chunks, history, payload.mode)
    sources = _sources(chunks if answer != MISSING_ANSWER else [])

    _store_turn(payload.session_id, x_user_id, session, payload.question, answer, sources, memory)

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
            try:
                request = await asyncio.wait_for(websocket.receive_json(), timeout=1.5)
            except TimeoutError:
                continue
            if request.get("type") == "ask":
                await _stream_chat_answer(session_id, x_user_id, websocket, request)
                last_signature = ""
    except WebSocketDisconnect:
        return
    except Exception as exc:
        await websocket.send_json({"type": "error", "message": str(exc)[:300]})


def _get_session(session_id: str, user_id: str) -> dict[str, Any]:
    with psycopg.connect(_database_url(), row_factory=dict_row) as conn:
        row = conn.execute(
            """
            SELECT s.id::text, s.user_id::text, s.doc_id::text, s.source_url, s.title,
                s.status, d.title AS document_title, COALESCE(d.error_message, '') AS error_message
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
    suggestions = _suggested_questions(session) if session["status"] == "ready" else []
    return {"session": session, "messages": _get_messages(session_id), "suggestions": suggestions}


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
            str(session.get("error_message", "")),
            str(len(messages)),
            str(latest_message.get("id", "")),
            str(latest_message.get("created_at", "")),
        ]
    )


async def _stream_chat_answer(session_id: str, user_id: str, websocket: WebSocket, request: dict[str, Any]) -> None:
    question = str(request.get("question", "")).strip()
    mode = str(request.get("mode", "ask")).strip() or "ask"
    if mode not in {"ask", "summarize", "explain", "notes", "quiz", "actions"}:
        await websocket.send_json({"type": "error", "message": "unsupported answer mode"})
        return
    if not question or len(question) > 4000:
        await websocket.send_json({"type": "error", "message": "question must be between 1 and 4000 characters"})
        return

    session = _get_session(session_id, user_id)
    if session["status"] != "ready":
        await websocket.send_json({"type": "error", "message": f"document is {session['status']}"})
        return

    memory = RedisMemory()
    history = memory.history(user_id=user_id, session_id=session_id, doc_id=session["doc_id"])
    greeting = _greeting_answer(question, session) if mode == "ask" else None
    if greeting:
        await websocket.send_json(jsonable_encoder({"type": "answer_start", "question": question, "sources": []}))
        await websocket.send_json({"type": "answer_delta", "delta": greeting})
        _store_turn(session_id, user_id, session, question, greeting, [], memory)
        await websocket.send_json({"type": "answer_done", "answer": greeting, "sources": []})
        return
    chunks = Retriever().retrieve(user_id=user_id, session_id=session_id, doc_id=session["doc_id"], question=question)
    sources = _sources(chunks)
    _save_message(session_id, "user", question, [])
    memory.append(user_id=user_id, session_id=session_id, doc_id=session["doc_id"], source_url=session["source_url"], role="user", content=question)
    await websocket.send_json(jsonable_encoder({"type": "answer_start", "question": question, "sources": sources}))

    pieces: list[str] = []
    async for token in stream_answer(question, chunks, history, mode):
        pieces.append(token)
        await websocket.send_json({"type": "answer_delta", "delta": token})

    answer = "".join(pieces).strip() or MISSING_ANSWER
    answer_sources = sources if answer != MISSING_ANSWER else []
    _save_message(session_id, "assistant", answer, [source.model_dump() for source in answer_sources])
    memory.append(
        user_id=user_id,
        session_id=session_id,
        doc_id=session["doc_id"],
        source_url=session["source_url"],
        role="assistant",
        content=answer,
        sources=[source.model_dump() for source in answer_sources],
    )
    _touch_session(session_id, user_id)
    await websocket.send_json(jsonable_encoder({"type": "answer_done", "answer": answer, "sources": answer_sources}))


def _store_turn(
    session_id: str,
    user_id: str,
    session: dict[str, Any],
    question: str,
    answer: str,
    sources: list[SourceReference],
    memory: RedisMemory,
) -> None:
    _save_message(session_id, "user", question, [])
    _save_message(session_id, "assistant", answer, [source.model_dump() for source in sources])
    memory.append(user_id=user_id, session_id=session_id, doc_id=session["doc_id"], source_url=session["source_url"], role="user", content=question)
    memory.append(
        user_id=user_id,
        session_id=session_id,
        doc_id=session["doc_id"],
        source_url=session["source_url"],
        role="assistant",
        content=answer,
        sources=[source.model_dump() for source in sources],
    )
    _touch_session(session_id, user_id)


def _greeting_answer(question: str, session: dict[str, Any]) -> str | None:
    normalized = " ".join(question.lower().split()).strip(" .!?")
    greetings = {"hi", "hello", "hey", "hii", "good morning", "good afternoon", "good evening"}
    if normalized not in greetings:
        return None
    title = session.get("title") or session.get("document_title") or "this document"
    return f"Hi. I am here to help with **{title}**. Ask me anything grounded in this document."


def _suggested_questions(session: dict[str, Any]) -> list[str]:
    return _suggested_questions_cached(session["user_id"], session["id"], session["doc_id"])


@lru_cache(maxsize=256)
def _suggested_questions_cached(user_id: str, session_id: str, doc_id: str) -> list[str]:
    try:
        chunks = VectorStore().session_chunks(user_id=user_id, session_id=session_id, doc_id=doc_id, limit=8)
    except Exception:
        chunks = []
    headings: list[str] = []
    seen: set[str] = set()
    for chunk in chunks:
        heading = str((chunk.get("metadata") or {}).get("heading") or "").strip()
        if heading and heading.lower() not in seen:
            headings.append(heading)
            seen.add(heading.lower())

    suggestions = [
        "What is this document about?",
        "List the key concepts in this document.",
        "What prerequisites or setup steps does this document mention?",
        "Give me examples from this document.",
    ]
    for heading in headings[:2]:
        suggestions.append(f"Explain the section about {heading}.")
    return suggestions[:6]


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
