(function(){
  "use strict";

  let lastLookupIdent = "";
  let lastDisplayedWx = "";
  let lastDisplayedTitle = "";
  let lastFoundWasNav = false;
  let lastFoundRecord = null;

  function normalizeIdent(value){ return String(value || "").trim().toUpperCase(); }

  function ensureAirportData(){
    if(!window.AIRPORT_DATA) window.AIRPORT_DATA = { records: {} };
    if(!window.AIRPORT_DATA.records) window.AIRPORT_DATA.records = {};
    return window.AIRPORT_DATA.records;
  }

  function isNavType(record){
    const type = String(record?.record_type || record?.type || "").toUpperCase();
    return ["NAVAID","WAYPOINT","FIX","VOR","VORTAC","NDB"].includes(type);
  }

  function isAirportRecord(record){
    if(!record) return false;
    const type = String(record.record_type || record.type || "").toUpperCase();
    if(type === "AIRPORT") return true;
    if(isNavType(record)) return false;
    return true;
  }

  function clone(record){ return JSON.parse(JSON.stringify(record || {})); }

  function getRecord(ident){
    const records = ensureAirportData();
    ident = normalizeIdent(ident);
    if(records[ident]) return records[ident];

    if(ident.length === 4 && ident.startsWith("K")){
      const stripped = ident.slice(1);
      if(records[stripped] && isAirportRecord(records[stripped])) return records[stripped];
    }

    if(ident.length === 3){
      const kIdent = "K" + ident;
      if(records[kIdent] && isAirportRecord(records[kIdent])) return records[kIdent];
    }

    return null;
  }

  function mergeUnique(base, add){
    const out = Array.isArray(base) ? base.slice() : [];
    (Array.isArray(add) ? add : []).forEach(function(item){ if(item && !out.includes(item)) out.push(item); });
    return out;
  }

  function normalizeNavRecord(ident, source){
    const rec = clone(source);
    rec.sectors = Array.isArray(rec.sectors) ? rec.sectors : [];
    rec.areas = Array.isArray(rec.areas) ? rec.areas : [];
    rec.apps = Array.isArray(rec.apps) ? rec.apps : [];
    rec.vscs = Array.isArray(rec.vscs) ? rec.vscs : [];
    rec.contacts = Array.isArray(rec.contacts) ? rec.contacts : [];
    rec.hours = Array.isArray(rec.hours) ? rec.hours : [];
    rec.airport_name = rec.airport_name || rec.name || (ident + " NAVAID");
    if(rec.lat !== undefined) rec.lat = Number(rec.lat);
    if(rec.lon !== undefined) rec.lon = Number(rec.lon);
    if(rec.nearest_wx) rec.nearest_wx = normalizeIdent(rec.nearest_wx);
    if(!rec.record_type) rec.record_type = "NAVAID";
    return rec;
  }

  function sourceNavData(){
    return Object.assign(
      {},
      window.ZFW_NAV_DATA || {},
      window.ZFW_SUPPLEMENTAL_NAVAIDS || {},
      window.ZFW_SUPPLEMENTAL_WAYPOINTS || {}
    );
  }

  function mergeNavData(){
    const records = ensureAirportData();
    const navData = sourceNavData();

    Object.keys(navData).forEach(function(rawIdent){
      let ident = normalizeIdent(rawIdent);
      if(!ident) return;
      if(ident.length === 4 && ident.startsWith("K")) ident = ident.slice(1);

      const nav = normalizeNavRecord(ident, navData[rawIdent]);

      if(records[ident]){
        const existing = records[ident];
        const existingName = existing.airport_name || existing.name || ident;
        const navName = nav.airport_name || nav.name || ident;

        if(navName && existingName && existingName !== navName && !existingName.includes(navName)){
          existing.airport_name = existingName + " / " + navName;
        }

        existing.sectors = mergeUnique(existing.sectors, nav.sectors);
        existing.areas = mergeUnique(existing.areas, nav.areas);
        existing.apps = mergeUnique(existing.apps, nav.apps);
        existing.vscs = mergeUnique(existing.vscs, nav.vscs);
        existing.contacts = mergeUnique(existing.contacts, nav.contacts);
        existing.hours = mergeUnique(existing.hours, nav.hours);
        if(!Number.isFinite(existing.lat) && Number.isFinite(nav.lat)) existing.lat = nav.lat;
        if(!Number.isFinite(existing.lon) && Number.isFinite(nav.lon)) existing.lon = nav.lon;
        if(nav.nearest_wx) existing.nearest_wx = nav.nearest_wx;
        existing.record_type = existing.record_type || nav.record_type || "NAVAID";
      } else {
        records[ident] = nav;
      }

      const fakeK = "K" + ident;
      if(records[fakeK] && !isAirportRecord(records[fakeK])) delete records[fakeK];
    });
  }

  function toRad(deg){ return deg * Math.PI / 180; }
  function nmBetween(aLat, aLon, bLat, bLon){
    const R = 3440.065, dLat = toRad(bLat-aLat), dLon = toRad(bLon-aLon);
    const lat1 = toRad(aLat), lat2 = toRad(bLat);
    const h = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
    return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1-h));
  }

  function stationNameById(id){
    id = normalizeIdent(id);
    const stations = window.ZFW_WEATHER_STATIONS || [];
    const match = stations.find(function(station){
      const sid = normalizeIdent(station.id);
      return sid === id || normalizeIdent("K" + sid) === id;
    });
    return match ? (match.name || "") : "";
  }

  function calculateNearest(record){
    if(!record) return null;

    if(record.nearest_wx){
      const id = normalizeIdent(record.nearest_wx);
      return { id: id, title: stationNameById(id) || "Assigned nearest weather reporting station" };
    }

    const stations = window.ZFW_WEATHER_STATIONS || [];
    if(!Number.isFinite(record.lat) || !Number.isFinite(record.lon) || !stations.length) return null;

    let best = null;
    stations.forEach(function(station){
      if(!Number.isFinite(station.lat) || !Number.isFinite(station.lon)) return;
      const distanceNm = nmBetween(record.lat, record.lon, station.lat, station.lon);
      if(!best || distanceNm < best.distanceNm){
        best = { id: normalizeIdent(station.id), name: station.name || "", distanceNm: distanceNm };
      }
    });

    if(!best) return null;
    return { id: best.id, title: best.name ? best.name + " — " + best.distanceNm.toFixed(1) + " NM" : best.distanceNm.toFixed(1) + " NM" };
  }

  function forceStatus(text){
    const status = document.getElementById("status");
    if(!status) return;
    status.textContent = text;
    status.classList.remove("error", "not-found");
    status.style.color = "";
  }

  function statusLooksBad(){
    const status = document.getElementById("status");
    if(!status) return false;
    const txt = normalizeIdent(status.textContent);
    return txt.includes("NO MATCH") || txt.includes("NOT FOUND") || txt.includes("NO RECORD");
  }

  function clearFalseNoMatch(record){
    if(record && isNavType(record)){
      forceStatus("Found");
    }
  }


  function clearAirportOutputsForNav(record){
    if(!record || !isNavType(record)) return;

    const idsToClear = [
      "sector",
      "area",
      "approach",
      "appVscs",
      "appContact",
      "appHours"
    ];

    idsToClear.forEach(function(id){
      const el = document.getElementById(id);
      if(el){
        el.textContent = "—";
        el.innerHTML = "—";
        el.title = "";
      }
      const card = el ? el.closest(".card") : null;
      if(card){
        card.classList.remove("nearest-wx-highlight", "highlight", "active", "warning");
        card.style.borderColor = "";
        card.style.boxShadow = "";
      }
    });

    const nameEl = document.getElementById("airportName");
    if(nameEl){
      nameEl.textContent = record.airport_name || record.name || lastLookupIdent || "Navaid/Waypoint";
      nameEl.title = "";
      const card = nameEl.closest(".card");
      if(card){
        card.classList.remove("nearest-wx-highlight", "highlight", "active", "warning");
        card.style.borderColor = "";
        card.style.boxShadow = "";
      }
    }

    // Remove accidental highlight from all cards except nearest weather station.
    document.querySelectorAll(".card").forEach(function(card){
      const isNearest = card.contains(document.getElementById("nearestWeather"));
      if(!isNearest){
        card.classList.remove("nearest-wx-highlight", "highlight", "active", "warning");
        card.style.borderColor = "";
        card.style.boxShadow = "";
      }
    });

    hideMapForNav(record);
  }

  function writeNearest(output, nearest, ident, record){
    output.textContent = nearest.id;
    output.title = nearest.title || "";
    lastLookupIdent = ident || lastLookupIdent;
    lastDisplayedWx = nearest.id;
    lastDisplayedTitle = nearest.title || "";
    lastFoundWasNav = isNavType(record);
    lastFoundRecord = record || null;
    clearFalseNoMatch(record);
  }

  function restoreLast(output){
    if(!lastDisplayedWx) return false;
    output.textContent = lastDisplayedWx;
    output.title = lastDisplayedTitle || "";
    if(lastFoundWasNav) forceStatus("Found");
    return true;
  }

  function updateNearestWeather(){
    const input = document.getElementById("airportInput");
    const output = document.getElementById("nearestWeather");
    if(!input || !output) return;

    const typedIdent = normalizeIdent(input.value);

    if(!typedIdent){
      restoreLast(output);
      if(lastFoundWasNav && statusLooksBad()) forceStatus("Found");
        if(lastFoundWasNav) clearAirportOutputsForNav(lastFoundRecord);
      return;
    }

    const record = getRecord(typedIdent);
    if(record && isNavType(record)) { clearFalseNoMatch(record); clearAirportOutputsForNav(record); }

    const nearest = calculateNearest(record);
    if(!nearest){
      // Do not erase a valid previous navaid result because app.js may clear/rewrite the input after lookup.
      if(!record && lastFoundWasNav && lastDisplayedWx){
        restoreLast(output);
        return;
      }

      output.textContent = "—";
      output.title = "No nearest weather reporting station assigned.";
      lastDisplayedWx = "";
      lastDisplayedTitle = "";
      lastFoundWasNav = false;
      lastFoundRecord = null;
      return;
    }

    writeNearest(output, nearest, typedIdent, record);
  }

  function scheduleUpdate(){
    setTimeout(updateNearestWeather, 0);
    setTimeout(updateNearestWeather, 100);
    setTimeout(updateNearestWeather, 300);
    setTimeout(updateNearestWeather, 700);
    setTimeout(updateNearestWeather, 1200);
  }

  function wire(){
    mergeNavData();

    const input = document.getElementById("airportInput");
    if(input){
      ["input","change","keyup","blur"].forEach(function(evt){ input.addEventListener(evt, scheduleUpdate); });
    }

    // Hard guard: app.js can leave "NO MATCH: X" behind after clearing input.
    // If we have a valid navpoint result, keep the displayed status synchronized.
    setInterval(function(){
      const input = document.getElementById("airportInput");
      const output = document.getElementById("nearestWeather");
      if(!input || !output) return;

      const typedIdent = normalizeIdent(input.value);
      const outText = normalizeIdent(output.textContent);

      if(typedIdent){
        updateNearestWeather();
      } else {
        if(lastDisplayedWx && (!outText || outText === "—")) restoreLast(output);
        if(lastFoundWasNav && statusLooksBad()) forceStatus("Found");
        if(lastFoundWasNav) clearAirportOutputsForNav(lastFoundRecord);
      }
    }, 250);

    scheduleUpdate();
  }

  window.ZFW_UPDATE_NEAREST_WX = updateNearestWeather;
  window.ZFW_MERGE_NAV_DATA = mergeNavData;

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire);
  else wire();
})();