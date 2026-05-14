(function(){
  "use strict";

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
    if(ident.length === 4 && ident.startsWith("K")) return [ident, ident.slice(1)];
    if(ident.length === 3) return [ident, "K" + ident];
    return [ident];
  }

  function getZfwRecord(ident){
    const records = window.AIRPORT_DATA?.records || {};
    for(const alias of aliasesFor(ident)){
      if(records[alias]) return records[alias];
    }
    return null;
  }

  function getAdjacentRecord(ident){
    const db = window.ZFW_ADJACENT_ARTCC_AIRPORTS || {};
    const airports = db.airports || {};
    for(const alias of aliasesFor(ident)){
      if(airports[alias]) return { ident: alias.startsWith("K") ? alias.slice(1) : alias, record: airports[alias] };
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

  function setStatus(text, warning){
    const status = document.getElementById("status");
    if(status){
      status.textContent = text;
      status.classList.remove("error", "not-found");
      status.style.color = warning ? "#ffd166" : "";
    }
  }

  function clearPartial(){
    setText("sector", "—");
    setText("area", "—");
    setText("approach", "—");
    setText("appVscs", "—");
    setHtml("appContact", "—");
    setText("appHours", "—");
    setText("airportName", "—");
    setText("nearestWeather", "—");
    hideMap();
    setStatus("Ready", false);
  }

  function showAdjacentFor(inputIdent, adjacent){
    const currentInput = normalizeIdent(document.getElementById("airportInput")?.value || "");

    // If the user has already typed something else, do not apply old results.
    if(currentInput && currentInput !== inputIdent){
      return;
    }

    const db = window.ZFW_ADJACENT_ARTCC_AIRPORTS || {};
    const centers = db.centers || {};
    const rec = adjacent.record || {};
    const centerId = normalizeIdent(rec.center);
    const center = centers[centerId] || {};
    const fdcd = rec.fdcd || center.fdcd || "";
    const displayIdent = adjacent.ident;

    clearHighlights();

    setText("sector", "Outside ZFW");
    setText("area", centerId);
    setText("approach", "Outside ZFW ARTCC");
    setText("appVscs", "—");
    setHtml("appContact", `${rec.name || displayIdent} is in ${center.name || centerId + " ARTCC"} airspace. ${centerId} Flight Data Clearance Delivery: ${fdcd}`);
    setText("appHours", "0000-2359");
    setText("airportName", rec.name || displayIdent);

    // Wrong-airspace/adjacent-center lookup does not require PIREP WX.
    setText("nearestWeather", "—");

    const contactCard = document.getElementById("appContact")?.closest(".card");
    if(contactCard){
      contactCard.classList.add("nearest-wx-highlight");
    }

    setStatus(`${displayIdent}: ${centerId} FD/CD ${fdcd}`, true);
    hideMap();
  }

  function handleInput(){
    const input = document.getElementById("airportInput");
    if(!input) return;

    const ident = normalizeIdent(input.value);

    if(!ident){
      return;
    }

    if(ident.length < 3){
      clearPartial();
      return;
    }

    if(!isCompleteAirportIdent(ident)){
      return;
    }

    // ZFW records always take priority.
    if(getZfwRecord(ident)){
      return;
    }

    const adjacent = getAdjacentRecord(ident);
    if(!adjacent){
      return;
    }

    // Delayed calls beat the primary app's "no match" output without creating a loop/stutter.
    [0, 120, 350, 800].forEach(delay => {
      setTimeout(() => showAdjacentFor(ident, adjacent), delay);
    });
  }

  function boot(){
    const input = document.getElementById("airportInput");
    if(input){
      ["input", "change", "keyup", "blur"].forEach(evt => input.addEventListener(evt, handleInput));
    }
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
