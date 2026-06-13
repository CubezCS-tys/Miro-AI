"""PDF extraction with page metadata."""

from dataclasses import dataclass

import fitz  # PyMuPDF


@dataclass(frozen=True)
class ExtractedPage:
    page: int
    text: str
    start_char: int
    end_char: int


@dataclass(frozen=True)
class ExtractedDocument:
    text: str
    pages: list[ExtractedPage]


def extract_text(path: str) -> str:
    return extract_document(path).text


def extract_document(path: str) -> ExtractedDocument:
    try:
        pages = _extract_pymupdf(path)
    except Exception:
        pages = []
    if _char_count(pages) < 200:
        fallback_pages = _extract_pdfplumber(path)
        if _char_count(fallback_pages) > _char_count(pages):
            pages = fallback_pages
    if _char_count(pages) < 200:
        raise ValueError(
            "Could not extract text. This PDF may be scanned images (OCR not supported yet)"
        )
    return _with_offsets(pages)


def _extract_pymupdf(path: str) -> list[str]:
    with fitz.open(path) as doc:
        return [page.get_text() for page in doc]


def _extract_pdfplumber(path: str) -> list[str]:
    import pdfplumber

    with pdfplumber.open(path) as pdf:
        return [page.extract_text() or "" for page in pdf.pages]


def _char_count(pages: list[str]) -> int:
    return sum(len(page.strip()) for page in pages)


def _with_offsets(raw_pages: list[str]) -> ExtractedDocument:
    chunks: list[str] = []
    pages: list[ExtractedPage] = []
    cursor = 0
    for index, raw_text in enumerate(raw_pages, start=1):
        text = raw_text.strip()
        if not text:
            continue
        header = f"[Page {index}]\n"
        chunk = f"{header}{text}"
        start = cursor + len(header)
        end = start + len(text)
        chunks.append(chunk)
        pages.append(ExtractedPage(page=index, text=text, start_char=start, end_char=end))
        cursor += len(chunk) + 2
    return ExtractedDocument(text="\n\n".join(chunks), pages=pages)
