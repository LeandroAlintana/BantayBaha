#!/usr/bin/env python3
"""Verify the selected Commons files resolve via Special:FilePath (?width=1600)."""

import sys
import urllib.parse
import urllib.request

UA = "BantayBahaAI-demo-seed/1.0 (verify pass)"

FILES = [
    "Sutphin Bl Jamaica Av td (2019-08-18) 14.jpg",
    "EMD, Help keep JBM-HH storm water clean this fall 141113-A-CD772-001.jpg",
    "Granville Road Gully - 2.jpg",
    "Storm Drain Clogged - Mid-City New Orleans.jpg",
    "Storm drains clogged - heavy rain on 7th avenue = flooding - panoramio.jpg",
    "Watery Road of Karachi.jpg",
    "Kimono selfie in Ebisu.jpg",
    "Tabby cat with blue eyes-3336579.jpg",
]

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

for name in FILES:
    url = (
        "https://commons.wikimedia.org/wiki/Special:FilePath/"
        + urllib.parse.quote(name)
        + "?width=1600"
    )
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            final = resp.geturl()
            size = len(resp.read())
            print(f"OK   {resp.status} {size/1024:.0f} KiB  {name}")
            print(f"     -> {final}")
    except Exception as exc:  # noqa: BLE001
        print(f"FAIL {name}: {exc}")
