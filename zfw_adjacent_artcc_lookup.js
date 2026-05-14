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

  function setText(id, value){
    const el = document.getElementById(id);
    if(el){
      el.textContent = value || "—";
    }
  }

  function setHtml(id, value){
    const el = document.getElementById(id);
    if(el){
      el.innerHTML = value || "—";
    }
  }

  function clearMapMarkers(){
    const map = document.getElementById("zfwMap");
    if(!map) return;

    map.querySelectorAll(
      ".airport-marker,.navaid-marker,.waypoint-marker,.map-marker,circle,text"
    ).forEach(el => {
      const text = normalizeIdent(el.textContent || "");
      if(text.includes("NO AIRPORT SELECTED")) return;
      el.remove();
    });
  }

  function applyAdjacentAirportLookup(ident){
    ident = normalizeIdent(ident);

    if(ident.length < 3) return false;

    const result = getAdjacentRecord(ident);
    if(!result) return false;

    const record = result.record;
    const centerCode = record.center || "";
    const center = window.ZFW_ADJACENT_ARTCC_AIRPORTS?.centers?.[centerCode] || {};

    setText("sector", "Outside ZFW");
    setText("area", centerCode);
    setText("approach", "Outside ZFW ARTCC");
    setText("vscs", "—");
    setText("hours", "—");
    setText("nearestWx", "—");
    setText("airportName", record.name || ident);

    setHtml(
      "contact",
      `${centerCode} Flight Data Number: ${record.fdcd || center.fdcd || "—"}`
    );

    clearMapMarkers();

    return true;
  }

  window.applyAdjacentAirportLookup = applyAdjacentAirportLookup;
})();
