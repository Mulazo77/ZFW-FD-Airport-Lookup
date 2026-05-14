#!/usr/bin/env python3
"""
Build zfw_nav_data.js from FAA NASR public CSV data.

Purpose:
- Pull current FAA NASR FIX, NAV, WXL, STAR, and DP CSV groups.
- Include all ZFW-owned/associated fixes and navaids when ARTCC/Center fields are available.
- Fall back to a broad ZFW geographic envelope when center fields are missing.
- Compute nearest valid weather reporting station for each record.
- Generate window.ZFW_NAV_DATA = {...};

This script is designed to run in GitHub Actions, not in the browser.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import math
import os
import re
import sys
import urllib.request
import zipfile
from html.parser import HTMLParser
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple


NASR_HOME = "https://www.faa.gov/air_traffic/flight_info/aeronav/aero_data/NASR_Subscription/"
DEFAULT_CYCLE_PAGE = "https://www.faa.gov/air_traffic/flight_info/aeronav/aero_data/NASR_Subscription/2026-04-16/"

# Broad ZFW operational envelope. This is only fallback logic.
# Primary filter should be NASR ARTCC/Center ownership fields.
ZFW_BOUNDS = {
    "lat_min": 28.0,
    "lat_max": 37.8,
    "lon_min": -107.5,
    "lon_max": -90.0,
}

CSV_GROUPS = {
    "FIX": "Fix/Reporting Point/Waypoint",
    "NAV": "Navigation Aids",
    "WXL": "Weather Reporting Locations",
    "STAR": "Standard Terminal Arrival",
    "DP": "Departure Procedure",
}

CENTER_VALUES = {"ZFW", "FW", "FORT WORTH", "FORT WORTH ARTCC"}


class LinkParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links: List[Tuple[str, str]] = []
        self._href: Optional[str] = None
        self._text_parts: List[str] = []

    def handle_starttag(self, tag, attrs):
        if tag.lower() == "a":
            attrs_dict = dict(attrs)
            self._href = attrs_dict.get("href")
            self._text_parts = []

    def handle_data(self, data):
        if self._href is not None:
            self._text_parts.append(data)

    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            text = " ".join("".join(self._text_parts).split())
            self.links.append((text, self._href))
            self._href = None
            self._text_parts = []


def fetch_text(url: str) -> str:
    with urllib.request.urlopen(url, timeout=60) as response:
        return response.read().decode("utf-8", errors="replace")


def fetch_bytes(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=120) as response:
        return response.read()


def absolute_url(href: str, base: str) -> str:
    return urllib.request.urljoin(base, href)


def parse_links(html: str) -> List[Tuple[str, str]]:
    parser = LinkParser()
    parser.feed(html)
    return parser.links


def find_current_cycle_page() -> str:
    try:
        html = fetch_text(NASR_HOME)
        links = parse_links(html)
        # Prefer Current link if page parser can find it. FAA page often has "Subscription effective ..."
        for text, href in links:
            if "Subscription effective" in text and href:
                return absolute_url(href, NASR_HOME)
    except Exception:
        pass

    return DEFAULT_CYCLE_PAGE


def find_csv_zip_urls(cycle_page: str) -> Dict[str, str]:
    html = fetch_text(cycle_page)
    links = parse_links(html)

    found: Dict[str, str] = {}

    for text, href in links:
        if not href:
            continue
        url = absolute_url(href, cycle_page)
        upper = url.upper()
        label = f"{text} {url}".upper()

        for group in CSV_GROUPS:
            # Individual group links contain e.g. FIX_CSV.zip, NAV_CSV.zip, WXL_CSV.zip.
            if f"_{group}_CSV.ZIP" in upper or f"({group})" in label:
                found[group] = url

    # Fallback direct URL pattern for FAA's current 28DaySub extra links.
    if not all(k in found for k in ["FIX", "NAV", "WXL"]):
        m = re.search(r"/(\d{4})-(\d{2})-(\d{2})/?$", cycle_page)
        if m:
            yyyy, mm, dd = m.groups()
            month_name = {
                "01": "Jan", "02": "Feb", "03": "Mar", "04": "Apr", "05": "May", "06": "Jun",
                "07": "Jul", "08": "Aug", "09": "Sep", "10": "Oct", "11": "Nov", "12": "Dec"
            }[mm]
            pattern = f"https://nfdc.faa.gov/webContent/28DaySub/extra/{dd}_{month_name}_{yyyy}_{{group}}_CSV.zip"
            for group in CSV_GROUPS:
                found.setdefault(group, pattern.format(group=group))

    missing = [g for g in ["FIX", "NAV", "WXL"] if g not in found]
    if missing:
        raise RuntimeError(f"Could not locate required NASR CSV groups: {missing}")

    return found


def read_zip_csvs(zip_bytes: bytes) -> Iterable[Tuple[str, Dict[str, str]]]:
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        for name in zf.namelist():
            if not name.lower().endswith(".csv"):
                continue
            with zf.open(name) as fh:
                text = io.TextIOWrapper(fh, encoding="utf-8-sig", errors="replace", newline="")
                reader = csv.DictReader(text)
                for row in reader:
                    yield name, {clean_header(k): (v or "").strip() for k, v in row.items() if k is not None}


def clean_header(value: str) -> str:
    return re.sub(r"[^A-Z0-9]+", "_", str(value or "").strip().upper()).strip("_")


def first_value(row: Dict[str, str], patterns: List[str]) -> str:
    for pat in patterns:
        regex = re.compile(pat)
        for key, value in row.items():
            if value and regex.search(key):
                return value.strip()
    return ""


def decimal_from_dms(value: str) -> Optional[float]:
    if not value:
        return None

    raw = value.strip().upper()
    try:
        return float(raw)
    except ValueError:
        pass

    # Accept examples like 321234.56N, 32-12-34.56N, 32 12 34.56 N
    hemi_match = re.search(r"([NSEW])$", raw)
    hemi = hemi_match.group(1) if hemi_match else ""
    raw_no_hemi = re.sub(r"[NSEW]$", "", raw).strip()

    parts = re.findall(r"\d+(?:\.\d+)?", raw_no_hemi)
    if len(parts) >= 3:
        deg = float(parts[0])
        minute = float(parts[1])
        sec = float(parts[2])
    elif len(parts) == 1 and len(parts[0].split(".")[0]) >= 6:
        digits = parts[0]
        whole = digits.split(".")[0]
        frac = "." + digits.split(".")[1] if "." in digits else ""
        # Latitude usually DDMMSS, longitude usually DDDMMSS.
        # Heuristic: if hemisphere E/W and 7+ digits, use 3 degree digits.
        dlen = 3 if hemi in ("E", "W") and len(whole) >= 7 else 2
        deg = float(whole[:dlen])
        minute = float(whole[dlen:dlen+2])
        sec = float(whole[dlen+2:] + frac)
    else:
        return None

    dec = deg + minute / 60 + sec / 3600
    if hemi in ("S", "W"):
        dec *= -1
    return round(dec, 6)


def get_lat_lon(row: Dict[str, str]) -> Tuple[Optional[float], Optional[float]]:
    lat = first_value(row, [
        r"^LAT(ITUDE)?_DEC",
        r"DECIMAL_LAT",
        r"^LAT(ITUDE)?$",
        r"LATITUDE.*DECIMAL",
        r"LATITUDE.*DMS",
    ])
    lon = first_value(row, [
        r"^LON(GITUDE)?_DEC",
        r"DECIMAL_LON",
        r"^LON(GITUDE)?$",
        r"LONGITUDE.*DECIMAL",
        r"LONGITUDE.*DMS",
    ])

    lat_dec = decimal_from_dms(lat)
    lon_dec = decimal_from_dms(lon)

    # Try separate D/M/S fields if needed.
    if lat_dec is None:
        lat_d = first_value(row, [r"LAT.*DEG"])
        lat_m = first_value(row, [r"LAT.*MIN"])
        lat_s = first_value(row, [r"LAT.*SEC"])
        lat_h = first_value(row, [r"LAT.*HEM"])
        if lat_d and lat_m and lat_s:
            lat_dec = float(lat_d) + float(lat_m) / 60 + float(lat_s) / 3600
            if lat_h.upper().startswith("S"):
                lat_dec *= -1

    if lon_dec is None:
        lon_d = first_value(row, [r"LON.*DEG"])
        lon_m = first_value(row, [r"LON.*MIN"])
        lon_s = first_value(row, [r"LON.*SEC"])
        lon_h = first_value(row, [r"LON.*HEM"])
        if lon_d and lon_m and lon_s:
            lon_dec = float(lon_d) + float(lon_m) / 60 + float(lon_s) / 3600
            if lon_h.upper().startswith("W"):
                lon_dec *= -1

    return lat_dec, lon_dec


def get_ident(row: Dict[str, str], kind: str) -> str:
    patterns = [
        r"^(FIX|NAV|NAVAID|WAYPOINT|REPORTING_POINT|LOCATION|LOC)_?(ID|IDENT|IDENTIFIER)$",
        r"^(FIX|NAV|NAVAID|WAYPOINT|REPORTING_POINT)_?NAME$",
        r"^IDENT$",
        r"^ID$",
    ]

    if kind == "NAV":
        patterns.insert(0, r"^(NAV|NAVAID)_?(FACILITY_)?ID$")
    if kind == "FIX":
        patterns.insert(0, r"^FIX_?(ID|IDENT|IDENTIFIER|NAME)$")

    ident = first_value(row, patterns)
    ident = re.sub(r"[^A-Z0-9]", "", ident.upper())
    return ident


def get_name(row: Dict[str, str], ident: str, kind: str) -> str:
    name = first_value(row, [
        r"FACILITY_NAME",
        r"NAVAID_NAME",
        r"FIX_NAME",
        r"NAME$",
        r"DESCRIPTION",
    ])
    if name:
        return name.upper()
    if kind == "NAV":
        return f"{ident} NAVAID"
    return f"{ident} WAYPOINT"


def has_zfw_center(row: Dict[str, str]) -> bool:
    for key, value in row.items():
        if not value:
            continue
        if re.search(r"(ARTCC|CENTER|CNTR|FACILITY_ID|BOUNDARY)", key):
            upper = value.strip().upper()
            if upper in CENTER_VALUES or "ZFW" in upper or "FORT WORTH" in upper:
                return True
    return False


def in_zfw_bounds(lat: Optional[float], lon: Optional[float]) -> bool:
    if lat is None or lon is None:
        return False
    return (
        ZFW_BOUNDS["lat_min"] <= lat <= ZFW_BOUNDS["lat_max"]
        and ZFW_BOUNDS["lon_min"] <= lon <= ZFW_BOUNDS["lon_max"]
    )


def get_procedure_fix_names(rows: Iterable[Dict[str, str]]) -> set[str]:
    fixes: set[str] = set()
    for row in rows:
        if not has_zfw_center(row):
            continue
        for key, value in row.items():
            if not value:
                continue
            if re.search(r"(FIX|WAYPOINT|WPT|TRANSITION|ROUTE)", key):
                for token in re.findall(r"\b[A-Z]{5}\b", value.upper()):
                    fixes.add(token)
    return fixes


def to_record(ident: str, name: str, kind: str, lat: float, lon: float) -> Dict:
    return {
        "sectors": [],
        "areas": [],
        "apps": [],
        "vscs": [],
        "contacts": [],
        "hours": [],
        "airport_name": name,
        "lat": round(float(lat), 6),
        "lon": round(float(lon), 6),
        "record_type": kind,
    }


def load_weather_stations(rows: Iterable[Dict[str, str]]) -> List[Dict]:
    stations: List[Dict] = []
    seen = set()
    for row in rows:
        ident = get_ident(row, "WXL")
        if not ident:
            ident = first_value(row, [r"LOCATION_ID", r"WEATHER.*ID", r"STATION.*ID"])
            ident = re.sub(r"[^A-Z0-9]", "", ident.upper())
        if not ident or ident in seen:
            continue
        lat, lon = get_lat_lon(row)
        if lat is None or lon is None:
            continue
        if not in_zfw_bounds(lat, lon):
            continue
        name = get_name(row, ident, "WXL")
        stations.append({"id": ident[-3:] if ident.startswith("K") and len(ident) == 4 else ident, "name": name, "lat": lat, "lon": lon})
        seen.add(ident)
    return stations


def nm_between(a_lat: float, a_lon: float, b_lat: float, b_lon: float) -> float:
    earth_nm = 3440.065
    d_lat = math.radians(b_lat - a_lat)
    d_lon = math.radians(b_lon - a_lon)
    lat1 = math.radians(a_lat)
    lat2 = math.radians(b_lat)
    h = math.sin(d_lat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(d_lon / 2) ** 2
    return 2 * earth_nm * math.atan2(math.sqrt(h), math.sqrt(1 - h))


def assign_nearest_wx(records: Dict[str, Dict], stations: List[Dict]) -> None:
    if not stations:
        return
    for ident, record in records.items():
        lat = record.get("lat")
        lon = record.get("lon")
        if not isinstance(lat, (float, int)) or not isinstance(lon, (float, int)):
            continue
        best = min(stations, key=lambda s: nm_between(lat, lon, s["lat"], s["lon"]))
        record["nearest_wx"] = best["id"]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cycle-page", default=os.environ.get("NASR_CYCLE_PAGE", "auto"))
    parser.add_argument("--output", default="zfw_nav_data.js")
    parser.add_argument("--weather-output", default="zfw_weather_stations.js")
    parser.add_argument("--audit", default="NASR_NAVDATA_AUDIT.md")
    args = parser.parse_args()

    cycle_page = find_current_cycle_page() if args.cycle_page == "auto" else args.cycle_page
    urls = find_csv_zip_urls(cycle_page)

    print(f"Using NASR cycle page: {cycle_page}")
    for key in sorted(urls):
        print(f"{key}: {urls[key]}")

    zip_data = {group: fetch_bytes(url) for group, url in urls.items() if group in ["FIX", "NAV", "WXL", "STAR", "DP"]}

    fix_rows = [row for _, row in read_zip_csvs(zip_data["FIX"])]
    nav_rows = [row for _, row in read_zip_csvs(zip_data["NAV"])]
    wx_rows = [row for _, row in read_zip_csvs(zip_data["WXL"])]

    procedure_fix_names: set[str] = set()
    for group in ["STAR", "DP"]:
        if group in zip_data:
            try:
                procedure_fix_names |= get_procedure_fix_names(row for _, row in read_zip_csvs(zip_data[group]))
            except Exception as exc:
                print(f"Warning: could not parse {group} CSV group: {exc}")

    records: Dict[str, Dict] = {}

    for row in fix_rows:
        ident = get_ident(row, "FIX")
        if not ident or not re.fullmatch(r"[A-Z0-9]{2,5}", ident):
            continue

        lat, lon = get_lat_lon(row)
        if lat is None or lon is None:
            continue

        include = has_zfw_center(row) or ident in procedure_fix_names or in_zfw_bounds(lat, lon)
        if not include:
            continue

        records[ident] = to_record(ident, get_name(row, ident, "FIX"), "WAYPOINT", lat, lon)

    for row in nav_rows:
        ident = get_ident(row, "NAV")
        if not ident or not re.fullmatch(r"[A-Z0-9]{2,5}", ident):
            continue

        lat, lon = get_lat_lon(row)
        if lat is None or lon is None:
            continue

        include = has_zfw_center(row) or in_zfw_bounds(lat, lon)
        if not include:
            continue

        nav_type = first_value(row, [r"NAVAID_TYPE", r"TYPE"]) or "NAVAID"
        records[ident] = to_record(ident, get_name(row, ident, "NAV"), nav_type.upper(), lat, lon)

    stations = load_weather_stations(wx_rows)
    assign_nearest_wx(records, stations)

    Path(args.output).write_text(
        "// Generated from FAA NASR public FIX/NAV CSV data.\n"
        f"// Cycle page: {cycle_page}\n"
        "window.ZFW_NAV_DATA = " + json.dumps(records, separators=(",", ":"), ensure_ascii=False) + ";\n",
        encoding="utf-8",
    )

    Path(args.weather_output).write_text(
        "// Generated from FAA NASR public WXL CSV data.\n"
        f"// Cycle page: {cycle_page}\n"
        "window.ZFW_WEATHER_STATIONS = " + json.dumps(stations, separators=(",", ":"), ensure_ascii=False) + ";\n",
        encoding="utf-8",
    )

    sample_checks = ["WSTEX", "CHMLI", "BSKAT", "VEEDE", "WUNUR", "ZOOOO", "TISEE", "GUTZZ", "SIYGO", "DAWGZ", "BYP", "EMG", "UKW"]
    lines = [
        "# ZFW NASR Navdata Audit",
        "",
        f"Cycle page: {cycle_page}",
        f"Generated navpoint records: {len(records)}",
        f"Generated weather stations: {len(stations)}",
        "",
        "## Sample required checks",
    ]

    for ident in sample_checks:
        rec = records.get(ident)
        if rec:
            lines.append(f"- {ident}: FOUND, nearest_wx={rec.get('nearest_wx', '')}, name={rec.get('airport_name', '')}")
        else:
            lines.append(f"- {ident}: NOT FOUND")

    lines.extend([
        "",
        "## Filtering logic",
        "- Primary: FAA NASR ARTCC/Center fields that match ZFW/Fort Worth.",
        "- Secondary: fixes referenced in ZFW STAR/DP data when such fields are present.",
        "- Fallback: broad ZFW geographic envelope to avoid missing procedure fixes when center fields are not exposed in a CSV group.",
    ])

    Path(args.audit).write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(f"Wrote {args.output}: {len(records)} records")
    print(f"Wrote {args.weather_output}: {len(stations)} records")
    print(f"Wrote {args.audit}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
