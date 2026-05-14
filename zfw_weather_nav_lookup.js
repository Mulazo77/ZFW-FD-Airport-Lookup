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
    return record;
  }

  function mergeUnique(base, add){
    const out = Array.isArray(base) ? base.slice() : [];
    (Array.isArray(add) ? add : []).forEach(function(item){
      if(item && !out.includes(item)) out.push(item);
    });
    return out;
  }

  function displayBothName(existing, nav, ident){
    const existingName = existing.airport_name || existing.name || ident;
    const navName = nav.airport_name || nav.name || ident;
    if(existingName === navName) return existingName;
    return existingName + " / " + navName;
  }

  function mergeNavRecordInto(records, ident, navRecord){
    const nav = normalizeRecord(ident, navRecord);
    if(records[ident]){
      const existing = records[ident];
      existing.airport_name = displayBothName(existing, nav, ident);
      existing.sectors = mergeUnique(existing.sectors, nav.sectors);
      existing.areas = mergeUnique(existing.areas, nav.areas);
      existing.apps = mergeUnique(existing.apps, nav.apps);
      existing.vscs = mergeUnique(existing.vscs, nav.vscs);
      existing.contacts = mergeUnique(existing.contacts, nav.contacts);
      existing.hours = mergeUnique(existing.hours, nav.hours);
      if(!Number.isFinite(existing.lat) && Number.isFinite(nav.lat)) existing.lat = nav.lat;
      if(!Number.isFinite(existing.lon) && Number.isFinite(nav.lon)) existing.lon = nav.lon;
      existing.record_type = existing.record_type ? existing.record_type + "/NAVAID" : "AIRPORT/NAVAID";
      existing.nav_name = nav.airport_name || nav.name || ident;
    } else {
      records[ident] = nav;
    }
  }

  function mergeNavData(){
    const records = ensureAirportData();
    const navData = window.ZFW_NAV_DATA || {};
    Object.keys(navData).forEach(function(rawIdent){
      const ident = normalizeIdent(rawIdent);
      if(!ident) return;
      mergeNavRecordInto(records, ident, navData[rawIdent]);
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
    const R=3440.065, dLat=toRad(bLat-aLat), dLon=toRad(bLon-aLon), lat1=toRad(aLat), lat2=toRad(bLat);
    const h=Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
    return 2*R*Math.atan2(Math.sqrt(h), Math.sqrt(1-h));
  }

  function nearestWeatherStation(record){
    const stations = window.ZFW_WEATHER_STATIONS || [];
    if(!record || !Number.isFinite(record.lat) || !Number.isFinite(record.lon) || !stations.length) return null;
    let best=null;
    stations.forEach(function(station){
      if(!Number.isFinite(station.lat) || !Number.isFinite(station.lon)) return;
      const distanceNm=nmBetween(record.lat,record.lon,station.lat,station.lon);
      if(!best || distanceNm<best.distanceNm) best={id:station.id,name:station.name||"",distanceNm};
    });
    return best;
  }

  function updateNearestWeather(){
    const input=document.getElementById("airportInput");
    const output=document.getElementById("nearestWeather");
    if(!input || !output) return;
    const ident=normalizeIdent(input.value);
    if(!ident){ output.textContent="—"; output.title=""; return; }
    const record = getRecord(ident);
    if(record && record.nearest_wx){
      output.textContent = String(record.nearest_wx).toUpperCase();
      output.title = "Manually assigned nearest weather reporting station.";
      return;
    }

    const nearest=nearestWeatherStation(record);
    if(!nearest){ output.textContent="—"; output.title="No location or weather station data available."; return; }
    output.textContent=nearest.id;
    output.title=nearest.name ? nearest.name+" — "+nearest.distanceNm.toFixed(1)+" NM" : nearest.distanceNm.toFixed(1)+" NM";
  }

  function wireNearestWeather(){
    const input=document.getElementById("airportInput");
    if(!input) return;
    ["input","change","keyup","blur"].forEach(function(evt){
      input.addEventListener(evt,function(){
        setTimeout(updateNearestWeather,0);
        setTimeout(updateNearestWeather,75);
        setTimeout(updateNearestWeather,200);
      });
    });
    const grid=document.querySelector(".grid");
    if(grid && window.MutationObserver){
      new MutationObserver(function(){ updateNearestWeather(); }).observe(grid,{childList:true,subtree:true,characterData:true});
    }
    updateNearestWeather();
  }

  mergeNavData();
  window.ZFW_UPDATE_NEAREST_WX = updateNearestWeather;
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",wireNearestWeather);
  else wireNearestWeather();
})();