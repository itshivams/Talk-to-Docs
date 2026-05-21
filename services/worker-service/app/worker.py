import asyncio
import logging
import os

from redis import Redis

from app.queue import RedisQueue
from app.tasks import ingest_job

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger("worker-service")


def env(name: str, fallback: str) -> str:
    return os.getenv(name, fallback)


async def run() -> None:
    redis_url = env("REDIS_URL", "redis://redis:6379/0")
    queue_name = env("INGEST_QUEUE", "ingest_jobs")
    rag_service_url = env("RAG_SERVICE_URL", "http://rag-service:8000")
    max_attempts = int(env("MAX_JOB_ATTEMPTS", "3"))
    retry_delay = int(env("JOB_RETRY_DELAY_SECONDS", "5"))
    timeout_seconds = int(env("INGEST_TIMEOUT_SECONDS", "180"))

    queue = RedisQueue(
        client=Redis.from_url(redis_url, decode_responses=True),
        queue_name=queue_name,
        processing_queue=f"{queue_name}:processing",
    )
    logger.info("worker started queue=%s rag=%s", queue_name, rag_service_url)

    while True:
        popped = queue.pop(timeout=5)
        if popped is None:
            await asyncio.sleep(0.2)
            continue
        raw_job, job = popped
        try:
            result = await ingest_job(rag_service_url, job, timeout_seconds)
            logger.info("ingested doc_id=%s session_id=%s chunks=%s", job.get("doc_id"), job.get("session_id"), result.get("chunks"))
            queue.ack(raw_job)
        except Exception as exc:
            retried = queue.retry(raw_job, job, max_attempts=max_attempts, delay_seconds=retry_delay)
            logger.warning("ingest failed doc_id=%s retried=%s error=%s", job.get("doc_id"), retried, exc)


if __name__ == "__main__":
    asyncio.run(run())
