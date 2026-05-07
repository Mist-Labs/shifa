from __future__ import annotations

import re
import sys
import textwrap
from pathlib import Path
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import requests
from bs4 import BeautifulSoup
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

from finetune.common import resolve_path, write_json
from finetune.prepare_data import SOURCES


RAW_DIR = resolve_path("data/raw")
WEB_DIR = resolve_path("data/raw/web_sources")


def slugify(value: str) -> str:
    value = re.sub(r"https?://", "", value)
    value = re.sub(r"[^A-Za-z0-9]+", "-", value).strip("-").lower()
    return value[:96] or "source"


def extract_page_text(html: str) -> tuple[str, str]:
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "nav", "footer", "header", "aside"]):
        tag.decompose()
    title = soup.get_text(" ", strip=True)[:160]
    if soup.title and soup.title.string:
        title = soup.title.string.strip()
    main = soup.find("main") or soup.find("article") or soup.body or soup
    text = main.get_text("\n", strip=True)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return title, text


def write_pdf(path: Path, title: str, url: str, text: str) -> None:
    doc = SimpleDocTemplate(str(path), pagesize=A4, title=title)
    styles = getSampleStyleSheet()
    story = [
        Paragraph(title, styles["Title"]),
        Paragraph(f"Source URL: {url}", styles["Normal"]),
        Spacer(1, 12),
    ]
    for block in text.split("\n\n"):
        block = block.strip()
        if not block:
            continue
        wrapped = "<br/>".join(textwrap.wrap(block, width=105))
        story.append(Paragraph(wrapped, styles["BodyText"]))
        story.append(Spacer(1, 8))
    doc.build(story)


def fetch_url(url: str) -> dict[str, object]:
    WEB_DIR.mkdir(parents=True, exist_ok=True)
    headers = {
        "User-Agent": "SHIFA-ResearchBot/1.0 (local clinical guideline source preparation)",
        "Accept": "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8",
    }
    response = requests.get(url, headers=headers, timeout=30)
    response.raise_for_status()

    parsed = urlparse(url)
    slug = slugify(parsed.netloc + parsed.path)
    content_type = response.headers.get("content-type", "").lower()

    if "application/pdf" in content_type or url.lower().endswith(".pdf"):
        out_path = RAW_DIR / f"{slug}.pdf"
        out_path.write_bytes(response.content)
        return {"url": url, "kind": "pdf", "path": str(out_path.relative_to(resolve_path("."))), "bytes": len(response.content)}

    title, text = extract_page_text(response.text)
    text_path = WEB_DIR / f"{slug}.txt"
    pdf_path = WEB_DIR / f"{slug}.pdf"
    text_path.write_text(f"{title}\n{url}\n\n{text}\n", encoding="utf-8")
    write_pdf(pdf_path, title, url, text)
    return {
        "url": url,
        "kind": "html",
        "title": title,
        "text_path": str(text_path.relative_to(resolve_path("."))),
        "pdf_path": str(pdf_path.relative_to(resolve_path("."))),
        "text_chars": len(text),
    }


def main() -> None:
    manifest: dict[str, object] = {
        "policy": (
            "Fetched web pages are local research artifacts for source preparation. "
            "Review source terms before using full text for training or publication."
        ),
        "sources": {},
    }
    for key, source in SOURCES.items():
        results = []
        for url in source.get("urls", []):
            try:
                results.append(fetch_url(url))
                print(f"Fetched {key}: {url}")
            except Exception as exc:
                results.append({"url": url, "error": str(exc)})
                print(f"Failed {key}: {url} ({exc})")
        manifest["sources"][key] = results

    write_json("data/raw/web_sources_manifest.json", manifest)
    print("Manifest: data/raw/web_sources_manifest.json")


if __name__ == "__main__":
    main()
