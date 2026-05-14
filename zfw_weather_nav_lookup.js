(function(){
  "use strict";

  let lastInputValue = "";
  let lastDisplayedWx = "";

  function normalizeIdent(value){
    return String(value || "").trim().toUpperCase();
  }

  function ensureAirportData(){
    if(!window.AIRPORT_DATA) window.AIRPORT_DATA = { records: {} };
    if(!window.AIRPORT_DATA.records) window.AIRPORT_DATA.records = {};
    return window.AIRPORT_DATA.records;
  }

  function aliasForIdent(ident){
    ident = normalizeIdent(ident);
    if(ident.length === 4 && ident.startsWith("K")) return ident.slice(1);
    if(ident.length === 3) return "K" + ident;
    return "";
  }

  function clone(record){
    return JSON.parse(JSON.stringify(record || {}));
  }

  function getRecord(ident){
    const records = ensureAirportData();
    ident = normalizeIdent(ident);

    if(records[ident]) return records[ident];

    const alias = aliasForIdent(ident);
    if(alias && records[alias]) return records[alias];

    return null;
  }

  function mergeUnique(base, add){
    const out = Array.isArray(base) ? base.slice() : [];
    (Array.isArray(add) ? add : []).forEach(function(item){
      if(item && !out.includes(item)) out.push(item);
    });
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
    rec.airport_name = rec.airport_name || rec.name || ident;
    if(rec.lat !== undefined) rec.lat = Number(rec.lat);
    if(rec.lon !== undefined) rec.lon = Number(rec.lon);
    if(rec.nearest_wx) rec.nearest_wx = normalizeIdent(rec.nearest_wx);
    return rec;
  }

  function mergeNavData(){
    const records = ensureAirportData();
    const navData = window.ZFW_NAV_DATA || {};

    Object.keys(navData).forEach(function(rawIdent){
      const ident = normalizeIdent(rawIdent);
      if(!ident) return;

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

      const alias = aliasForIdent(ident);
      if(alias && !records[alias]) records[alias] = clone(records[ident]);
    });
  }

  function toRad(deg){ return deg * Math.PI / 180; }

  function nmBetween(aLat, aLon, bLat, bLon){
    const R = 3440.065;
    const dLat = toRad(bLat - aLat);
    const dLon = toRad(bLon - aLon);
    const lat1 = toRad(aLat);
    const lat2 = toRad(bLat);
    const h =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
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
      return {
        id: id,
        title: stationNameById(id) || "Assigned nearest weather reporting station"
      };
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

    return {
      id: best.id,
      title: best.name ? best.name + " — " + best.distanceNm.toFixed(1) + " NM" : best.distanceNm.toFixed(1) + " NM"
    };
  }

  function updateNearestWeather(){
    const input = document.getElementById("airportInput");
    const output = document.getElementById("nearestWeather");
    if(!input || !output) return;

    const ident = normalizeIdent(input.value);
    if(!ident){
      output.textContent = "—";
      output.title = "";
      lastDisplayedWx = "";
      return;
    }

    const record = getRecord(ident);
    const nearest = calculateNearest(record);

    if(!nearest){
      output.textContent = "—";
      output.title = "No nearest weather reporting station assigned.";
      lastDisplayedWx = "";
      return;
    }

    output.textContent = nearest.id;
    output.title = nearest.title;
    lastDisplayedWx = nearest.id;
  }

  function scheduleUpdate(){
    setTimeout(updateNearestWeather, 0);
    setTimeout(updateNearestWeather, 100);
    setTimeout(updateNearestWeather, 300);
    setTimeout(updateNearestWeather, 700);
  }

  function wire(){
    mergeNavData();

    const input = document.getElementById("airportInput");
    if(input){
      ["input", "change", "keyup", "blur"].forEach(function(evt){
        input.addEventListener(evt, scheduleUpdate);
      });
    }

    // Keep the field synchronized in case app.js writes after our event listener.
    setInterval(function(){
      const input = document.getElementById("airportInput");
      const output = document.getElementById("nearestWeather");
      if(!input || !output) return;

      const current = normalizeIdent(input.value);
      const outText = normalizeIdent(output.textContent);

      if(current !== lastInputValue || (current && (!outText || outText === "—" || outText !== lastDisplayedWx))){
        lastInputValue = current;
        updateNearestWeather();
      }
    }, 500);

    scheduleUpdate();
  }

  window.ZFW_UPDATE_NEAREST_WX = updateNearestWeather;
  window.ZFW_MERGE_NAV_DATA = mergeNavData;

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", wire);
  } else {
    wire();
  }
})();