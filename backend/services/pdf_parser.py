"""PDF -> plain text. PyMuPDF primary (fast, robust), pdfplumber fallback."""

import fitz  # PyMuPDF


def extract_text(path: str) -> str:
    try:
        text = _extract_pymupdf(path)
    except Exception:
        text = ""
    if len(text.strip()) < 200:
        # Scanned or oddly-encoded PDF; pdfplumber sometimes recovers more.
        fallback = _extract_pdfplumber(path)
        if len(fallback.strip()) > len(text.strip()):
            text = fallback
    if len(text.strip()) < 200:
        raise ValueError(
            "Could not extract text — this PDF may be scanned images (OCR not supported yet)"
        )
    return text


def _extract_pymupdf(path: str) -> str:
    with fitz.open(path) as doc:
        return "\n\n".join(page.get_text() for page in doc)


def _extract_pdfplumber(path: str) -> str:
    import pdfplumber

    with pdfplumber.open(path) as pdf:
        return "\n\n".join(page.extract_text() or "" for page in pdf.pages)
