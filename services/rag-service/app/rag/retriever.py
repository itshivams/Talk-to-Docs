from app.core.config import settings
from app.rag.vector_store import VectorStore


class Retriever:
    def __init__(self) -> None:
        self.store = VectorStore()

    def retrieve(self, *, user_id: str, session_id: str, doc_id: str, question: str) -> list[dict]:
        return self.store.query(
            user_id=user_id,
            session_id=session_id,
            doc_id=doc_id,
            question=question,
            top_k=settings.top_k,
        )
