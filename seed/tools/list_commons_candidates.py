#!/usr/bin/env python3
"""List candidate images on Wikimedia Commons for the BantayBahaAI demo photo set.

Queries the Commons API for each search term, keeps freely-licensed JPEGs
>= MIN_WIDTH wide, and prints a compact review list (title, dimensions,
license, direct URL). Nothing is downloaded by this script; download +
EXIF-strip happens in download_web_images.py once filenames are chosen.

Usage:
    python list_commons_candidates.py
"""

from __future__ import annotations

import json
import re
import sys
import urllib.parse
import urllib.request

API = "https://commons.wikimedia.org/w/api.php"
UA = "BantayBahaAI-demo-seed/1.0 (hackathon project; contact: local build)"
MIN_WIDTH = 800

# Freely licensed on-wiki terms we accept for the demo set.
ALLOWED_LICENSES = re.compile(
    r"(cc0|cc by(-sa)?(-sa)?( [1-4]\.0)?|public domain|pd |pd-|no restrictions|attribution)",
    re.IGNORECASE,
)

SEARCHES = [
    "clogged drain",
    "blocked storm drain",
    "storm drain trash",
    "urban flooding",
    "flooded street",
    "selfie",
    "cat portrait",
]


def query(term: str, limit: int = 30) -> list[dict]:
    params = {
        "action": "query",
        "generator": "search",
        "gsrsearch": f"filetype:bitmap {term}",
        "gsrnamespace": "6",
        "gsrlimit": str(limit),
        "prop": "imageinfo",
        "iiprop": "url|size|extmetadata",
        "iiurlwidth": "1280",
        "format": "json",
    }
    url = f"{API}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.load(resp)

    pages = (data.get("query") or {}).get("pages") or {}
    out = []
    for page in pages.values():
        infos = page.get("imageinfo") or []
        if not infos:
            continue
        info = infos[0]
        title = page.get("title", "")
        if not title.lower().endswith((".jpg", ".jpeg")):
            continue
        width = info.get("width", 0)
        if width < MIN_WIDTH:
            continue
        meta = info.get("extmetadata") or {}

        def md(key: str) -> str:
            val = (meta.get(key) or {}).get("value", "") or ""
            return re.sub(r"<[^>]+>", "", val).strip()

        license_name = md("LicenseShortName") or md("UsageTerms")
        if not ALLOWED_LICENSES.search(license_name):
            continue
        out.append(
            {
                "title": title,
                "w": width,
                "h": info.get("height", 0),
                "license": license_name,
                "artist": md("Artist")[:60],
                "url": info.get("url", "").split("?")[0],
                "desc": md("ImageDescription")[:110],
            }
        )
    out.sort(key=lambda r: r["title"].lower())
    return out


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    for term in SEARCHES:
        print(f"\n=== SEARCH: {term!r} ===")
        try:
            rows = query(term)
        except Exception as exc:  # noqa: BLE001 - report and continue
            print(f"  ERROR: {exc}")
            continue
        if not rows:
            print("  (no freely-licensed JPEG candidates >= 800px)")
            continue
        for row in rows:
            print(f"- {row['title']}")
            print(f"    {row['w']}x{row['h']} | {row['license']} | {row['artist']}")
            if row["desc"]:
                print(f"    desc: {row['desc']}")
            print(f"    {row['url']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
