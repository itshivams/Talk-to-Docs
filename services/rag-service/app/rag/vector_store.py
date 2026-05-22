from typing import Any

import chromadb

from app.core.config import settings
from app.rag.chunker import Chunk
from app.rag.embeddings import get_embedder


class VectorStore:
    def __init__(self) -> None:
        if settings.chroma_host:
            self.client = chromadb.HttpClient(host=settings.chroma_host, port=settings.chroma_port)
        else:
            self.client = chromadb.PersistentClient(path=settings.chroma_path)
        self.collection = self.client.get_or_create_collection(settings.chroma_collection, metadata={"hnsw:space": "cosine"})
        self.embedder = get_embedder()

    def upsert_chunks(self, *, user_id: str, session_id: str, doc_id: str, source_url: str, title: str, chunks: list[Chunk]) -> None:
        self.delete_session(session_id=session_id, doc_id=doc_id)
        if not chunks:
            return

        ids = [f"{session_id}:{doc_id}:{chunk.chunk_index}" for chunk in chunks]
        documents = [chunk.text for chunk in chunks]
        embeddings = self.embedder.embed(documents)
        metadatas: list[dict[str, Any]] = []
        for chunk in chunks:
            metadatas.append(
                {
                    "user_id": user_id,
                    "session_id": session_id,
                    "doc_id": doc_id,
                    "source_url": source_url,
                    "title": title,
                    "chunk_index": chunk.chunk_index,
                    "heading": chunk.heading or "",
                }
            )
        self.collection.add(ids=ids, documents=documents, embeddings=embeddings, metadatas=metadatas)

    def query(self, *, user_id: str, session_id: str, doc_id: str, question: str, top_k: int) -> list[dict[str, Any]]:
        embedding = self.embedder.embed([question])[0]
        result = self.collection.query(
            query_embeddings=[embedding],
            n_results=top_k,
            where={"$and": [{"user_id": user_id}, {"session_id": session_id}, {"doc_id": doc_id}]},
            include=["documents", "metadatas", "distances"],
        )
        matches: list[dict[str, Any]] = []
        docs = result.get("documents", [[]])[0]
        metas = result.get("metadatas", [[]])[0]
        distances = result.get("distances", [[]])[0]
        for document, metadata, distance in zip(docs, metas, distances, strict=False):
            matches.append({"text": document, "metadata": metadata, "distance": float(distance)})
        return matches

    def session_chunks(self, *, user_id: str, session_id: str, doc_id: str, limit: int = 8) -> list[dict[str, Any]]:
        result = self.collection.get(
            where={"$and": [{"user_id": user_id}, {"session_id": session_id}, {"doc_id": doc_id}]},
            include=["documents", "metadatas"],
            limit=limit,
        )
        docs = result.get("documents", [])
        metas = result.get("metadatas", [])
        return [{"text": document, "metadata": metadata or {}} for document, metadata in zip(docs, metas, strict=False)]

    def delete_session(self, *, session_id: str, doc_id: str) -> None:
        try:
            self.collection.delete(where={"$and": [{"session_id": session_id}, {"doc_id": doc_id}]})
        except Exception:
            pass
