import json
from typing import Any

from redis import Redis

from app.core.config import settings


class RedisMemory:
    def __init__(self) -> None:
        self.client = Redis.from_url(settings.redis_url, decode_responses=True)

    def key(self, user_id: str, session_id: str, doc_id: str) -> str:
        return f"memory:{user_id}:{session_id}:{doc_id}"

    def append(self, *, user_id: str, session_id: str, doc_id: str, source_url: str, role: str, content: str, sources: list[dict[str, Any]] | None = None) -> None:
        key = self.key(user_id, session_id, doc_id)
        payload = {
            "user_id": user_id,
            "session_id": session_id,
            "doc_id": doc_id,
            "source_url": source_url,
            "role": role,
            "content": content,
            "sources": sources or [],
        }
        pipe = self.client.pipeline()
        pipe.rpush(key, json.dumps(payload))
        pipe.ltrim(key, -settings.max_history_messages, -1)
        pipe.expire(key, 60 * 60 * 24 * 14)
        pipe.execute()

    def history(self, *, user_id: str, session_id: str, doc_id: str) -> list[dict[str, Any]]:
        values = self.client.lrange(self.key(user_id, session_id, doc_id), -settings.max_history_messages, -1)
        history: list[dict[str, Any]] = []
        for value in values:
            try:
                history.append(json.loads(value))
            except json.JSONDecodeError:
                continue
        return history
