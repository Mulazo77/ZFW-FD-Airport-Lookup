(function(){
  "use strict";

  let activeAdjacentIdent = "";
  let inputClearTimer = null;

  function normalizeIdent(value){
    return String(value || "").trim().toUpperCase();
  }

  function isCompleteAirportIdent(ident){
    ident = normalizeIdent(ident);
    return /^[A-Z0-9]{3}$/.test(ident) || /^K[A-Z0-9]{3}$/.test(ident);
  }

  function aliasesFor(ident){
    ident = normalizeIdent(ident);
    if(!isCompleteAirportIdent(ident)) return [];

    if(ident.length === 4 && ident.startsWith("K")){
      return [ident, ident.slice(1)];
    }

    if(ident.length === 3){
      return [ident, "K" + ident];
    }

    return [ident];
  }

  function getAdjacentRecord(ident){
    const airports = window.ZFW_ADJACENT_ARTCC_AIRPORTS?.airports || {};

    for(const alias of aliasesFor(ident)){
      if(airports[alias]){
        return {
          ident: alias.startsWith("K") ? alias.slice(1) : alias,
          record: airports[alias]
        };
      }
    }

    return null;
  }

  function getZfwRecord(ident){
    const records = window.AIRPORT_DATA?.records || {};

    for(const alias of aliasesFor(ident)){
      if(records[alias]) return records[alias];
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

  function setStatus(text, warning){
    const status = document.getElementById("status");
    if(status){
      status.textContent = text;
      status.classList.remove("error", "not-found");
      status.style.color = warning ? "#ffd166" : "";
    }
  }

  function clearHighlights(){
    document.querySelectorAll(".card").forEach(card => {
      card.classList.remove("nearest-wx-highlight", "highlight", "active", "warning");
      card.style.borderColor = "";
      card.style.boxShadow = "";
    });
  }

  function mapCard(){
    return document.querySelector(".map-card") || document.getElementById("zfwMap")?.closest(".card");
  }

  function showMapContainer(){
    const card = mapCard();
    if(card){
      card.style.display = "";
    }
  }

  function blankMapForAdjacent(){
    showMapContainer();

    const map = document.getElementById("zfwMap");
    if(!map) return;

    // Do not hide the map card. Just suppress plotted airport/navaid markers
    // while an adjacent ARTCC result is active.
    map.querySelectorAll(".airport-marker, .navaid-marker, .waypoint-marker, .map-marker, circle, text").forEach(el => {
      const text = normalizeIdent(el.textContent);
      if(text && text.includes("NO AIRPORT SELECTED")) return;
      el.style.display = "none";
    });
  }

  function restoreMapForZfw(){
    activeAdjacentIdent = "";

    const map = document.getElementById("zfwMap");
    if(map){
      map.querySelectorAll(".airport-marker, .navaid-marker, .waypoint-marker, .map-marker, circle, text").forEach(el => {
        el.style.display = "";
      });
    }

    showMapContainer();
  }

  function clearPartialDisplay(){
    activeAdjacentIdent = "";

    setText("sector", "—");
    setText("area", "—");
    setText("approach", "—");
    setText("appVscs", "—");
    setHtml("appContact", "—");
    setText("appHours", "—");
    setText("airportName", "—");
    setText("nearestWeather", "—");

    restoreMapForZfw();
    setStatus("Ready", false);
  }

  function clearInputSoon(expectedIdent){
    const input = document.getElementById("airportInput");
    if(!input) return;

    clearTimeout(inputClearTimer);
    inputClearTimer = setTimeout(() => {
      const current = normalizeIdent(input.value);
      if(current === expectedIdent || current === "K" + expectedIdent){
        input.value = "";
      }
    }, 650);
  }

  function suppressAdjacentWx(){
    if(!activeAdjacentIdent) return;
    setText("nearestWeather", "—");
  }

  function showAdjacent(typedIdent, adjacent){
    const input = document.getElementById("airportInput");
    const currentInput = normalizeIdent(input?.value || "");
    const expected = normalizeIdent(typedIdent);

    if(currentInput && currentInput !== expected && currentInput !== "K" + expected){
      return;
    }

    const db = window.ZFW_ADJACENT_ARTCC_AIRPORTS || {};
    const centers = db.centers || {};
    const rec = adjacent.record || {};
    const centerId = normalizeIdent(rec.center);
    const center = centers[centerId] || {};
    const fdcd = rec.fdcd || center.fdcd || "";
    const displayIdent = adjacent.ident;
    const statusLine = `${displayIdent}: ${centerId} FD/CD ${fdcd}`;

    activeAdjacentIdent = displayIdent;

    clearHighlights();

    setText("sector", "Outside ZFW");
    setText("area", centerId);
    setText("approach", "Outside ZFW ARTCC");
    setText("appVscs", "—");
    setHtml("appContact", `${rec.name || displayIdent} is in ${center.name || centerId + " ARTCC"} airspace. ${centerId} Flight Data Clearance Delivery: ${fdcd}`);
    setText("appHours", "0000-2359");
    setText("airportName", rec.name || displayIdent);

    // No airports/navaids outside ZFW display nearest WX.
    setText("nearestWeather", "—");

    const contactCard = document.getElementById("appContact")?.closest(".card");
    if(contactCard){
      contactCard.classList.add("nearest-wx-highlight");
    }

    setStatus(statusLine, true);
    blankMapForAdjacent();
    clearInputSoon(displayIdent);
  }

  function handleInput(){
    const input = document.getElementById("airportInput");
    if(!input) return;

    const ident = normalizeIdent(input.value);

    if(!ident){
      return;
    }

    // No lookup should ever run on 1- or 2-character entries.
    if(ident.length < 3){
      clearPartialDisplay();
      return;
    }

    if(!isCompleteAirportIdent(ident)){
      return;
    }

    // Adjacent exact matches take priority.
    const adjacent = getAdjacentRecord(ident);
    if(adjacent){
      [0, 100, 250, 500].forEach(delay => {
        setTimeout(() => showAdjacent(ident, adjacent), delay);
      });
      return;
    }

    // No adjacent match: let normal ZFW app handle it.
    if(getZfwRecord(ident)){
      restoreMapForZfw();
    }
  }

  function boot(){
    const input = document.getElementById("airportInput");
    if(input){
      ["input", "change", "keyup", "blur"].forEach(evt => input.addEventListener(evt, handleInput));
    }

    setInterval(() => {
      const input = document.getElementById("airportInput");
      const typed = normalizeIdent(input?.value || "");

      if(typed && typed.length < 3){
        clearPartialDisplay();
        return;
      }

      if(typed && isCompleteAirportIdent(typed)){
        const adjacent = getAdjacentRecord(typed);
        if(adjacent){
          showAdjacent(typed, adjacent);
          return;
        }

        if(getZfwRecord(typed)){
          restoreMapForZfw();
          return;
        }
      }

      if(activeAdjacentIdent){
        suppressAdjacentWx();
        blankMapForAdjacent();
      }
    }, 150);
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
