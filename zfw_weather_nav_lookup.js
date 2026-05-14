(function(){
  "use strict";

  let lastLookupIdent = "";
  let lastDisplayedWx = "";
  let lastDisplayedTitle = "";
  let lastFoundWasNav = false;
  let lastFoundRecord = null;

  function normalizeIdent(value){ return String(value || "").trim().toUpperCase(); }

  function isCompleteLookupIdent(ident){
    ident = normalizeIdent(ident);
    return ident.length >= 3;
  }

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
    return !!((Array.isArray(record.apps) && record.apps.length) || (Array.isArray(record.sectors) && record.sectors.length) || (Array.isArray(record.contacts) && record.contacts.length) || (Array.isArray(record.hours) && record.hours.length));
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
    (Array.isArray(add) ? add : []).forEach(item => { if(item && !out.includes(item)) out.push(item); });
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
    return Object.assign({}, window.ZFW_NAV_DATA || {}, window.ZFW_SUPPLEMENTAL_NAVAIDS || {}, window.ZFW_SUPPLEMENTAL_WAYPOINTS || {});
  }

  function mergeNavData(){
    const records = ensureAirportData();
    const navData = sourceNavData();

    Object.keys(navData).forEach(rawIdent => {
      let ident = normalizeIdent(rawIdent);
      if(!ident) return;
      if(ident.length === 4 && ident.startsWith("K")) ident = ident.slice(1);

      const nav = normalizeNavRecord(ident, navData[rawIdent]);

      if(records[ident]){
        const existing = records[ident];
        const existingIsAirport = isAirportRecord(existing);

        const existingName = existing.airport_name || existing.name || ident;
        const navName = nav.airport_name || nav.name || ident;
        if(navName && existingName && existingName !== navName && !existingName.includes(navName)){
          existing.airport_name = existingName + " / " + navName;
        }

        if(existingIsAirport){
          existing.record_type = "AIRPORT";
          if(nav.nearest_wx && !existing.nearest_wx) existing.nearest_wx = nav.nearest_wx;
          if(!Number.isFinite(existing.lat) && Number.isFinite(nav.lat)) existing.lat = nav.lat;
          if(!Number.isFinite(existing.lon) && Number.isFinite(nav.lon)) existing.lon = nav.lon;
        } else {
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
        }
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
    const match = stations.find(station => {
      const sid = normalizeIdent(station.id);
      return sid === id || normalizeIdent("K" + sid) === id;
    });
    return match ? (match.name || "") : "";
  }

  function calculateNearest(record){
    if(!record) return null;
    if(record.nearest_wx){
      const id = normalizeIdent(record.nearest_wx);
      return { id, title: stationNameById(id) || "Assigned nearest weather reporting station" };
    }
    const stations = window.ZFW_WEATHER_STATIONS || [];
    if(!Number.isFinite(record.lat) || !Number.isFinite(record.lon) || !stations.length) return null;
    let best = null;
    stations.forEach(station => {
      if(!Number.isFinite(station.lat) || !Number.isFinite(station.lon)) return;
      const distanceNm = nmBetween(record.lat, record.lon, station.lat, station.lon);
      if(!best || distanceNm < best.distanceNm) best = { id: normalizeIdent(station.id), name: station.name || "", distanceNm };
    });
    if(!best) return null;
    return { id: best.id, title: best.name ? best.name + " — " + best.distanceNm.toFixed(1) + " NM" : best.distanceNm.toFixed(1) + " NM" };
  }

  function forceStatus(text){
    const status = document.getElementById("status");
    if(status){
      status.textContent = text;
      status.classList.remove("error", "not-found");
      status.style.color = "";
    }
  }

  function statusLooksBad(){
    const status = document.getElementById("status");
    if(!status) return false;
    const txt = normalizeIdent(status.textContent);
    return txt.includes("NO MATCH") || txt.includes("NOT FOUND") || txt.includes("NO RECORD");
  }

  function nearestWeatherCard(){
    return document.getElementById("nearestWeatherCard") || document.getElementById("nearestWeather")?.closest(".card");
  }

  function setNearestHighlight(on){
    const card = nearestWeatherCard();
    if(!card) return;
    if(on){
      card.classList.add("nearest-wx-highlight");
      card.style.borderColor = "#ffd166";
      card.style.boxShadow = "0 0 0 2px rgba(255,209,102,.45),0 0 16px rgba(255,209,102,.35)";
    } else {
      card.classList.remove("nearest-wx-highlight");
      card.style.borderColor = "";
      card.style.boxShadow = "";
    }
  }

  function injectHighlightStyle(){
    if(document.getElementById("nearestWxHighlightStyle")) return;
    const style = document.createElement("style");
    style.id = "nearestWxHighlightStyle";
    style.textContent = `.nearest-wx-highlight{border-color:#ffd166!important;box-shadow:0 0 0 2px rgba(255,209,102,.45),0 0 16px rgba(255,209,102,.35)!important}.nearest-wx-highlight .card-title,.nearest-wx-highlight .card-value{color:#ffd166!important}`;
    document.head.appendChild(style);
  }

  function hideMapForNav(record){
    const mapCard = document.querySelector(".map-card") || document.getElementById("zfwMap")?.closest(".card");
    if(mapCard) mapCard.style.display = (record && isNavType(record)) ? "none" : "";
  }

  function clearAirportOutputsForNav(record){
    if(!record || !isNavType(record)) return;
    ["sector","area","approach","vscs","contact","hours"].forEach(id => {
      const el = document.getElementById(id);
      if(el){ el.textContent = "—"; el.innerHTML = "—"; el.title = ""; }
      const card = el ? el.closest(".card") : null;
      if(card){ card.classList.remove("nearest-wx-highlight","highlight","active","warning"); card.style.borderColor = ""; card.style.boxShadow = ""; }
    });
    const nameEl = document.getElementById("airportName");
    if(nameEl) nameEl.textContent = record.airport_name || record.name || lastLookupIdent || "Navaid/Waypoint";
    document.querySelectorAll(".card").forEach(card => {
      const isNearest = card.contains(document.getElementById("nearestWeather"));
      if(!isNearest){ card.classList.remove("nearest-wx-highlight","highlight","active","warning"); card.style.borderColor = ""; card.style.boxShadow = ""; }
    });
    hideMapForNav(record);
  }


  function clearInputAfterLookup(){
    const input = document.getElementById("airportInput");
    if(!input) return;
    if(!normalizeIdent(input.value)) return;
    setTimeout(() => { input.value = ""; }, 650);
  }

  function writeNearest(output, nearest, ident, record){
    output.textContent = nearest.id;
    output.title = nearest.title || "";
    lastLookupIdent = ident || lastLookupIdent;
    lastDisplayedWx = nearest.id;
    lastDisplayedTitle = nearest.title || "";
    lastFoundWasNav = isNavType(record);
    lastFoundRecord = record || null;

    if(isNavType(record)){
      forceStatus((ident || lastLookupIdent || "Found") + ": Found");
      clearAirportOutputsForNav(record);
      setNearestHighlight(true);
      hideMapForNav(record);
      clearInputAfterLookup();
    } else {
      setNearestHighlight(false);
      hideMapForNav(record);
    }
  }

  function restoreLast(output){
    if(!lastDisplayedWx) return false;
    output.textContent = lastDisplayedWx;
    output.title = lastDisplayedTitle || "";
    if(lastFoundWasNav){
      forceStatus("Found");
      clearAirportOutputsForNav(lastFoundRecord);
      setNearestHighlight(true);
      hideMapForNav(lastFoundRecord);
    }
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
      return;
    }

    if(!isCompleteLookupIdent(typedIdent)){
      output.textContent = "—";
      output.title = "";
      return;
    }

    if(!isCompleteLookupIdent(typedIdent)){
      output.textContent = "—";
      output.title = "";
      return;
    }

    const record = getRecord(typedIdent);
    if(record && isNavType(record)){ forceStatus("Found"); clearAirportOutputsForNav(record); }

    const nearest = calculateNearest(record);
    if(!nearest){
      if(!record && lastFoundWasNav && lastDisplayedWx){ restoreLast(output); return; }
      output.textContent = "—";
      output.title = "No nearest weather reporting station assigned.";
      lastDisplayedWx = "";
      lastDisplayedTitle = "";
      lastFoundWasNav = false;
      lastFoundRecord = null;
      setNearestHighlight(false);
      hideMapForNav(record);
      return;
    }

    writeNearest(output, nearest, typedIdent, record);
  }

  function scheduleUpdate(){ [0,100,300,700,1200].forEach(t => setTimeout(updateNearestWeather, t)); }

  function wire(){
    injectHighlightStyle();
    mergeNavData();

    const input = document.getElementById("airportInput");
    if(input) ["input","change","keyup","blur"].forEach(evt => input.addEventListener(evt, scheduleUpdate));

    setInterval(() => {
      const input = document.getElementById("airportInput");
      const output = document.getElementById("nearestWeather");
      if(!input || !output) return;
      const typedIdent = normalizeIdent(input.value);
      const outText = normalizeIdent(output.textContent);
      if(typedIdent) updateNearestWeather();
      else {
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