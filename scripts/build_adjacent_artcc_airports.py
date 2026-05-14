#!/usr/bin/env python3
"""
Build static adjacent ARTCC airport master list from FAA NASR APT CSV data.

Output:
  zfw_adjacent_artcc_airports.js

Usage:
  python scripts/build_adjacent_artcc_airports.py

This script is intended to be run only when the adjacent ARTCC static master list needs to be refreshed.
The website itself uses the saved .js file directly.
"""

from __future__ import annotations

import csv
import io
import json
import re
import urllib.request
import zipfile
from pathlib import Path
from typing import Dict, Iterable, Tuple


CYCLE_PAGE = "https://www.faa.gov/air_traffic/flight_info/aeronav/aero_data/NASR_Subscription/2026-05-14/"
APT_ZIP_URL = "https://nfdc.faa.gov/webContent/28DaySub/extra/14_May_2026_APT_CSV.zip"

ADJACENT_ARTCC_INFO = {
    "ZHU": {"name": "Houston ARTCC", "fdcd": "281-230-5622"},
    "ZAB": {"name": "Albuquerque ARTCC", "fdcd": "505-856-4561"},
    "ZKC": {"name": "Kansas City ARTCC", "fdcd": "913-254-8508"},
    "ZME": {"name": "Memphis ARTCC", "fdcd": "901-368-8453/8449"},
}

# Static fallback and corrections. These are always preserved even if a field in NASR changes
# or if a row does not expose the ARTCC in an easy-to-parse column.
STATIC_ADJACENT_OVERRIDES = {
    "MEM": {"center": "ZME", "name": "MEMPHIS INTL"},
    "KMEM": {"center": "ZME", "name": "MEMPHIS INTL"},
    "LIT": {"center": "ZME", "name": "BILL AND HILLARY CLINTON NATL/ADAMS FIELD"},
    "KLIT": {"center": "ZME", "name": "BILL AND HILLARY CLINTON NATL/ADAMS FIELD"},
    "FSM": {"center": "ZME", "name": "FORT SMITH RGNL"},
    "KFSM": {"center": "ZME", "name": "FORT SMITH RGNL"},
    "IAH": {"center": "ZHU", "name": "GEORGE BUSH INTERCONTINENTAL/HOUSTON"},
    "KIAH": {"center": "ZHU", "name": "GEORGE BUSH INTERCONTINENTAL/HOUSTON"},
    "HOU": {"center": "ZHU", "name": "WILLIAM P HOBBY"},
    "KHOU": {"center": "ZHU", "name": "WILLIAM P HOBBY"},
    "AUS": {"center": "ZHU", "name": "AUSTIN-BERGSTROM INTL"},
    "KAUS": {"center": "ZHU", "name": "AUSTIN-BERGSTROM INTL"},
    "SAT": {"center": "ZHU", "name": "SAN ANTONIO INTL"},
    "KSAT": {"center": "ZHU", "name": "SAN ANTONIO INTL"},
    "ABQ": {"center": "ZAB", "name": "ALBUQUERQUE INTL SUNPORT"},
    "KABQ": {"center": "ZAB", "name": "ALBUQUERQUE INTL SUNPORT"},
    "AMA": {"center": "ZAB", "name": "RICK HUSBAND AMARILLO INTL"},
    "KAMA": {"center": "ZAB", "name": "RICK HUSBAND AMARILLO INTL"},
    "ELP": {"center": "ZAB", "name": "EL PASO INTL"},
    "KELP": {"center": "ZAB", "name": "EL PASO INTL"},
    "MAF": {"center": "ZAB", "name": "MIDLAND INTL AIR AND SPACE PORT"},
    "KMAF": {"center": "ZAB", "name": "MIDLAND INTL AIR AND SPACE PORT"},
    "MCI": {"center": "ZKC", "name": "KANSAS CITY INTL"},
    "KMCI": {"center": "ZKC", "name": "KANSAS CITY INTL"},
    "ICT": {"center": "ZKC", "name": "WICHITA DWIGHT D EISENHOWER NATL"},
    "KICT": {"center": "ZKC", "name": "WICHITA DWIGHT D EISENHOWER NATL"},
    "STL": {"center": "ZKC", "name": "ST LOUIS LAMBERT INTL"},
    "KSTL": {"center": "ZKC", "name": "ST LOUIS LAMBERT INTL"},
    "SGF": {"center": "ZKC", "name": "SPRINGFIELD-BRANSON NATL"},
    "KSGF": {"center": "ZKC", "name": "SPRINGFIELD-BRANSON NATL"},
    "TUL": {"center": "ZKC", "name": "TULSA INTL"},
    "KTUL": {"center": "ZKC", "name": "TULSA INTL"},
}


def fetch_zip(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=120) as response:
        return response.read()


def clean_header(value: str) -> str:
    return re.sub(r"[^A-Z0-9]+", "_", str(value or "").strip().upper()).strip("_")


def rows_from_zip(zip_bytes: bytes) -> Iterable[Dict[str, str]]:
    if not zip_bytes.startswith(b"PK"):
        raise RuntimeError("Downloaded APT source was not a zip file.")

    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        for name in zf.namelist():
            if not name.lower().endswith(".csv"):
                continue
            with zf.open(name) as fh:
                text = io.TextIOWrapper(fh, encoding="utf-8-sig", errors="replace", newline="")
                reader = csv.DictReader(text)
                for row in reader:
                    yield {clean_header(k): (v or "").strip() for k, v in row.items() if k is not None}


def first_value(row: Dict[str, str], patterns) -> str:
    for pattern in patterns:
        rx = re.compile(pattern)
        for key, value in row.items():
            if value and rx.search(key):
                return value.strip()
    return ""


def airport_ident(row: Dict[str, str]) -> str:
    ident = first_value(row, [
        r"^(ARPT|AIRPORT|LOCATION|LOC|SITE|FACILITY)_?(ID|IDENT|IDENTIFIER)$",
        r"^LANDING_FACILITY_SITE_NUMBER$",
        r"^FAA_?(ID|IDENT)$",
        r"^IDENT$",
        r"^ID$",
    ])
    return re.sub(r"[^A-Z0-9]", "", ident.upper())


def airport_name(row: Dict[str, str], ident: str) -> str:
    name = first_value(row, [
        r"^(ARPT|AIRPORT|FACILITY|SITE).*NAME$",
        r"^OFFICIAL_AIRPORT_NAME$",
        r"^NAME$",
        r"DESCRIPTION",
    ])
    return name.upper() if name else ident


def detect_artcc(row: Dict[str, str]) -> str:
    for key, value in row.items():
        if not value:
            continue

        if re.search(r"(ARTCC|CENTER|CNTR|FACILITY|BOUNDARY|RESPONSIBLE|CONTROL|SERVICE)", key):
            upper = value.strip().upper()
            for artcc in ADJACENT_ARTCC_INFO:
                if artcc in upper:
                    return artcc
            if "HOUSTON" in upper:
                return "ZHU"
            if "ALBUQUERQUE" in upper:
                return "ZAB"
            if "KANSAS CITY" in upper:
                return "ZKC"
            if "MEMPHIS" in upper:
                return "ZME"

    return ""


def add_aliases(airports: Dict[str, Dict], ident: str, record: Dict) -> None:
    if not ident:
        return

    airports[ident] = record

    if len(ident) == 4 and ident.startswith("K"):
        airports.setdefault(ident[1:], record)
    elif len(ident) == 3:
        airports.setdefault("K" + ident, record)


def main() -> int:
    airports: Dict[str, Dict] = {}

    rows = list(rows_from_zip(fetch_zip(APT_ZIP_URL)))

    for row in rows:
        ident = airport_ident(row)
        if not ident:
            continue

        center = detect_artcc(row)
        if center not in ADJACENT_ARTCC_INFO:
            continue

        rec = {
            "center": center,
            "name": airport_name(row, ident),
            "fdcd": ADJACENT_ARTCC_INFO[center]["fdcd"],
        }
        add_aliases(airports, ident, rec)

    for ident, rec in STATIC_ADJACENT_OVERRIDES.items():
        center = rec["center"]
        full = {
            "center": center,
            "name": rec["name"],
            "fdcd": ADJACENT_ARTCC_INFO[center]["fdcd"],
        }
        add_aliases(airports, ident, full)

    output = {
        "centers": ADJACENT_ARTCC_INFO,
        "airports": dict(sorted(airports.items())),
    }

    Path("zfw_adjacent_artcc_airports.js").write_text(
        "// Static adjacent ARTCC airport clearance delivery lookup generated from FAA NASR APT data.\\n"
        f"// Source: {APT_ZIP_URL}\\n"
        "window.ZFW_ADJACENT_ARTCC_AIRPORTS = " + json.dumps(output, separators=(",", ":"), ensure_ascii=False) + ";\\n",
        encoding="utf-8",
    )

    print(f"Wrote zfw_adjacent_artcc_airports.js with {len(airports)} identifiers/aliases.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
