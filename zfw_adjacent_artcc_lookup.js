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

  function clearHighlights(){
    document.querySelectorAll(".card").forEach(function(card){
      card.classList.remove("nearest-wx-highlight", "highlight", "active", "warning");
      card.style.borderColor = "";
      card.style.boxShadow = "";
    });
  }

  function forceStatus(value){
    const status = document.getElementById("status");
    if(!status) return;

    status.textContent = value;
    status.classList.remove("error", "not-found");
    status.style.color = "#ffd166";
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

    clearHighlights();

    setText("sector", "Outside ZFW");
    setText("area", centerId);
    setText("approach", "Outside ZFW ARTCC");
    setText("appVscs", "—");
    setHtml("appContact", `${rec.name || recordInfo.ident} is in ${center.name || centerId} airspace. ${centerId} Flight Data Clearance Delivery: ${fdcd}`);
    setText("appHours", "0000-2359");
    setText("airportName", rec.name || recordInfo.ident);
    setText("nearestWeather", "—");

    const contactCard = document.getElementById("appContact")?.closest(".card");
    if(contactCard){
      contactCard.classList.add("nearest-wx-highlight");
    }

    forceStatus(`${recordInfo.ident}: ${centerId} FD/CD ${fdcd}`);
    clearMap();
  }

  function handleInput(){
    const input = document.getElementById("airportInput");
    if(!input) return;

    const ident = normalizeIdent(input.value);
    if(!ident) return;

    if(getZfwRecord(ident)) return;

    const adjacent = getAdjacentRecord(ident);
    if(adjacent){
      setTimeout(function(){ showAdjacent(adjacent); }, 0);
      setTimeout(function(){ showAdjacent(adjacent); }, 150);
      setTimeout(function(){ showAdjacent(adjacent); }, 500);
      setTimeout(function(){ showAdjacent(adjacent); }, 1000);
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
    }, 300);
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
