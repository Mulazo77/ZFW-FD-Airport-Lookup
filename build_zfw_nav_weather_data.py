# This script is intended to generate the complete zfw_nav_data.js from public FAA NASR FIX/NAV exports.
# Use the current NASR cycle and filter records by ARTCC/Jurisdiction = ZFW or by ZFW bounding/sector criteria.
# The app expects every generated fix/navaid in: window.ZFW_NAV_DATA = {...};

#!/usr/bin/env python3
"""
Builds zfw_nav_data.js and zfw_weather_stations.js from public FAA/AviationWeather data.
Run this on a machine with internet access when you want a current full refresh.

Primary sources:
- FAA NASR CSV groups: FIX, NAV, WXL
- AviationWeather station cache / stationinfo for METAR-capable reporting stations

This script is included so the ZFW waypoint/navaid database can be regenerated without hand editing app JS.
"""
from __future__ import annotations

import csv, gzip, io, json, math, re, sys, urllib.request, zipfile
from pathlib import Path

NASR_FIX = "https://nfdc.faa.gov/webContent/28DaySub/extra/14_May_2026_FIX_CSV.zip"
NASR_NAV = "https://nfdc.faa.gov/webContent/28DaySub/extra/14_May_2026_NAV_CSV.zip"
NASR_WXL = "https://nfdc.faa.gov/webContent/28DaySub/extra/14_May_2026_WXL_CSV.zip"
AWC_STATIONS = "https://aviationweather.gov/data/cache/stations.cache.json.gz"

# Rough ZFW bounding box. Use ARTCC field from NASR when available; bbox is fallback only.
MIN_LAT, MAX_LAT = 25.0, 38.0
MIN_LON, MAX_LON = -107.0, -88.0

def download(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=60) as r:
        return r.read()

def read_zip_csv(url: str):
    data = download(url)
    rows = []
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        for name in zf.namelist():
            if name.lower().endswith(".csv"):
                with zf.open(name) as f:
                    text = io.TextIOWrapper(f, encoding="utf-8", errors="replace")
                    rows.extend(csv.DictReader(text))
    return rows

def first(row, *names):
    norm = {k.lower().replace(" ", "").replace("_", ""): v for k, v in row.items()}
    for name in names:
        key = name.lower().replace(" ", "").replace("_", "")
        if key in norm and str(norm[key]).strip() != "":
            return str(norm[key]).strip()
    return ""

def as_float(value):
    try: return float(value)
    except Exception: return None

def in_zfw(row, lat, lon):
    artcc = " ".join(str(v).upper() for v in row.values() if v)
    if "ZFW" in artcc:
        return True
    return lat is not None and lon is not None and MIN_LAT <= lat <= MAX_LAT and MIN_LON <= lon <= MAX_LON

def record_from_row(row, kind):
    ident = first(row, "FIX_ID", "FIX IDENT", "NAV_ID", "NAV IDENT", "ID", "IDENT", "FACILITY_ID").upper()
    name = first(row, "FIX_NAME", "NAV_NAME", "NAME", "FACILITY_NAME") or ident
    lat = as_float(first(row, "LATITUDE", "LAT_DECIMAL", "LATITUDE_DECIMAL", "LATITUDE_DEG"))
    lon = as_float(first(row, "LONGITUDE", "LON_DECIMAL", "LONGITUDE_DECIMAL", "LONGITUDE_DEG"))
    if not ident or lat is None or lon is None:
        return None
    if not in_zfw(row, lat, lon):
        return None
    return ident, {
        "sectors": [], "areas": [], "apps": [], "vscs": [], "contacts": [], "hours": [],
        "airport_name": f"{name} {kind}".strip(),
        "lat": round(lat, 6), "lon": round(lon, 6), "record_type": kind
    }

def build_nav():
    records = {}
    for row in read_zip_csv(NASR_FIX):
        out = record_from_row(row, "WAYPOINT")
        if out: records[out[0]] = out[1]
    for row in read_zip_csv(NASR_NAV):
        out = record_from_row(row, "NAVAID")
        if out: records[out[0]] = out[1]
    return records

def build_weather():
    raw = gzip.decompress(download(AWC_STATIONS)).decode("utf-8", errors="replace")
    data = json.loads(raw)
    stations = []
    for item in data:
        sid = str(item.get("icaoId") or item.get("id") or item.get("station_id") or "").upper().strip()
        lat = as_float(item.get("lat"))
        lon = as_float(item.get("lon"))
        if not sid or lat is None or lon is None: continue
        if not (MIN_LAT <= lat <= MAX_LAT and MIN_LON <= lon <= MAX_LON): continue
        local = sid[1:] if len(sid) == 4 and sid.startswith("K") else sid
        stations.append({"id": local, "name": item.get("site") or item.get("name") or "", "lat": round(lat, 6), "lon": round(lon, 6)})
    return stations

def main():
    nav = build_nav()
    wx = build_weather()
    Path("zfw_nav_data.js").write_text(
        "window.ZFW_NAV_DATA = " + json.dumps(nav, separators=(",", ":")) + ";\n" +
        "(function(){if(!window.AIRPORT_DATA)window.AIRPORT_DATA={records:{}};if(!window.AIRPORT_DATA.records)window.AIRPORT_DATA.records={};Object.keys(window.ZFW_NAV_DATA).forEach(function(id){if(!window.AIRPORT_DATA.records[id])window.AIRPORT_DATA.records[id]=window.ZFW_NAV_DATA[id];});})();\n",
        encoding="utf-8"
    )
    Path("zfw_weather_stations.js").write_text("window.ZFW_WEATHER_STATIONS = " + json.dumps(wx, separators=(",", ":")) + ";\n", encoding="utf-8")
    print(f"Wrote {len(nav)} nav/fix records and {len(wx)} weather stations.")

if __name__ == "__main__":
    main()
