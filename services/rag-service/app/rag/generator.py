import json
import re
from collections.abc import AsyncIterator
from typing import Any

import httpx

from app.core.config import settings
from app.core.prompts import MISSING_ANSWER, STRICT_SYSTEM_PROMPT

MODE_INSTRUCTIONS = {
    "ask": "Answer the user's question.",
    "summarize": "Summarize the document context with its main ideas and important details.",
    "explain": "Explain the relevant document context simply, using short clear sentences.",
    "notes": "Create concise Markdown notes with headings and bullets. Use fenced code blocks with a language tag for code.",
    "quiz": """Create 3 to 5 multiple-choice quiz questions from the documentation.
Each question must have a Markdown heading formatted as '### Question N', a concrete question, four concrete options labeled A. through D., one line formatted 'Correct answer: X', and one line formatted 'Explanation: ...'.
Do not write placeholder words such as 'Question text' or 'Option text'. Do not use tables.""",
    "actions": "Extract action items, steps, or decisions supported by the document. Say when none are present.",
}


async def generate_answer(question: str, chunks: list[dict[str, Any]], history: list[dict[str, Any]], mode: str = "ask") -> str:
    if not chunks:
        return MISSING_ANSWER

    relevant = _filter_relevant(question, chunks)
    if mode == "ask" and not relevant and _looks_external_fact_request(question):
        return MISSING_ANSWER
    answer_chunks = relevant or chunks[: settings.top_k]

    if settings.ollama_base_url:
        answer = await _generate_with_ollama(question, answer_chunks, history, mode)
        if answer:
            return _usable_quiz(answer, answer_chunks) if mode == "quiz" else answer

    if mode == "quiz":
        return _quiz_fallback(answer_chunks)
    return _extractive_answer(question, answer_chunks)


async def stream_answer(question: str, chunks: list[dict[str, Any]], history: list[dict[str, Any]], mode: str = "ask") -> AsyncIterator[str]:
    if not chunks:
        yield MISSING_ANSWER
        return

    relevant = _filter_relevant(question, chunks)
    if mode == "ask" and not relevant and _looks_external_fact_request(question):
        yield MISSING_ANSWER
        return
    answer_chunks = relevant or chunks[: settings.top_k]
    if settings.ollama_base_url and mode == "quiz":
        answer = await _generate_with_ollama(question, answer_chunks, history, mode)
        answer = _usable_quiz(answer or "", answer_chunks)
        for part in re.findall(r"\S+\s*", answer):
            yield part
        return

    if settings.ollama_base_url:
        streamed = False
        async for token in _stream_with_ollama(question, answer_chunks, history, mode):
            streamed = True
            yield token
        if streamed:
            return

    answer = _extractive_answer(question, answer_chunks)
    for part in re.findall(r"\S+\s*", answer):
        yield part


async def _generate_with_ollama(question: str, chunks: list[dict[str, Any]], history: list[dict[str, Any]], mode: str) -> str | None:
    prompt = _ollama_prompt(question, chunks, history, mode)
    try:
        async with httpx.AsyncClient(timeout=settings.llm_timeout_seconds) as client:
            response = await client.post(
                f"{settings.ollama_base_url.rstrip('/')}/api/generate",
                json=_ollama_payload(prompt, stream=False),
            )
            response.raise_for_status()
            text = response.json().get("response", "").strip()
            return text or None
    except Exception:
        return None


async def _stream_with_ollama(question: str, chunks: list[dict[str, Any]], history: list[dict[str, Any]], mode: str) -> AsyncIterator[str]:
    prompt = _ollama_prompt(question, chunks, history, mode)
    try:
        async with httpx.AsyncClient(timeout=settings.llm_timeout_seconds) as client:
            async with client.stream(
                "POST",
                f"{settings.ollama_base_url.rstrip('/')}/api/generate",
                json=_ollama_payload(prompt, stream=True),
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line:
                        continue
                    payload = json.loads(line)
                    token = str(payload.get("response", ""))
                    if token:
                        yield token
                    if payload.get("done"):
                        return
    except Exception:
        return


def _ollama_prompt(question: str, chunks: list[dict[str, Any]], history: list[dict[str, Any]], mode: str) -> str:
    context = "\n\n".join(
        f"[Source {i + 1}]\n{chunk['text']}"
        for i, chunk in enumerate(chunks)
    )
    history_text = "\n".join(f"{m.get('role')}: {m.get('content')}" for m in history[-settings.max_history_messages :])
    instruction = MODE_INSTRUCTIONS.get(mode, MODE_INSTRUCTIONS["ask"])
    return f"""{STRICT_SYSTEM_PROMPT}

Documentation context:
{context}

Previous chat history for follow-up resolution only:
{history_text}

Question:
{question}

Task:
{instruction}

Use Markdown when it improves readability. For any code block use triple backticks and include the language name after the opening fence.
Write a concise, natural answer in your own words using only the documentation context.
Cite evidence with clean markers such as [Source 1]. Never show chunk numbers, never write labels such as [source 1 | chunk 7], and do not add a colon after a source marker.

Answer:"""


def _ollama_payload(prompt: str, *, stream: bool) -> dict[str, Any]:
    return {
        "model": settings.ollama_model,
        "prompt": prompt,
        "stream": stream,
        "options": {
            "temperature": 0.2,
            "top_p": 0.9,
            "num_predict": 450,
        },
    }


def _usable_quiz(answer: str, chunks: list[dict[str, Any]]) -> str:
    required = ("### Question", "Correct answer:", "Explanation:")
    placeholders = ("question text", "option text", "correct answer: x")
    lowered = answer.lower()
    if all(marker.lower() in lowered for marker in required) and not any(marker in lowered for marker in placeholders):
        return answer
    return _quiz_fallback(chunks)


def _quiz_fallback(chunks: list[dict[str, Any]]) -> str:
    facts: list[str] = []
    for chunk in chunks:
        for sentence in re.split(r"(?<=[.!?])\s+|\n+", str(chunk.get("text", ""))):
            cleaned = " ".join(sentence.split()).strip(" -*")
            if 45 <= len(cleaned) <= 220 and cleaned not in facts:
                facts.append(cleaned)
            if len(facts) == 3:
                break
        if len(facts) == 3:
            break

    if not facts:
        return _extractive_answer("quiz", chunks)

    sections: list[str] = []
    for index, fact in enumerate(facts, start=1):
        options = [
            fact,
            "The document says this topic has no defined behavior.",
            "The document requires an unrelated external source for every step.",
            "The document describes the opposite result without exceptions.",
        ]
        sections.append(
            "\n".join(
                [
                    f"### Question {index}",
                    "Which statement is supported by the document?",
                    *(f"{letter}. {option}" for letter, option in zip("ABCD", options, strict=False)),
                    "Correct answer: A",
                    f"Explanation: {fact}",
                ]
            )
        )
    return "\n\n".join(sections)


def _filter_relevant(question: str, chunks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    q_terms = _terms(question)
    if not q_terms:
        return chunks[: settings.top_k]
    scored: list[tuple[int, dict[str, Any]]] = []
    for chunk in chunks:
        text_terms = _terms(chunk["text"])
        overlap = len(q_terms & text_terms)
        if overlap > 0:
            scored.append((overlap, chunk))
    scored.sort(key=lambda item: (item[0], -item[1].get("distance", 1.0)), reverse=True)
    return [chunk for _, chunk in scored[: settings.top_k]]


def _looks_external_fact_request(question: str) -> bool:
    lowered = question.lower()
    return bool(
        re.search(r"\bwho\s+is\b", lowered)
        or re.search(r"\b(current|today|latest)\b", lowered)
        or re.search(r"\b(pm|prime minister|president|weather|news|stock price)\b", lowered)
    )


def _extractive_answer(question: str, chunks: list[dict[str, Any]]) -> str:
    q_terms = _terms(question)
    sentences: list[tuple[int, str]] = []
    fallback_sentences: list[str] = []
    for chunk in chunks:
        for sentence in re.split(r"(?<=[.!?])\s+|\n+", chunk["text"]):
            cleaned = " ".join(sentence.split())
            if len(cleaned) < 40:
                continue
            fallback_sentences.append(cleaned)
            overlap = len(q_terms & _terms(cleaned))
            if overlap:
                sentences.append((overlap, cleaned))

    if sentences:
        sentences.sort(key=lambda item: item[0], reverse=True)
        answer_sentences = [sentence for _, sentence in sentences[:4]]
    else:
        answer_sentences = fallback_sentences[:4]

    if not answer_sentences:
        excerpts = [" ".join(chunk.get("text", "").split()) for chunk in chunks]
        answer_sentences = [excerpt[:500] for excerpt in excerpts if excerpt]

    if not answer_sentences:
        return MISSING_ANSWER

    return " ".join(answer_sentences)


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
