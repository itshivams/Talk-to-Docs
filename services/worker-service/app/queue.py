import json
import time
from dataclasses import dataclass
from typing import Any

from redis import Redis


@dataclass
class RedisQueue:
    client: Redis
    queue_name: str
    processing_queue: str

    def pop(self, timeout: int = 5) -> tuple[str, dict[str, Any]] | None:
        item = self.client.brpoplpush(self.queue_name, self.processing_queue, timeout=timeout)
        if item is None:
            return None
        try:
            return item, json.loads(item)
        except json.JSONDecodeError:
            self.client.lrem(self.processing_queue, 1, item)
            return None

    def ack(self, raw_job: str) -> None:
        self.client.lrem(self.processing_queue, 1, raw_job)

    def retry(self, raw_job: str, job: dict[str, Any], max_attempts: int, delay_seconds: int) -> bool:
        self.ack(raw_job)
        attempt = int(job.get("attempt", 0)) + 1
        if attempt > max_attempts:
            return False
        job["attempt"] = attempt
        time.sleep(delay_seconds * attempt)
        self.client.lpush(self.queue_name, json.dumps(job))
        return True
