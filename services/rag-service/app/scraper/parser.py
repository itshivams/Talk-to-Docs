from dataclasses import dataclass

from bs4 import BeautifulSoup, Tag


@dataclass
class ParsedBlock:
    kind: str
    text: str
    heading: str | None = None


@dataclass
class ParsedDocument:
    title: str
    blocks: list[ParsedBlock]
    text: str


def parse_document(soup: BeautifulSoup) -> ParsedDocument:
    title = _title(soup)
    container = soup.find("main") or soup.find("article") or soup.body or soup
    blocks: list[ParsedBlock] = []
    current_heading: str | None = None

    for node in container.find_all(["h1", "h2", "h3", "h4", "p", "li", "pre", "code", "table"], recursive=True):
        if not isinstance(node, Tag):
            continue
        text = _node_text(node)
        if not text:
            continue
        if node.name in {"h1", "h2", "h3", "h4"}:
            current_heading = text
            blocks.append(ParsedBlock(kind="heading", text=text, heading=current_heading))
        elif node.name == "table":
            blocks.append(ParsedBlock(kind="table", text=_table_text(node), heading=current_heading))
        elif node.name in {"pre", "code"}:
            blocks.append(ParsedBlock(kind="code", text=text, heading=current_heading))
        else:
            blocks.append(ParsedBlock(kind="text", text=text, heading=current_heading))

    deduped: list[ParsedBlock] = []
    seen: set[str] = set()
    for block in blocks:
        key = block.text.strip().lower()
        if len(key) < 20 or key in seen:
            continue
        seen.add(key)
        deduped.append(block)

    text = "\n\n".join(block.text for block in deduped)
    return ParsedDocument(title=title, blocks=deduped, text=text)


def _title(soup: BeautifulSoup) -> str:
    title = ""
    if soup.title and soup.title.string:
        title = soup.title.string.strip()
    if not title:
        heading = soup.find("h1")
        title = heading.get_text(" ", strip=True) if heading else "Untitled documentation"
    return " ".join(title.split())[:180]


def _node_text(node: Tag) -> str:
    return " ".join(node.get_text(" ", strip=True).split())


def _table_text(node: Tag) -> str:
    rows: list[str] = []
    for row in node.find_all("tr"):
        cells = [cell.get_text(" ", strip=True) for cell in row.find_all(["th", "td"])]
        if cells:
            rows.append(" | ".join(cells))
    return "\n".join(rows)
