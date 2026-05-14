(function(){
  "use strict";

  function ensureAirportData(){
    if(!window.AIRPORT_DATA) window.AIRPORT_DATA = { records: {} };
    if(!window.AIRPORT_DATA.records) window.AIRPORT_DATA.records = {};
    return window.AIRPORT_DATA.records;
  }

  function normalizeIdent(value){
    return String(value || "").trim().toUpperCase();
  }

  function aliasForIdent(ident){
    ident = normalizeIdent(ident);
    if(ident.length === 4 && ident.startsWith("K")) return ident.slice(1);
    if(ident.length === 3) return "K" + ident;
    return "";
  }

  function cloneRecord(record){
    return JSON.parse(JSON.stringify(record || {}));
  }

  function normalizeLookupRecord(ident, sourceRecord){
    const record = cloneRecord(sourceRecord);
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

    return record;
  }

  function mergeNavData(){
    const records = ensureAirportData();
    const navData = window.ZFW_NAV_DATA || {};
    Object.keys(navData).forEach(function(rawIdent){
      const ident = normalizeIdent(rawIdent);
      if(!ident) return;

      const record = normalizeLookupRecord(ident, navData[rawIdent]);
      records[ident] = record;

      const alias = aliasForIdent(ident);
      if(alias && !records[alias]){
        records[alias] = cloneRecord(record);
      }
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

  function nmBetween(aLat, aLon, bLat, bLon){
    const earthRadiusNm = 3440.065;
    const dLat = toRad(bLat - aLat);
    const dLon = toRad(bLon - aLon);
    const lat1 = toRad(aLat);
    const lat2 = toRad(bLat);
    const h =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);

    return 2 * earthRadiusNm * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  function nearestWeatherStation(record){
    const stations = window.ZFW_WEATHER_STATIONS || [];
    if(!record || typeof record.lat !== "number" || typeof record.lon !== "number" || stations.length === 0) return null;

    let best = null;
    stations.forEach(function(station){
      if(typeof station.lat !== "number" || typeof station.lon !== "number") return;

      const distanceNm = nmBetween(record.lat, record.lon, station.lat, station.lon);
      if(!best || distanceNm < best.distanceNm){
        best = {
          id: station.id,
          name: station.name || "",
          distanceNm: distanceNm
        };
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

    const record = getRecord(ident);
    const nearest = nearestWeatherStation(record);

    if(!nearest){
      output.textContent = "—";
      output.title = "No location or weather station data available.";
      return;
    }

    output.textContent = nearest.id;
    output.title = nearest.name ? nearest.name + " — " + nearest.distanceNm.toFixed(1) + " NM" : nearest.distanceNm.toFixed(1) + " NM";
  }

  function wireNearestWeather(){
    const input = document.getElementById("airportInput");
    if(!input) return;

    ["input", "change", "keyup"].forEach(function(eventName){
      input.addEventListener(eventName, function(){
        setTimeout(updateNearestWeather, 0);
      });
    });

    updateNearestWeather();
  }

  mergeNavData();

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", wireNearestWeather);
  } else {
    wireNearestWeather();
  }
})();
