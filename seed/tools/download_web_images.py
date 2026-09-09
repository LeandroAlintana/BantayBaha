#!/usr/bin/env python3
"""Build the web-sourced + trap portion of the BantayBahaAI demo photo set.

For each selected Wikimedia Commons file this script:

1. downloads a 1600px-wide JPEG rendition (via Special:FilePath, which
   redirects to the CDN thumb — smaller than the multi-MB original, which
   also matters when the seed set is committed to git);
2. strips ALL EXIF/XMP metadata (including any GPS position) by re-encoding
   with Pillow, applying exif_transpose() first so orientation survives the
   EXIF removal;
3. appends an entry to seed/photos/manifest.json mapping the local filename
   to its expected hazard type / severity, the *manual* campus seed
   coordinates, and full source attribution.

Per MVP spec §10.1/§10.2a: web-sourced images are CC-licensed placeholders
for demo diversity — coordinates are approximate (OSM) and must be adjusted
to the real campus in the seed script. Trap images exist so the vision
triage can be shown flagging spam live (quarantine demo).

Usage:
    python download_web_images.py            # download + strip + manifest
    python download_web_images.py --check    # verify existing set only
"""

from __future__ import annotations

import io
import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image, ImageOps

REPO_ROOT = Path(__file__).resolve().parents[2]
PHOTOS_DIR = REPO_ROOT / "seed" / "photos"
MANIFEST_PATH = PHOTOS_DIR / "manifest.json"
RENDITION_WIDTH = 1600
JPEG_QUALITY = 88
UA = "BantayBahaAI-demo-seed/1.0 (hackathon project; contact: local build)"

# Approximate (OSM) campus origin — default example: UP Diliman, Quezon City.
# Adjust these pins to your real campus before the demo (spec §10.2a).
CAMPUS = {
    "campus": "Example campus (UP Diliman, Quezon City)",
    "source": "approximate (OSM) — replace with your campus pins in the seed script",
    "center": {"lat": 14.6539, "lng": 121.0665},
}

SELECTION = [
    {
        "filename": "web-01-drain-clogged-trash.jpg",
        "commons_file": "Sutphin Bl Jamaica Av td (2019-08-18) 14.jpg",
        "role": "web",
        "expected_hazard": "trash_buildup",
        "expected_severity": "MEDIUM",
        "notes": "Street drain inlet packed with litter — doubles as trash-buildup sample.",
        "seed": {"lat": 14.6546, "lng": 121.0636, "landmark": "Near Science Hall rear entrance"},
        "license": "CC BY-SA 4.0",
        "artist": "Tdorante10",
    },
    {
        "filename": "web-02-drain-blocked-leaves.jpg",
        "commons_file": "EMD, Help keep JBM-HH storm water clean this fall 141113-A-CD772-001.jpg",
        "role": "web",
        "expected_hazard": "clogged_drain",
        "expected_severity": "MEDIUM",
        "notes": "Grate blocked by leaves and debris — borderline HIGH, expected MEDIUM.",
        "seed": {"lat": 14.6528, "lng": 121.0678, "landmark": "Lecture Halls walkway"},
        "license": "Public domain (U.S. Army)",
        "artist": "Rachel Larue / JBM-HH",
    },
    {
        "filename": "web-03-drain-storm-clogged.jpg",
        "commons_file": "Storm Drain Clogged - Mid-City New Orleans.jpg",
        "role": "web",
        "expected_hazard": "clogged_drain",
        "expected_severity": "HIGH",
        "notes": "Storm drain surcharging during heavy rain.",
        "seed": {"lat": 14.6561, "lng": 121.0655, "landmark": "Main gate gutter"},
        "license": "CC BY 2.0",
        "artist": "Bart Everson",
    },
    {
        "filename": "web-04-flooding-storm-drains.jpg",
        "commons_file": "Storm drains clogged - heavy rain on 7th avenue = flooding - panoramio.jpg",
        "role": "web",
        "expected_hazard": "standing_water",
        "expected_severity": "HIGH",
        "notes": "Street flooding caused by clogged storm drains — matches the pitch hook.",
        "seed": {"lat": 14.6512, "lng": 121.0649, "landmark": "Student center parking"},
        "license": "CC BY 3.0",
        "artist": "nick hoke (Panoramio)",
    },
    {
        "filename": "web-05-flooding-watery-road.jpg",
        "commons_file": "Watery Road of Karachi.jpg",
        "role": "web",
        "expected_hazard": "standing_water",
        "expected_severity": "HIGH",
        "notes": "Road submerged by monsoon rainwater — reads like a campus access road.",
        "seed": {"lat": 14.6579, "lng": 121.0691, "landmark": "Engineering road crossing"},
        "license": "CC BY-SA 4.0",
        "artist": "Kskhh",
    },
    {
        "filename": "trap-01-selfie.jpg",
        "commons_file": "Kimono selfie in Ebisu.jpg",
        "role": "trap",
        "expected_hazard": None,
        "expected_severity": None,
        "notes": "Person portrait — vision should flag as hazard mismatch -> quarantine.",
        "seed": {"lat": 14.6535, "lng": 121.0662, "landmark": "Dormitory hallway"},
        "license": "CC0",
        "artist": "Syced",
    },
    {
        "filename": "trap-02-unrelated-cat.jpg",
        "commons_file": "Tabby cat with blue eyes-3336579.jpg",
        "role": "trap",
        "expected_hazard": None,
        "expected_severity": None,
        "notes": "Cat portrait — vision should return low confidence / no hazard -> quarantine.",
        "seed": {"lat": 14.6550, "lng": 121.0620, "landmark": "Canteen area"},
        "license": "CC0",
        "artist": "AdinaVoicu",
    },
]


def commons_page_url(commons_file: str) -> str:
    return f"https://commons.wikimedia.org/wiki/File:{urllib.parse.quote(commons_file)}"


def download_rendition(commons_file: str) -> bytes:
    path = urllib.parse.quote(commons_file, safe="")
    url = f"https://commons.wikimedia.org/wiki/Special:FilePath/{path}?width={RENDITION_WIDTH}"
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as resp:
        content_type = resp.headers.get("Content-Type", "")
        data = resp.read()
    if "image/jpeg" not in content_type:
        raise RuntimeError(f"unexpected content type {content_type!r}")
    return data


def strip_metadata(raw: bytes) -> tuple[bytes, dict]:
    """Re-encode so only pixels (+ ICC profile) survive; report EXIF before/after."""
    img = Image.open(io.BytesIO(raw))
    had_exif = bool(img.getexif())
    had_gps = bool(img.getexif().get_ifd(0x8825))
    bytes_before = len(raw)
    img = ImageOps.exif_transpose(img)
    out = io.BytesIO()
    img.save(
        out,
        format="JPEG",
        quality=JPEG_QUALITY,
        optimize=True,
        icc_profile=img.info.get("icc_profile"),
    )
    clean = out.getvalue()
    check = Image.open(io.BytesIO(clean))
    gps_after = check.getexif().get_ifd(0x8825)
    stats = {
        "bytes_before": bytes_before,
        "bytes_after": len(clean),
        "had_exif": had_exif,
        "had_gps": had_gps,
        "exif_tags_after": len(check.getexif()),
        "gps_tags_after": len(gps_after),
        "width": check.width,
        "height": check.height,
        "exif_stripped": not check.getexif() and not gps_after,
    }
    return clean, stats


def build_manifest_entry(item: dict, stats: dict) -> dict:
    if item["role"] == "trap":
        expected = f"quarantine — {item['notes']}"
    else:
        expected = f"{item['expected_hazard']} / {item['expected_severity']}"
    return {
        "filename": item["filename"],
        "role": item["role"],
        "source": "wikimedia_commons",
        "commons_file": item["commons_file"],
        "commons_page": commons_page_url(item["commons_file"]),
        "license": item["license"],
        "artist": item["artist"],
        "expected_hazard": item["expected_hazard"],
        "expected_severity": item["expected_severity"],
        "expected_outcome": expected,
        "seed": {**item["seed"], "campus": CAMPUS["campus"], "source": CAMPUS["source"]},
        "exif_stripped": stats["exif_stripped"],
        "dimensions": {"width": stats["width"], "height": stats["height"]},
    }


def load_manifest() -> dict:
    if MANIFEST_PATH.exists():
        with MANIFEST_PATH.open(encoding="utf-8") as fh:
            return json.load(fh)
    return {
        "description": "BantayBahaAI demo seed photos (MVP spec §10.1)",
        "campus": CAMPUS,
        "images": [],
    }


def download_all() -> int:
    PHOTOS_DIR.mkdir(parents=True, exist_ok=True)
    manifest = load_manifest()
    by_name = {entry["filename"]: entry for entry in manifest["images"]}

    ok = True
    for item in SELECTION:
        name = item["filename"]
        target = PHOTOS_DIR / name
        print(f"-> {name}")
        try:
            raw = download_rendition(item["commons_file"])
        except Exception as exc:  # noqa: BLE001
            print(f"   DOWNLOAD FAILED: {exc}")
            ok = False
            continue
        clean, stats = strip_metadata(raw)
        target.write_bytes(clean)
        print(
            f"   {stats['width']}x{stats['height']}, "
            f"{stats['bytes_before'] / 1024:.0f} KiB -> {stats['bytes_after'] / 1024:.0f} KiB, "
            f"exif before={stats['had_exif']} gps before={stats['had_gps']} -> "
            f"exif tags after={stats['exif_tags_after']}, gps tags after={stats['gps_tags_after']}"
        )
        if not stats["exif_stripped"]:
            print("   WARNING: metadata still present after strip")
            ok = False
        by_name[name] = build_manifest_entry(item, stats)

    manifest["images"] = sorted(by_name.values(), key=lambda e: e["filename"])
    MANIFEST_PATH.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(f"\nmanifest: {MANIFEST_PATH} ({len(manifest['images'])} images)")
    return 0 if ok else 1


def check_set() -> int:
    ok = True
    for item in SELECTION:
        target = PHOTOS_DIR / item["filename"]
        print(f"-> {item['filename']}")
        if not target.exists():
            print("   MISSING")
            ok = False
            continue
        img = Image.open(target)
        exif = img.getexif()
        gps = exif.get_ifd(0x8825)
        status = "OK" if (not exif and not gps) else "METADATA PRESENT"
        print(f"   {img.width}x{img.height}, {target.stat().st_size / 1024:.0f} KiB, exif={status}")
        if exif or gps:
            ok = False
    return 0 if ok else 1


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    mode = sys.argv[1] if len(sys.argv) > 1 else ""
    return check_set() if mode == "--check" else download_all()


if __name__ == "__main__":
    sys.exit(main())
