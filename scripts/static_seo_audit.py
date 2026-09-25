#!/usr/bin/env python3
"""Lightweight static-site SEO and link audit for ohrana.tech-style sites.

No third-party dependencies. The scanner understands common Apache 301
redirects, noindex pages and HTML meta-refresh aliases so technical transition
pages are not reported as normal indexable landing pages.
"""

from __future__ import annotations

import argparse
import re
import sys
from collections import defaultdict
from dataclasses import dataclass, field
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit
import xml.etree.ElementTree as ET


SKIP_DIRS = {".git", "node_modules", ".github", ".idea", ".vscode"}


@dataclass
class Page:
    path: Path
    title: str = ""
    h1: list[str] = field(default_factory=list)
    canonical: str = ""
    robots: str = ""
    meta_refresh: str = ""
    links: list[str] = field(default_factory=list)
    images_without_alt: int = 0


class PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.page = Page(Path("."))
        self._in_title = False
        self._h1_depth = 0
        self._title_parts: list[str] = []
        self._h1_parts: list[str] = []

    def handle_starttag(self, tag: str, attrs) -> None:
        data = {k.lower(): (v or "") for k, v in attrs}
        tag = tag.lower()

        if tag == "title":
            self._in_title = True
            self._title_parts = []
        elif tag == "h1":
            self._h1_depth += 1
            self._h1_parts = []
        elif tag == "a" and data.get("href"):
            self.page.links.append(data["href"].strip())
        elif tag == "img" and "alt" not in data:
            self.page.images_without_alt += 1
        elif tag == "link":
            rel = {x.strip().lower() for x in data.get("rel", "").split()}
            if "canonical" in rel and data.get("href"):
                self.page.canonical = data["href"].strip()
        elif tag == "meta":
            name = data.get("name", "").strip().lower()
            http_equiv = data.get("http-equiv", "").strip().lower()
            if name == "robots":
                self.page.robots = data.get("content", "").strip()
            if http_equiv == "refresh":
                self.page.meta_refresh = data.get("content", "").strip()

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag == "title" and self._in_title:
            self._in_title = False
            self.page.title = " ".join("".join(self._title_parts).split())
        elif tag == "h1" and self._h1_depth:
            self._h1_depth -= 1
            text = " ".join("".join(self._h1_parts).split())
            self.page.h1.append(text)
            self._h1_parts = []

    def handle_data(self, data: str) -> None:
        if self._in_title:
            self._title_parts.append(data)
        if self._h1_depth:
            self._h1_parts.append(data)


def is_service_verification_file(path: Path) -> bool:
    """Ignore search-engine ownership verification HTML files."""
    name = path.name.lower()
    return name.startswith("google") or name.startswith("yandex_")


def iter_html(root: Path):
    for path in root.rglob("*.html"):
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        if is_service_verification_file(path):
            continue
        yield path


def parse_page(path: Path) -> Page:
    parser = PageParser()
    parser.page.path = path
    try:
        parser.feed(path.read_text(encoding="utf-8", errors="replace"))
    except Exception as exc:
        print(f"ERROR parse {path}: {exc}")
    return parser.page


def file_url(root: Path, path: Path) -> str:
    """Map a repository HTML path to its normal public URL path."""
    rel = path.relative_to(root).as_posix()
    if rel == "index.html":
        return "/"
    if rel.endswith("/index.html"):
        return "/" + rel[: -len("index.html")]
    return "/" + rel


def apache_redirect_sources(root: Path) -> set[str]:
    """Read simple Redirect 301/permanent sources from .htaccess."""
    htaccess = root / ".htaccess"
    if not htaccess.exists():
        return set()
    text = htaccess.read_text(encoding="utf-8", errors="replace")
    pattern = re.compile(r"^\s*Redirect\s+(?:301|permanent)\s+(\S+)", re.I | re.M)
    return {match.group(1) for match in pattern.finditer(text)}


def homepage_has_http_canonical(root: Path) -> bool:
    """Recognize the project's Apache Link rel=canonical header for '/'."""
    htaccess = root / ".htaccess"
    if not htaccess.exists():
        return False
    text = htaccess.read_text(encoding="utf-8", errors="replace")
    lowered = text.lower()
    return (
        "header set link" in lowered
        and "rel=\\\"canonical\\\"" in lowered
        and "https://ohrana.tech/" in lowered
        and "request_uri" in lowered
        and "^/$" in text
    )


def is_nonindex_page(root: Path, page: Page, redirect_sources: set[str]) -> bool:
    robots = page.robots.lower()
    return (
        "noindex" in robots
        or bool(page.meta_refresh)
        or file_url(root, page.path) in redirect_sources
    )


def local_target_exists(root: Path, source: Path, href: str) -> bool:
    href = href.strip()
    if not href or href.startswith(("#", "mailto:", "tel:", "javascript:", "data:")):
        return True

    parsed = urlsplit(href)
    if parsed.scheme in {"http", "https"} or parsed.netloc:
        return True

    raw_path = parsed.path
    if not raw_path:
        return True

    if raw_path.startswith("/"):
        candidate = root / raw_path.lstrip("/")
    else:
        candidate = source.parent / raw_path

    candidates = [candidate]
    if raw_path.endswith("/"):
        candidates.append(candidate / "index.html")
    elif not candidate.suffix:
        candidates.extend([candidate / "index.html", candidate.with_suffix(".html")])

    return any(p.exists() for p in candidates)


def sitemap_findings(root: Path) -> list[str]:
    sitemap = root / "sitemap.xml"
    if not sitemap.exists():
        return ["WARN sitemap.xml not found"]

    try:
        tree = ET.parse(sitemap)
    except Exception as exc:
        return [f"ERROR sitemap.xml is not valid XML: {exc}"]

    locs: list[str] = []
    for element in tree.iter():
        if element.tag.endswith("loc") and element.text:
            locs.append(element.text.strip())

    findings: list[str] = []
    seen: set[str] = set()
    duplicates: set[str] = set()
    for url in locs:
        if url in seen:
            duplicates.add(url)
        seen.add(url)

    for url in sorted(duplicates):
        findings.append(f"ERROR duplicate sitemap URL: {url}")
    if not locs:
        findings.append("WARN sitemap.xml contains no <loc> URLs")
    return findings


def audit(root: Path) -> tuple[int, int, list[str]]:
    pages = [parse_page(p) for p in iter_html(root)]
    findings: list[str] = []
    errors = 0

    titles: dict[str, list[Path]] = defaultdict(list)
    canonicals: dict[str, list[Path]] = defaultdict(list)
    redirects = apache_redirect_sources(root)
    home_http_canonical = homepage_has_http_canonical(root)

    for page in pages:
        rel = page.path.relative_to(root)
        nonindex = is_nonindex_page(root, page, redirects)

        # Link integrity still matters even for redirect/noindex helper pages.
        for href in page.links:
            if not local_target_exists(root, page.path, href):
                findings.append(f"ERROR {rel}: broken local link -> {href}")
                errors += 1

        if nonindex:
            continue

        if not page.title:
            findings.append(f"ERROR {rel}: missing <title>")
            errors += 1
        else:
            titles[page.title].append(rel)

        if len(page.h1) != 1:
            findings.append(f"WARN  {rel}: expected 1 H1, found {len(page.h1)}")

        canonical = page.canonical
        if rel.as_posix() == "index.html" and not canonical and home_http_canonical:
            canonical = "https://ohrana.tech/"

        if not canonical:
            findings.append(f"WARN  {rel}: missing canonical")
        else:
            canonicals[canonical].append(rel)

        if page.images_without_alt:
            findings.append(
                f"WARN  {rel}: {page.images_without_alt} image(s) without alt attribute"
            )

    for title, paths in sorted(titles.items()):
        if len(paths) > 1:
            joined = ", ".join(str(p) for p in paths)
            findings.append(f"ERROR duplicate title: {title!r} -> {joined}")
            errors += 1

    for canonical, paths in sorted(canonicals.items()):
        if len(paths) > 1:
            joined = ", ".join(str(p) for p in paths)
            findings.append(f"WARN  canonical used by multiple indexable files: {canonical} -> {joined}")

    for item in sitemap_findings(root):
        findings.append(item)
        if item.startswith("ERROR"):
            errors += 1

    return len(pages), errors, findings


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("root", nargs="?", default=".", help="site repository root")
    parser.add_argument("--strict", action="store_true", help="exit 1 when errors are found")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    if not root.exists():
        print(f"ERROR root does not exist: {root}")
        return 2

    page_count, errors, findings = audit(root)
    print(f"Static SEO audit: {page_count} HTML page(s), {errors} error(s)")
    for finding in findings:
        print(finding)

    if not findings:
        print("OK no findings")

    return 1 if args.strict and errors else 0


if __name__ == "__main__":
    sys.exit(main())
