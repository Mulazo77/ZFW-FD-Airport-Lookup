(function(){
  "use strict";

  let lastAdjacentIdent = "";

  function normalizeIdent(value){
    return String(value || "").trim().toUpperCase();
  }

  function airportAliases(ident){
    ident = normalizeIdent(ident);
    const aliases = [ident];

    if(ident.length === 4 && ident.startsWith("K")){
      aliases.push(ident.slice(1));
    } else if(ident.length === 3 && /^[A-Z0-9]{3}$/.test(ident)){
      aliases.push("K" + ident);
    }

    return [...new Set(aliases)];
  }

  function getZfwRecord(ident){
    const records = window.AIRPORT_DATA?.records || {};
    for(const alias of airportAliases(ident)){
      if(records[alias]) return records[alias];
    }
    return null;
  }

  function getAdjacentRecord(ident){
    const db = window.ZFW_ADJACENT_ARTCC_AIRPORTS || {};
    const airports = db.airports || {};

    for(const alias of airportAliases(ident)){
      if(airports[alias]) return { ident: alias, record: airports[alias] };
    }

    return null;
  }

  function setText(id, value){
    const el = document.getElementById(id);
    if(el) el.textContent = value || "—";
  }

  function setHtml(id, value){
    const el = document.getElementById(id);
    if(el) el.innerHTML = value || "—";
  }

  function forceStatus(value, isWarning){
    const status = document.getElementById("status");
    if(!status) return;

    status.textContent = value;
    status.classList.remove("error", "not-found");
    status.style.color = isWarning ? "#ffd166" : "";
  }

  function clearMap(){
    const mapCard = document.querySelector(".map-card") || document.getElementById("zfwMap")?.closest(".card");
    if(mapCard) mapCard.style.display = "none";
  }

  function showAdjacent(recordInfo){
    const db = window.ZFW_ADJACENT_ARTCC_AIRPORTS || {};
    const centers = db.centers || {};
    const rec = recordInfo.record || {};
    const centerId = normalizeIdent(rec.center);
    const center = centers[centerId] || { name: centerId + " ARTCC", fdcd: rec.fdcd || "" };
    const fdcd = rec.fdcd || center.fdcd || "";

    lastAdjacentIdent = recordInfo.ident;

    setText("sector", centerId);
    setText("area", center.name || centerId);
    setText("approach", "Outside ZFW ARTCC");
    setText("appVscs", "—");
    setHtml("appContact", `<strong>${centerId} Flight Data Clearance Delivery:</strong> ${fdcd}`);
    setText("appHours", "0000-2359");
    setText("airportName", rec.name || recordInfo.ident);
    setText("nearestWeather", "—");

    const nearestCard = document.getElementById("nearestWeatherCard") || document.getElementById("nearestWeather")?.closest(".card");
    if(nearestCard) nearestCard.classList.remove("nearest-wx-highlight");

    forceStatus(`${recordInfo.ident}: ${centerId} FD/CD ${fdcd}`, true);
    clearMap();
  }

  function handleInput(){
    const input = document.getElementById("airportInput");
    if(!input) return;

    const ident = normalizeIdent(input.value);
    if(!ident) return;

    // If it exists in the ZFW dataset, let the normal app handle it.
    if(getZfwRecord(ident)) return;

    const adjacent = getAdjacentRecord(ident);
    if(adjacent){
      setTimeout(function(){ showAdjacent(adjacent); }, 0);
      setTimeout(function(){ showAdjacent(adjacent); }, 150);
      setTimeout(function(){ showAdjacent(adjacent); }, 500);
    }
  }

  function boot(){
    const input = document.getElementById("airportInput");
    if(input){
      ["input","change","keyup","blur"].forEach(function(evt){
        input.addEventListener(evt, handleInput);
      });
    }

    setInterval(function(){
      const status = document.getElementById("status");
      if(lastAdjacentIdent && status && /NO MATCH|NOT FOUND/i.test(status.textContent || "")){
        const adjacent = getAdjacentRecord(lastAdjacentIdent);
        if(adjacent) showAdjacent(adjacent);
      }
    }, 400);
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
