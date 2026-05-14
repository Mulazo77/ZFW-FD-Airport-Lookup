(function(){
  "use strict";

  let lastAdjacentIdent = "";
  let lastAdjacentText = "";

  function normalizeIdent(value){
    return String(value || "").trim().toUpperCase();
  }

  function isCompleteAirportIdent(ident){
    ident = normalizeIdent(ident);
    return /^[A-Z0-9]{3}$/.test(ident) || /^K[A-Z0-9]{3}$/.test(ident);
  }

  function airportAliases(ident){
    ident = normalizeIdent(ident);
    if(!isCompleteAirportIdent(ident)) return [];

    const aliases = [ident];

    if(ident.length === 4 && ident.startsWith("K")){
      aliases.push(ident.slice(1));
    } else if(ident.length === 3){
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
    if(el){
      el.textContent = value || "—";
      el.title = "";
    }
  }

  function setHtml(id, value){
    const el = document.getElementById(id);
    if(el){
      el.innerHTML = value || "—";
      el.title = "";
    }
  }

  function clearHighlights(){
    document.querySelectorAll(".card").forEach(card => {
      card.classList.remove("nearest-wx-highlight", "highlight", "active", "warning");
      card.style.borderColor = "";
      card.style.boxShadow = "";
    });
  }

  function hideMap(){
    const mapCard = document.querySelector(".map-card") || document.getElementById("zfwMap")?.closest(".card");
    if(mapCard) mapCard.style.display = "none";
  }

  function forceStatus(value){
    const status = document.getElementById("status");
    if(status){
      status.textContent = value;
      status.classList.remove("error", "not-found");
      status.style.color = "#ffd166";
    }
  }

  function clearStalePartialEntry(){
    const input = document.getElementById("airportInput");
    const ident = normalizeIdent(input ? input.value : "");

    // No lookup should occur before 3 characters.
    if(ident && ident.length < 3){
      setText("sector", "—");
      setText("area", "—");
      setText("approach", "—");
      setText("appVscs", "—");
      setHtml("appContact", "—");
      setText("appHours", "—");
      setText("airportName", "—");
      setText("nearestWeather", "—");
      hideMap();
      const status = document.getElementById("status");
      if(status){
        status.textContent = "Ready";
        status.style.color = "";
      }
    }
  }

  function showAdjacent(info){
    const db = window.ZFW_ADJACENT_ARTCC_AIRPORTS || {};
    const centers = db.centers || {};
    const rec = info.record || {};
    const centerId = normalizeIdent(rec.center);
    const center = centers[centerId] || { name: centerId + " ARTCC", fdcd: rec.fdcd || "" };
    const fdcd = rec.fdcd || center.fdcd || "";

    const displayIdent = normalizeIdent(info.ident).startsWith("K")
      ? normalizeIdent(info.ident).slice(1)
      : normalizeIdent(info.ident);

    const statusLine = `${displayIdent}: ${centerId} FD/CD ${fdcd}`;

    lastAdjacentIdent = displayIdent;
    lastAdjacentText = statusLine;

    clearHighlights();

    setText("sector", "Outside ZFW");
    setText("area", centerId);
    setText("approach", "Outside ZFW ARTCC");
    setText("appVscs", "—");
    setHtml("appContact", `${rec.name || displayIdent} is in ${center.name || centerId} airspace. ${centerId} Flight Data Clearance Delivery: ${fdcd}`);
    setText("appHours", "0000-2359");
    setText("airportName", rec.name || displayIdent);

    // Adjacent ARTCC/wrong-airspace lookup does not need weather.
    setText("nearestWeather", "—");

    const contactCard = document.getElementById("appContact")?.closest(".card");
    if(contactCard){
      contactCard.classList.add("nearest-wx-highlight");
    }

    forceStatus(statusLine);
    hideMap();

    const input = document.getElementById("airportInput");
    if(input && normalizeIdent(input.value)){
      setTimeout(() => { input.value = ""; }, 650);
    }
  }

  function handleInput(){
    const input = document.getElementById("airportInput");
    if(!input) return;

    const ident = normalizeIdent(input.value);

    if(!ident){
      return;
    }

    if(!isCompleteAirportIdent(ident)){
      clearStalePartialEntry();
      return;
    }

    // If it exists in ZFW, the primary app handles it.
    if(getZfwRecord(ident)){
      return;
    }

    const adjacent = getAdjacentRecord(ident);
    if(adjacent){
      [0, 150, 500, 1000].forEach(t => setTimeout(() => showAdjacent(adjacent), t));
    }
  }

  function boot(){
    const input = document.getElementById("airportInput");
    if(input){
      ["input", "change", "keyup", "blur"].forEach(evt => input.addEventListener(evt, handleInput));
    }

    setInterval(() => {
      clearStalePartialEntry();

      const status = document.getElementById("status");
      if(lastAdjacentIdent && status && /NO MATCH|NOT FOUND/i.test(status.textContent || "")){
        const adjacent = getAdjacentRecord(lastAdjacentIdent);
        if(adjacent) showAdjacent(adjacent);
        else if(lastAdjacentText) forceStatus(lastAdjacentText);
      }
    }, 250);
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();