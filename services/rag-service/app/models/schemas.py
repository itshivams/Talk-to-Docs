from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, HttpUrl


class ValidateURLRequest(BaseModel):
    url: HttpUrl


class IngestRequest(BaseModel):
    user_id: str
    session_id: str
    doc_id: str
    source_url: HttpUrl
    title: str | None = None
    attempt: int = 0


class ChatRequest(BaseModel):
    session_id: str
    question: str = Field(min_length=1, max_length=4000)
    mode: str = Field(default="ask", pattern="^(ask|summarize|explain|notes|quiz|actions)$")


class SourceReference(BaseModel):
    doc_id: str
    session_id: str
    source_url: str
    title: str
    chunk_index: int
    heading: str | None = None
    excerpt: str


class ChatResponse(BaseModel):
    answer: str
    sources: list[SourceReference]


class Message(BaseModel):
    id: str | None = None
    session_id: str
    role: str
    content: str
    sources: list[dict[str, Any]] = []
    created_at: datetime | None = None
