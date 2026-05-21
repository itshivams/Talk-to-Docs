import hashlib
import math
import re
from functools import lru_cache

import numpy as np

from app.core.config import settings


class EmbeddingProvider:
    def __init__(self) -> None:
        self.dimensions = settings.embedding_dimensions
        self._model = None
        try:
            from sentence_transformers import SentenceTransformer

            self._model = SentenceTransformer(settings.embedding_model)
            dims = self._model.get_sentence_embedding_dimension()
            if dims:
                self.dimensions = int(dims)
        except Exception:
            self._model = None

    def embed(self, texts: list[str]) -> list[list[float]]:
        if self._model is not None:
            vectors = self._model.encode(texts, normalize_embeddings=True)
            return [vector.astype(float).tolist() for vector in vectors]
        return [self._hash_embedding(text) for text in texts]

    def _hash_embedding(self, text: str) -> list[float]:
        vector = np.zeros(self.dimensions, dtype=np.float32)
        for token in re.findall(r"[a-zA-Z0-9_./:-]+", text.lower()):
            digest = hashlib.sha256(token.encode("utf-8")).digest()
            idx = int.from_bytes(digest[:4], "big") % self.dimensions
            sign = 1.0 if digest[4] % 2 == 0 else -1.0
            vector[idx] += sign
        norm = math.sqrt(float(np.dot(vector, vector)))
        if norm > 0:
            vector = vector / norm
        return vector.astype(float).tolist()


@lru_cache
def get_embedder() -> EmbeddingProvider:
    return EmbeddingProvider()
