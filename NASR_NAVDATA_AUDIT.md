# ZFW NASR Navdata Audit

Cycle page: https://www.faa.gov/air_traffic/flight_info/aeronav/aero_data/NASR_Subscription/2026-05-14
Generated navpoint records: 10207
Generated weather stations: 0
Records missing nearest_wx: 10207

## Sample required checks
- WSTEX: FOUND, nearest_wx=, name=WSTEX WAYPOINT
- EIC: FOUND, nearest_wx=, name=BELCHER
- CHMLI: FOUND, nearest_wx=, name=CHMLI WAYPOINT
- BSKAT: FOUND, nearest_wx=, name=BSKAT WAYPOINT
- VEEDE: FOUND, nearest_wx=, name=VEEDE WAYPOINT
- WUNUR: FOUND, nearest_wx=, name=WUNUR WAYPOINT
- ZOOOO: FOUND, nearest_wx=, name=ZOOOO WAYPOINT
- TISEE: FOUND, nearest_wx=, name=TISEE WAYPOINT
- GUTZZ: FOUND, nearest_wx=, name=GUTZZ WAYPOINT
- SIYGO: FOUND, nearest_wx=, name=SIYGO WAYPOINT
- DAWGZ: FOUND, nearest_wx=, name=DAWGZ WAYPOINT
- BYP: FOUND, nearest_wx=, name=BONHAM
- EMG: FOUND, nearest_wx=, name=ELM GROVE
- UKW: FOUND, nearest_wx=, name=BOWIE

## Filtering logic
- Primary: FAA NASR ARTCC/Center fields that match ZFW/Fort Worth.
- Secondary: fixes referenced in ZFW STAR/DP data when such fields are present.
- Fallback: broad ZFW geographic envelope to avoid missing procedure fixes when center fields are not exposed in a CSV group.
