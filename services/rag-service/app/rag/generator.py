import re
from typing import Any

import httpx

from app.core.config import settings
from app.core.prompts import MISSING_ANSWER, STRICT_SYSTEM_PROMPT


async def generate_answer(question: str, chunks: list[dict[str, Any]], history: list[dict[str, Any]]) -> str:
    relevant = _filter_relevant(question, chunks)
    if not relevant:
        return MISSING_ANSWER

    if settings.ollama_base_url:
        answer = await _generate_with_ollama(question, relevant, history)
        if answer:
            return answer

    return _extractive_answer(question, relevant)


async def _generate_with_ollama(question: str, chunks: list[dict[str, Any]], history: list[dict[str, Any]]) -> str | None:
    context = "\n\n".join(
        f"[source {i + 1} | chunk {chunk['metadata'].get('chunk_index')}]\n{chunk['text']}"
        for i, chunk in enumerate(chunks)
    )
    history_text = "\n".join(f"{m.get('role')}: {m.get('content')}" for m in history[-settings.max_history_messages :])
    prompt = f"""{STRICT_SYSTEM_PROMPT}

Documentation context:
{context}

Previous chat history for follow-up resolution only:
{history_text}

Question:
{question}

Answer:"""
    try:
        async with httpx.AsyncClient(timeout=settings.llm_timeout_seconds) as client:
            response = await client.post(
                f"{settings.ollama_base_url.rstrip('/')}/api/generate",
                json={"model": settings.ollama_model, "prompt": prompt, "stream": False},
            )
            response.raise_for_status()
            text = response.json().get("response", "").strip()
            return text or None
    except Exception:
        return None


def _filter_relevant(question: str, chunks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    q_terms = _terms(question)
    if not q_terms:
        return []
    scored: list[tuple[int, dict[str, Any]]] = []
    for chunk in chunks:
        text_terms = _terms(chunk["text"])
        overlap = len(q_terms & text_terms)
        if overlap > 0:
            scored.append((overlap, chunk))
    scored.sort(key=lambda item: (item[0], -item[1].get("distance", 1.0)), reverse=True)
    return [chunk for _, chunk in scored[: settings.top_k]]


def _extractive_answer(question: str, chunks: list[dict[str, Any]]) -> str:
    q_terms = _terms(question)
    sentences: list[tuple[int, str]] = []
    for chunk in chunks:
        for sentence in re.split(r"(?<=[.!?])\s+|\n+", chunk["text"]):
            cleaned = " ".join(sentence.split())
            if len(cleaned) < 40:
                continue
            overlap = len(q_terms & _terms(cleaned))
            if overlap:
                sentences.append((overlap, cleaned))
    if not sentences:
        return MISSING_ANSWER
    sentences.sort(key=lambda item: item[0], reverse=True)
    answer_lines = [sentence for _, sentence in sentences[:4]]
    return "\n".join(f"- {line}" for line in answer_lines)


def _terms(text: str) -> set[str]:
    stop = {
        "the",
        "and",
        "for",
        "with",
        "that",
        "this",
        "from",
        "what",
        "how",
        "why",
        "are",
        "you",
        "can",
        "does",
        "into",
        "using",
    }
    return {token for token in re.findall(r"[a-zA-Z0-9_./:-]{3,}", text.lower()) if token not in stop}
