import asyncio

from app.core.prompts import MISSING_ANSWER
from app.rag.generator import generate_answer


def test_generate_answer_uses_retrieved_chunks_without_literal_overlap():
    chunks = [
        {
            "text": "Installation starts by creating an account and opening the dashboard. Paste a documentation URL, then wait for ingestion to finish before asking questions.",
            "metadata": {"chunk_index": 0},
            "distance": 0.42,
        }
    ]

    answer = asyncio.run(generate_answer("summarize the workflow", chunks, []))

    assert answer != MISSING_ANSWER
    assert "dashboard" in answer


def test_generate_answer_returns_missing_when_no_chunks():
    answer = asyncio.run(generate_answer("anything", [], []))

    assert answer == MISSING_ANSWER
