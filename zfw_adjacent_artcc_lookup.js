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

  function getAdjacentRecord(ident){
    const db = window.ZFW_ADJACENT_ARTCC_AIRPORTS || {};
    const airports = db.airports || {};
    const dcs = db.dcs_center_lookup || {};

    for(const alias of aliasesFor(ident)){
      if(airports[alias]){
        return {
          ident: alias.startsWith("K") ? alias.slice(1) : alias,
          record: airports[alias],
          source: "adjacent"
        };
      }

      if(dcs[alias]){
        return {
          ident: alias.startsWith("K") ? alias.slice(1) : alias,
          record: dcs[alias],
          source: "dcs"
        };
      }
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

  function ensureAdjacentGlowStyle(){
    if(document.getElementById("fdcsGlowStyle")) return;

    const style = document.createElement("style");
    style.id = "fdcsGlowStyle";
    style.textContent = `
      @property --fdcsGreenGlowSize{
        syntax:"<length>";
        inherits:false;
        initial-value:10px;
      }
      @property --fdcsGreenGlowAlpha{
        syntax:"<number>";
        inherits:false;
        initial-value:.20;
      }
      @keyframes fdcsGreenSlowFadeGlow{
        0%,100%{
          --fdcsGreenGlowSize:10px;
          --fdcsGreenGlowAlpha:.20;
        }
        50%{
          --fdcsGreenGlowSize:26px;
          --fdcsGreenGlowAlpha:.46;
        }
      }
      .fdcs-glow-green{
        border-color:var(--green)!important;
        box-shadow:
          0 0 0 2px rgba(65,209,125,.30),
          0 0 var(--fdcsGreenGlowSize) rgba(65,209,125,var(--fdcsGreenGlowAlpha)),
          inset 0 0 0 1px rgba(65,209,125,.18)!important;
        animation:fdcsGreenSlowFadeGlow 3.8s ease-in-out infinite!important;
      }
    `;
    document.head.appendChild(style);
  }

  function highlightContact(){
    ensureAdjacentGlowStyle();

    const contactCard = document.getElementById("contact")?.closest(".card");
    const contactValue = document.getElementById("contact");

    if(contactCard){
      contactCard.classList.add("fdcs-glow-green");
      contactCard.style.borderColor = "var(--green)";
      contactCard.style.boxShadow = "";
    }

    if(contactValue){
      contactValue.classList.add("green-text");
    }
  }

  function clearMapMarker(){
    if(typeof window.ZFW_CLEAR_MAP_MARKER === "function"){
      window.ZFW_CLEAR_MAP_MARKER();
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
    window.ZFW_ADJACENT_LOOKUP_ACTIVE = true;

    clearHighlights();
    clearMapMarker();

    setText("sector", "Outside ZFW");
    setText("area", centerId);
    setText("approach", "—");
    setText("vscs", "—");
    setText("contact", `${centerId} Flight Data Number: ${fdcd || "—"}`);
    setText("hours", "—");
    setText("airportName", rec.name || displayIdent);
    setText("nearestWeather", "—");

    const sectorValue = document.getElementById("sector");
    const areaValue = document.getElementById("area");

    if(sectorValue){
      sectorValue.classList.add("red-text");
      sectorValue.style.color = "var(--red)";
    }

    if(areaValue){
      areaValue.classList.add("red-text");
      areaValue.style.color = "var(--red)";
    }

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
    window.ZFW_ADJACENT_LOOKUP_ACTIVE = false;
  }

  window.applyAdjacentAirportLookup = applyAdjacentAirportLookup;
  window.clearAdjacentAirportDisplayState = clearAdjacentAirportDisplayState;
  window.ZFW_ADJACENT_LOOKUP_ACTIVE = false;
})();
