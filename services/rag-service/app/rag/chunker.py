from dataclasses import dataclass

from app.scraper.parser import ParsedDocument


@dataclass
class Chunk:
    text: str
    chunk_index: int
    heading: str | None


def chunk_document(document: ParsedDocument, max_chars: int = 1400, overlap: int = 180) -> list[Chunk]:
    chunks: list[Chunk] = []
    current: list[str] = []
    current_heading: str | None = None
    current_len = 0

    def flush() -> None:
        nonlocal current, current_len, current_heading
        if not current:
            return
        text = "\n\n".join(current).strip()
        if text:
            chunks.append(Chunk(text=text, chunk_index=len(chunks), heading=current_heading))
        tail = text[-overlap:] if overlap > 0 and len(text) > overlap else ""
        current = [tail] if tail else []
        current_len = len(tail)

    for block in document.blocks:
        block_text = block.text.strip()
        if not block_text:
            continue
        if block.kind == "heading":
            current_heading = block.text
        if current_len + len(block_text) > max_chars:
            flush()
        current.append(block_text)
        current_len += len(block_text)

    flush()
    return chunks
