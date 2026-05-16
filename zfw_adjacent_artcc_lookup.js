(function(){
  "use strict";

  let activeAdjacentIdent = "";
  let inputClearTimer = null;

  function normalizeIdent(value){
    return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
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

  function hasZfwSectorOrArea(record){
    return !!(
      record &&
      (
        (Array.isArray(record.sectors) && record.sectors.length) ||
        (Array.isArray(record.areas) && record.areas.length)
      )
    );
  }

  function getZfwRecord(ident){
    const records = window.AIRPORT_DATA?.records || {};

    for(const alias of aliasesFor(ident)){
      const record = records[alias];
      if(record && hasZfwSectorOrArea(record)) return record;
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

  function clearHighlights(){
    document.querySelectorAll(".card").forEach(card => {
      card.classList.remove("nearest-wx-highlight", "highlight", "active", "warning", "primary", "fdcs-glow-green", "fdcs-glow-red");
      card.style.borderColor = "";
      card.style.boxShadow = "";
    });

    document.querySelectorAll(".card-value").forEach(value => {
      value.classList.remove("red-text", "green-text", "amber-text", "cyan-text");
      value.style.color = "";
    });
  }

  function highlightContact(){
    const contactCard = document.getElementById("contact")?.closest(".card");
    const contactValue = document.getElementById("contact");

    if(contactCard){
      contactCard.style.borderColor = "var(--green)";
      contactCard.style.boxShadow = "0 0 0 2px rgba(65,209,125,.24),0 0 14px rgba(65,209,125,.18)";
    }

    if(contactValue){
      contactValue.classList.add("green-text");
    }
  }

  function clearMapMarker(){
    if(typeof window.ZFW_CLEAR_MAP_MARKER === "function"){
      window.ZFW_CLEAR_MAP_MARKER();
      return;
    }

    const map = document.getElementById("zfwMap");
    const ctx = map?.getContext?.("2d");
    if(ctx && map){
      ctx.clearRect(0, 0, map.width, map.height);
    }
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

  function showAdjacent(typedIdent, adjacent){
    const input = document.getElementById("airportInput");
    const currentInput = normalizeIdent(input?.value || "");
    const expected = normalizeIdent(typedIdent);

    if(currentInput && currentInput !== expected && currentInput !== "K" + expected){
      return false;
    }

    const db = window.ZFW_ADJACENT_ARTCC_AIRPORTS || {};
    const centers = db.centers || {};
    const rec = adjacent.record || {};
    const centerId = normalizeIdent(rec.center);
    const center = centers[centerId] || {};
    const fdcd = rec.fdcd || center.fdcd || "";
    const displayIdent = adjacent.ident;

    activeAdjacentIdent = displayIdent;

    clearHighlights();
    clearMapMarker();

    setText("sector", "Outside ZFW");
    setText("area", centerId);
    setText("approach", "Outside ZFW ARTCC");
    setText("vscs", "—");
    setText("contact", `${centerId} Flight Data Number: ${fdcd || "—"}`);
    setText("hours", "—");
    setText("airportName", rec.name || displayIdent);
    setText("nearestWeather", "—");

    highlightContact();

    const status = document.getElementById("status");
    if(status){
      status.textContent = `${displayIdent} found`;
      status.style.color = "var(--green)";
    }

    clearInputSoon(displayIdent);
    return true;
  }

  function applyAdjacentAirportLookup(typedIdent){
    const ident = normalizeIdent(typedIdent);

    if(!isCompleteAirportIdent(ident)){
      return false;
    }

    // ZFW airport records always take priority over adjacent ARTCC records.
    // This prevents ZFW airports such as MLU, TXK, OKC, MAF, and ELD from
    // being treated as outside-ZFW airports if they appear in the adjacent list.
    if(getZfwRecord(ident)){
      return false;
    }

    const adjacent = getAdjacentRecord(ident);

    if(!adjacent){
      return false;
    }

    return showAdjacent(ident, adjacent);
  }

  function clearAdjacentAirportDisplayState(){
    activeAdjacentIdent = "";
  }

  function handleInput(){
    const input = document.getElementById("airportInput");
    if(!input) return;

    const ident = normalizeIdent(input.value);

    if(!ident){
      return;
    }

    if(ident.length < 3){
      return;
    }

    if(!isCompleteAirportIdent(ident)){
      return;
    }

    if(getZfwRecord(ident)){
      activeAdjacentIdent = "";
      return;
    }

    const adjacent = getAdjacentRecord(ident);
    if(adjacent){
      [0, 100, 250].forEach(delay => {
        setTimeout(() => showAdjacent(ident, adjacent), delay);
      });
      return;
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

      if(typed && isCompleteAirportIdent(typed)){
        if(getZfwRecord(typed)){
          activeAdjacentIdent = "";
          return;
        }

        const adjacent = getAdjacentRecord(typed);
        if(adjacent){
          showAdjacent(typed, adjacent);
          return;
        }
      }

      if(activeAdjacentIdent){
        setText("nearestWeather", "—");
        clearMapMarker();
      }
    }, 200);
  }

  window.applyAdjacentAirportLookup = applyAdjacentAirportLookup;
  window.clearAdjacentAirportDisplayState = clearAdjacentAirportDisplayState;

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
