(function(){
  "use strict";

  function ensureAirportData(){
    if(!window.AIRPORT_DATA) window.AIRPORT_DATA = { records: {} };
    if(!window.AIRPORT_DATA.records) window.AIRPORT_DATA.records = {};
    return window.AIRPORT_DATA.records;
  }

  function normalizeIdent(value){ return String(value || "").trim().toUpperCase(); }

  function aliasForIdent(ident){
    ident = normalizeIdent(ident);
    if(ident.length === 4 && ident.startsWith("K")) return ident.slice(1);
    if(ident.length === 3) return "K" + ident;
    return "";
  }

  function clone(record){ return JSON.parse(JSON.stringify(record || {})); }

  function normalizeRecord(ident, sourceRecord){
    const record = clone(sourceRecord);
    record.sectors = Array.isArray(record.sectors) ? record.sectors : [];
    record.areas = Array.isArray(record.areas) ? record.areas : [];
    record.apps = Array.isArray(record.apps) ? record.apps : [];
    record.vscs = Array.isArray(record.vscs) ? record.vscs : [];
    record.contacts = Array.isArray(record.contacts) ? record.contacts : [];
    record.hours = Array.isArray(record.hours) ? record.hours : [];
    record.airport_name = record.airport_name || record.name || ident;

    if(record.latitude_deg !== undefined && record.lat === undefined) record.lat = Number(record.latitude_deg);
    if(record.longitude_deg !== undefined && record.lon === undefined) record.lon = Number(record.longitude_deg);
    if(record.lat !== undefined) record.lat = Number(record.lat);
    if(record.lon !== undefined) record.lon = Number(record.lon);

    if(record.nearest_wx) record.nearest_wx = normalizeIdent(record.nearest_wx);

    return record;
  }

  function mergeUnique(base, add){
    const out = Array.isArray(base) ? base.slice() : [];
    (Array.isArray(add) ? add : []).forEach(function(item){
      if(item && !out.includes(item)) out.push(item);
    });
    return out;
  }

  function mergeName(existing, nav, ident){
    const existingName = existing.airport_name || existing.name || ident;
    const navName = nav.airport_name || nav.name || ident;
    if(existingName === navName) return existingName;
    if(existingName.includes(navName)) return existingName;
    return existingName + " / " + navName;
  }

  function mergeNavData(){
    const records = ensureAirportData();
    const navData = window.ZFW_NAV_DATA || {};

    Object.keys(navData).forEach(function(rawIdent){
      const ident = normalizeIdent(rawIdent);
      if(!ident) return;

      const nav = normalizeRecord(ident, navData[rawIdent]);

      if(records[ident]){
        const existing = records[ident];
        existing.airport_name = mergeName(existing, nav, ident);
        existing.sectors = mergeUnique(existing.sectors, nav.sectors);
        existing.areas = mergeUnique(existing.areas, nav.areas);
        existing.apps = mergeUnique(existing.apps, nav.apps);
        existing.vscs = mergeUnique(existing.vscs, nav.vscs);
        existing.contacts = mergeUnique(existing.contacts, nav.contacts);
        existing.hours = mergeUnique(existing.hours, nav.hours);
        if(!Number.isFinite(existing.lat) && Number.isFinite(nav.lat)) existing.lat = nav.lat;
        if(!Number.isFinite(existing.lon) && Number.isFinite(nav.lon)) existing.lon = nav.lon;
        if(nav.nearest_wx) existing.nearest_wx = nav.nearest_wx;
        existing.record_type = existing.record_type || "AIRPORT/NAVAID";
      } else {
        records[ident] = nav;
      }

      const alias = aliasForIdent(ident);
      if(alias && !records[alias]) records[alias] = clone(records[ident]);
    });
  }

  function getRecord(ident){
    const records = ensureAirportData();
    ident = normalizeIdent(ident);
    if(records[ident]) return records[ident];

    const alias = aliasForIdent(ident);
    if(alias && records[alias]) return records[alias];

    return null;
  }

  function toRad(deg){ return deg * Math.PI / 180; }

  function nmBetween(aLat,aLon,bLat,bLon){
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
      return normalizeIdent(station.id) === id || normalizeIdent("K" + station.id) === id;
    });
    return match ? (match.name || "") : "";
  }

  function nearestWeatherStation(record){
    if(!record) return null;

    // Priority 1: generated/manual nearest_wx from zfw_nav_data.js or Firestore.
    // This allows every waypoint/navaid to display a PIREP station even when coordinates are missing or approximate.
    if(record.nearest_wx){
      const id = normalizeIdent(record.nearest_wx);
      return { id: id, name: stationNameById(id) || "Assigned nearest weather reporting station", distanceNm: null };
    }

    const stations = window.ZFW_WEATHER_STATIONS || [];
    if(!Number.isFinite(record.lat) || !Number.isFinite(record.lon) || !stations.length) return null;

    let best = null;
    stations.forEach(function(station){
      if(!Number.isFinite(station.lat) || !Number.isFinite(station.lon)) return;
      const distanceNm = nmBetween(record.lat, record.lon, station.lat, station.lon);
      if(!best || distanceNm < best.distanceNm){
        best = { id: station.id, name: station.name || "", distanceNm: distanceNm };
      }
    });
    return best;
  }

  function updateNearestWeather(){
    const input = document.getElementById("airportInput");
    const output = document.getElementById("nearestWeather");
    if(!input || !output) return;

    const ident = normalizeIdent(input.value);
    if(!ident){
      output.textContent = "—";
      output.title = "";
      return;
    }

    const nearest = nearestWeatherStation(getRecord(ident));
    if(!nearest){
      output.textContent = "—";
      output.title = "No nearest weather reporting station assigned.";
      return;
    }

    output.textContent = nearest.id;
    if(nearest.distanceNm === null){
      output.title = nearest.name || "Assigned nearest weather reporting station";
    } else {
      output.title = nearest.name ? nearest.name + " — " + nearest.distanceNm.toFixed(1) + " NM" : nearest.distanceNm.toFixed(1) + " NM";
    }
  }

  function wireNearestWeather(){
    const input = document.getElementById("airportInput");
    if(!input) return;

    ["input", "change", "keyup", "blur"].forEach(function(evt){
      input.addEventListener(evt, function(){
        setTimeout(updateNearestWeather, 0);
        setTimeout(updateNearestWeather, 150);
      });
    });

    updateNearestWeather();
  }

  mergeNavData();

  window.ZFW_UPDATE_NEAREST_WX = updateNearestWeather;

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", wireNearestWeather);
  } else {
    wireNearestWeather();
  }
})();