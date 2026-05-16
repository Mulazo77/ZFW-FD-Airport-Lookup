/*
sector-firebase-alignment-fix.js

Purpose:
Fixes sector/airport display alignment so airports are grouped by the correct sector number
and the sector name is always derived from one authoritative map.

Known corrections included:
- 27 = DAL
- 29 = DON
- 83 = UIM
- F46 = sector 83 / UIM

How this file is designed to be used:
1. Add this file to the project.
2. Import or load it before rendering sector/airport results.
3. Use normalizeAirportRecord(), groupAirportsBySector(), and getSectorHeader()
   in the display logic instead of pairing sector numbers/names by array position.
4. If Firebase is used, use subscribeToAirportData() so other PCs receive live updates.

This file avoids storing/displaying mixed sector number + sector name pairs like "29 DAL".
*/

(function attachSectorAlignmentFix(globalScope) {
  "use strict";

  const AUTHORITATIVE_SECTOR_MAP = Object.freeze({
    "27": "DAL",
    "29": "DON",
    "83": "UIM"
  });

  const AUTHORITATIVE_AIRPORT_OVERRIDES = Object.freeze({
    "F46": {
      sector: "83"
    }
  });

  function cleanCode(value) {
    return String(value ?? "").trim().toUpperCase();
  }

  function cleanSector(value) {
    return String(value ?? "").trim();
  }

  function getSectorName(sectorNumber) {
    const key = cleanSector(sectorNumber);
    return AUTHORITATIVE_SECTOR_MAP[key] || "UNKNOWN";
  }

  function getSectorHeader(sectorNumber) {
    const key = cleanSector(sectorNumber);
    return `${key} ${getSectorName(key)}`;
  }

  function getAirportIdentifier(record) {
    return cleanCode(
      record?.id ||
      record?.airport ||
      record?.airportId ||
      record?.airportIdentifier ||
      record?.identifier ||
      record?.code
    );
  }

  function getRecordSector(record) {
    return cleanSector(
      record?.sector ||
      record?.sectorNumber ||
      record?.sector_id ||
      record?.sectorId
    );
  }

  function normalizeAirportRecord(record) {
    const airportId = getAirportIdentifier(record);
    const override = AUTHORITATIVE_AIRPORT_OVERRIDES[airportId];

    const sector = cleanSector(override?.sector || getRecordSector(record));
    const sectorName = getSectorName(sector);

    return {
      ...record,
      id: airportId || record?.id,
      airport: airportId || record?.airport,
      sector,
      sectorNumber: sector,
      sectorName,
      sectorHeader: getSectorHeader(sector)
    };
  }

  function validateAirportRecord(record) {
    const normalized = normalizeAirportRecord(record);
    const issues = [];

    if (!normalized.airport && !normalized.id) {
      issues.push("Missing airport identifier.");
    }

    if (!normalized.sector) {
      issues.push(`Airport ${normalized.airport || normalized.id || "UNKNOWN"} is missing a sector number.`);
    }

    if (normalized.sectorName === "UNKNOWN") {
      issues.push(`Sector ${normalized.sector || "UNKNOWN"} is not in the authoritative sector map.`);
    }

    if (normalized.airport === "F46" && normalized.sector !== "83") {
      issues.push("F46 must be assigned to sector 83 / UIM.");
    }

    if (normalized.sector === "29" && normalized.sectorName !== "DON") {
      issues.push("Sector 29 must resolve to DON.");
    }

    if (normalized.sector === "27" && normalized.sectorName !== "DAL") {
      issues.push("Sector 27 must resolve to DAL.");
    }

    if (normalized.sector === "83" && normalized.sectorName !== "UIM") {
      issues.push("Sector 83 must resolve to UIM.");
    }

    return {
      valid: issues.length === 0,
      issues,
      record: normalized
    };
  }

  function normalizeAirportList(records) {
    if (!Array.isArray(records)) {
      return [];
    }

    return records.map(normalizeAirportRecord);
  }

  function groupAirportsBySector(records) {
    const normalizedRecords = normalizeAirportList(records);
    const grouped = new Map();

    for (const record of normalizedRecords) {
      const sector = cleanSector(record.sector);
      const header = getSectorHeader(sector);

      if (!grouped.has(sector)) {
        grouped.set(sector, {
          sector,
          sectorName: getSectorName(sector),
          header,
          airports: []
        });
      }

      grouped.get(sector).airports.push(record);
    }

    return Array.from(grouped.values())
      .sort((a, b) => Number(a.sector) - Number(b.sector))
      .map(group => ({
        ...group,
        airports: group.airports.sort((a, b) => {
          const left = cleanCode(a.airport || a.id);
          const right = cleanCode(b.airport || b.id);
          return left.localeCompare(right);
        })
      }));
  }

  function assertSectorAlignment(records) {
    const normalizedRecords = normalizeAirportList(records);
    const problems = [];

    for (const record of normalizedRecords) {
      const validation = validateAirportRecord(record);
      if (!validation.valid) {
        problems.push(...validation.issues);
      }

      if (record.sector === "29" && record.sectorName === "DAL") {
        problems.push("Invalid display pair detected: 29 DAL. Sector 29 must display as 29 DON.");
      }

      if ((record.airport === "F46" || record.id === "F46") && record.sector !== "83") {
        problems.push("Invalid F46 assignment detected. F46 must display under 83 UIM.");
      }
    }

    return {
      ok: problems.length === 0,
      problems
    };
  }

  /*
   Firebase helper.

   Expected Firebase shape can be either:
   - Object keyed by airport identifier:
     {
       F46: { sector: "83", ... }
     }

   - Array of airport records:
     [
       { id: "F46", sector: "83", ... }
     ]

   This function intentionally uses onValue instead of one-time reads so connected PCs update
   when Firebase changes.
  */
  function subscribeToAirportData(firebaseDatabase, firebaseRefFunction, path, onGroupedData, onError) {
    if (!firebaseDatabase || typeof firebaseRefFunction !== "function") {
      throw new Error("subscribeToAirportData requires the Firebase database instance and ref function.");
    }

    if (typeof onGroupedData !== "function") {
      throw new Error("subscribeToAirportData requires an onGroupedData callback.");
    }

    if (!globalScope.firebase || !globalScope.firebase.database) {
      /*
       This branch supports modular Firebase imports if the project passes a compatible ref.
       The actual onValue function must be supplied at globalScope.onValue if modular imports
       are not globally available.
      */
    }

    const dataRef = firebaseRefFunction(firebaseDatabase, path);

    const onValueFunction =
      globalScope.onValue ||
      globalScope.firebaseOnValue ||
      globalScope?.firebase?.database?.onValue;

    if (typeof onValueFunction !== "function") {
      throw new Error(
        "Firebase onValue listener was not found. Expose onValue as window.onValue or wire this helper to your Firebase listener."
      );
    }

    return onValueFunction(
      dataRef,
      snapshot => {
        const raw = snapshot.val();

        let records;
        if (Array.isArray(raw)) {
          records = raw;
        } else if (raw && typeof raw === "object") {
          records = Object.entries(raw).map(([key, value]) => ({
            id: key,
            airport: key,
            ...(value || {})
          }));
        } else {
          records = [];
        }

        const normalized = normalizeAirportList(records);
        const grouped = groupAirportsBySector(normalized);
        const alignment = assertSectorAlignment(normalized);

        onGroupedData({
          grouped,
          records: normalized,
          alignment
        });
      },
      error => {
        if (typeof onError === "function") {
          onError(error);
        } else {
          console.error("Firebase airport listener error:", error);
        }
      }
    );
  }

  function repairAirportObjectForFirebase(rawData) {
    const input = rawData && typeof rawData === "object" ? rawData : {};
    const output = { ...input };

    if (output.F46 && typeof output.F46 === "object") {
      output.F46 = {
        ...output.F46,
        sector: "83",
        sectorNumber: "83",
        sectorName: "UIM",
        sectorHeader: "83 UIM"
      };
    } else {
      output.F46 = {
        id: "F46",
        airport: "F46",
        sector: "83",
        sectorNumber: "83",
        sectorName: "UIM",
        sectorHeader: "83 UIM"
      };
    }

    for (const [airportId, record] of Object.entries(output)) {
      if (!record || typeof record !== "object") continue;
      const normalized = normalizeAirportRecord({ id: airportId, airport: airportId, ...record });
      output[airportId] = {
        ...record,
        sector: normalized.sector,
        sectorNumber: normalized.sector,
        sectorName: normalized.sectorName,
        sectorHeader: normalized.sectorHeader
      };
    }

    return output;
  }

  const api = {
    AUTHORITATIVE_SECTOR_MAP,
    AUTHORITATIVE_AIRPORT_OVERRIDES,
    cleanCode,
    cleanSector,
    getSectorName,
    getSectorHeader,
    normalizeAirportRecord,
    validateAirportRecord,
    normalizeAirportList,
    groupAirportsBySector,
    assertSectorAlignment,
    subscribeToAirportData,
    repairAirportObjectForFirebase
  };

  globalScope.SectorAlignmentFix = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
