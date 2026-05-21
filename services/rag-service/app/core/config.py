from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql://talk:talk@postgres:5432/talk_to_docs"
    redis_url: str = "redis://redis:6379/0"
    allowed_origins: str = "http://localhost:3000"
    invalid_url_message: str = "This URL does not appear to be a valid documentation or article page."

    chroma_host: str | None = "chroma"
    chroma_port: int = 8000
    chroma_path: str = "/data/chroma"
    chroma_collection: str = "talk_to_docs_chunks"

    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    embedding_dimensions: int = 384

    ollama_base_url: str | None = "http://ollama:11434"
    ollama_model: str = "llama3.1"
    llm_timeout_seconds: int = 45

    scrape_timeout_seconds: int = 15
    max_page_bytes: int = 2_000_000
    min_text_chars: int = 500
    top_k: int = 5
    max_history_messages: int = 12


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
