(function(){
  "use strict";

  const LOCAL_STORAGE_KEY = "zfwNonZfwAirportCorrections";
  const CENTER_INFO = {
    ZAB: { name: "Albuquerque ARTCC", fdcd: "505-856-4561" },
    ZKC: { name: "Kansas City ARTCC", fdcd: "913-254-8508" },
    ZHU: { name: "Houston ARTCC", fdcd: "281-230-5622" },
    ZME: { name: "Memphis ARTCC", fdcd: "901-368-8453/8449" }
  };

  function normalizeIdent(value){
    return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  }

  function canonicalAirportIdent(value){
    let ident = normalizeIdent(value);

    if(ident.length === 4 && ident.startsWith("K")){
      ident = ident.slice(1);
    }

    return ident;
  }

  function isValidAirportIdent(value){
    const ident = canonicalAirportIdent(value);
    return /^[A-Z0-9]{3}$/.test(ident);
  }

  function aliasesFor(value){
    const ident = canonicalAirportIdent(value);
    if(!/^[A-Z0-9]{3}$/.test(ident)) return [];
    return [ident, "K" + ident];
  }

  function ensureStore(){
    if(!window.ZFW_ADJACENT_ARTCC_AIRPORTS){
      window.ZFW_ADJACENT_ARTCC_AIRPORTS = { centers: {}, airports: {} };
    }

    if(!window.ZFW_ADJACENT_ARTCC_AIRPORTS.centers){
      window.ZFW_ADJACENT_ARTCC_AIRPORTS.centers = {};
    }

    if(!window.ZFW_ADJACENT_ARTCC_AIRPORTS.airports){
      window.ZFW_ADJACENT_ARTCC_AIRPORTS.airports = {};
    }

    Object.assign(window.ZFW_ADJACENT_ARTCC_AIRPORTS.centers, CENTER_INFO);

    return window.ZFW_ADJACENT_ARTCC_AIRPORTS;
  }

  function addRecordToStore(identifier, centerCode, airportName){
    const store = ensureStore();
    const ident = canonicalAirportIdent(identifier);
    const center = CENTER_INFO[centerCode];

    if(!ident || !center) return null;

    const record = {
      center: centerCode,
      name: airportName || ident,
      fdcd: center.fdcd
    };

    store.airports[ident] = record;
    store.airports["K" + ident] = record;

    return { ident, record };
  }

  function getAdjacentRecord(identifier){
    const store = ensureStore();
    for(const alias of aliasesFor(identifier)){
      if(store.airports[alias]){
        return {
          ident: alias.startsWith("K") ? alias.slice(1) : alias,
          record: store.airports[alias]
        };
      }
    }

    return null;
  }

  function loadLocalRecords(){
    try{
      return JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || "{}");
    }catch(error){
      console.warn("Could not read local non-ZFW airport records.", error);
      return {};
    }
  }

  function saveLocalRecord(ident, record){
    const all = loadLocalRecords();
    all[ident] = record;
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(all));
  }

  function applyLocalRecords(){
    const all = loadLocalRecords();
    Object.keys(all).forEach(function(ident){
      const record = all[ident];
      if(record && record.center){
        addRecordToStore(ident, record.center, record.name || ident);
      }
    });
  }

  async function saveSharedRecord(ident, record){
    saveLocalRecord(ident, record);

    if(window.ZFW_SAVE_SHARED_RECORD){
      return window.ZFW_SAVE_SHARED_RECORD("non_zfw_airports", ident, {
        identifier: ident,
        center: record.center,
        name: record.name || ident,
        fdcd: record.fdcd || CENTER_INFO[record.center]?.fdcd || ""
      });
    }

    return false;
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
    document.querySelectorAll(".card").forEach(function(card){
      card.classList.remove("nearest-wx-highlight", "highlight", "active", "warning", "primary");
      card.style.borderColor = "";
      card.style.boxShadow = "";
    });
  }

  function clearMapForAdjacent(){
    window.currentMarker = null;

    if(typeof window.drawMap === "function"){
      window.drawMap();
    } else {
      const map = document.getElementById("zfwMap");
      if(map){
        const ctx = map.getContext("2d");
        if(ctx){
          ctx.clearRect(0, 0, map.width, map.height);
        }
      }
    }
  }

  function clearAdjacentAirportDisplayState(){
    const mapCard = document.getElementById("mapCard");
    if(mapCard){
      mapCard.style.display = "";
    }
  }

  function applyAdjacentAirportLookup(identifier){
    const typed = normalizeIdent(identifier);
    if(typed.length < 3) return false;

    const result = getAdjacentRecord(typed);
    if(!result) return false;

    const record = result.record;
    const centerCode = record.center || "";
    const center = CENTER_INFO[centerCode] || ensureStore().centers[centerCode] || {};
    const fdcd = record.fdcd || center.fdcd || "—";

    clearHighlights();

    setText("sector", "Outside ZFW");
    setText("area", centerCode);
    setText("approach", "Outside ZFW ARTCC");
    setText("vscs", "—");
    setHtml("contact", `${centerCode} Flight Data Number: ${fdcd}`);
    setText("hours", "—");
    setText("airportName", record.name || result.ident);
    setText("nearestWeather", "—");

    const contactCard = document.getElementById("contactCard");
    if(contactCard){
      contactCard.classList.add("nearest-wx-highlight");
      contactCard.style.borderColor = "#ffd166";
      contactCard.style.boxShadow = "0 0 0 2px rgba(255,209,102,.45),0 0 16px rgba(255,209,102,.35)";
    }

    const status = document.getElementById("status");
    if(status){
      status.textContent = `${result.ident}: ${centerCode} FD/CD ${fdcd}`;
      status.classList.remove("error", "not-found");
      status.style.color = "#ffd166";
    }

    clearMapForAdjacent();

    return true;
  }

  function createModal(){
    if(document.getElementById("nonZfwAirportModal")) return;

    const modal = document.createElement("div");
    modal.id = "nonZfwAirportModal";
    modal.className = "correction-modal";
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML = `
      <div class="correction-dialog">
        <h2>Add Non-ZFW Airport</h2>
        <p>Add an airport outside ZFW airspace so future lookups show the correct adjacent ARTCC Flight Data number.</p>

        <form id="nonZfwAirportForm">
          <div class="correction-grid">
            <div class="correction-field">
              <label for="nonZfwIdentifier">Airport Identifier</label>
              <input id="nonZfwIdentifier" name="identifier" type="text" maxlength="4" required />
              <div class="correction-help">Examples: IAB or KIAB</div>
            </div>

            <div class="correction-field">
              <label for="nonZfwCenter">ARTCC</label>
              <select id="nonZfwCenter" name="center" required>
                <option value="">Select</option>
                <option value="ZAB">ZAB</option>
                <option value="ZKC">ZKC</option>
                <option value="ZHU">ZHU</option>
                <option value="ZME">ZME</option>
              </select>
            </div>

            <div class="correction-field full">
              <label for="nonZfwName">Airport Name</label>
              <input id="nonZfwName" name="airportName" type="text" placeholder="Optional" />
            </div>
          </div>

          <div id="nonZfwMessage" class="correction-message"></div>

          <div class="correction-actions">
            <button type="button" class="cancel" id="nonZfwCancel">Cancel</button>
            <button type="submit">Save Non-ZFW Airport</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(modal);

    document.getElementById("nonZfwCancel").addEventListener("click", closeModal);
    modal.addEventListener("click", function(event){
      if(event.target === modal) closeModal();
    });

    document.getElementById("nonZfwAirportForm").addEventListener("submit", async function(event){
      event.preventDefault();

      const identifier = canonicalAirportIdent(document.getElementById("nonZfwIdentifier").value);
      const centerCode = document.getElementById("nonZfwCenter").value;
      const airportName = String(document.getElementById("nonZfwName").value || identifier).trim().toUpperCase();
      const message = document.getElementById("nonZfwMessage");

      if(!isValidAirportIdent(identifier)){
        message.textContent = "Enter a valid 3-character airport identifier, with or without K.";
        message.className = "correction-message error";
        return;
      }

      if(!CENTER_INFO[centerCode]){
        message.textContent = "Select ZAB, ZKC, ZHU, or ZME.";
        message.className = "correction-message error";
        return;
      }

      const saved = addRecordToStore(identifier, centerCode, airportName);
      if(!saved){
        message.textContent = "Could not save record.";
        message.className = "correction-message error";
        return;
      }

      try{
        const shared = await saveSharedRecord(saved.ident, saved.record);
        message.textContent = shared ? "Non-ZFW airport saved for all PCs." : "Non-ZFW airport saved locally only. Firestore is not configured or did not accept this category.";
        message.className = shared ? "correction-message" : "correction-message error";
      }catch(error){
        console.error(error);
        message.textContent = "Saved locally, but Firestore save failed. Check Firestore rules for non_zfw_airports.";
        message.className = "correction-message error";
      }

      const input = document.getElementById("airportInput");
      if(input){
        input.value = saved.ident;
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }

      setTimeout(closeModal, 900);
    });
  }

  function openModal(){
    createModal();
    const modal = document.getElementById("nonZfwAirportModal");
    const input = document.getElementById("airportInput");
    const ident = document.getElementById("nonZfwIdentifier");

    document.getElementById("nonZfwAirportForm").reset();
    document.getElementById("nonZfwMessage").textContent = "";
    document.getElementById("nonZfwMessage").className = "correction-message";

    if(input && ident && normalizeIdent(input.value).length >= 3){
      ident.value = canonicalAirportIdent(input.value);
    }

    modal.setAttribute("aria-hidden", "false");
    setTimeout(function(){ ident && ident.focus(); }, 0);
  }

  function closeModal(){
    const modal = document.getElementById("nonZfwAirportModal");
    if(modal) modal.setAttribute("aria-hidden", "true");
  }

  function createButton(){
    if(document.getElementById("addNonZfwAirportButton")) return;

    const button = document.createElement("button");
    button.type = "button";
    button.id = "addNonZfwAirportButton";
    button.textContent = "Add Non-ZFW Airport";

    // Match the existing Add/Amend button color scheme and rounded shape.
    button.className = "action-btn secondary";
    button.style.border = "0";
    button.style.borderRadius = "12px";
    button.style.background = "#64748b";
    button.style.color = "#ffffff";
    button.style.fontWeight = "800";
    button.style.padding = "10px 14px";
    button.style.cursor = "pointer";
    button.style.fontSize = "0.95rem";

    button.addEventListener("click", openModal);

    const bottomZone = document.getElementById("bottomCorrectionZone");
    if(bottomZone){
      bottomZone.appendChild(button);

      // Keep it as the third button in the bottom row.
      // Airport = first, Waypoint/Navaid = second, Non-ZFW = third.
      const airportButton = Array.from(bottomZone.querySelectorAll("button")).find(function(btn){
        return (btn.textContent || "").trim() === "Add/Amend Airport";
      });
      const waypointButton = Array.from(bottomZone.querySelectorAll("button")).find(function(btn){
        return (btn.textContent || "").trim() === "Add/Amend Waypoint/Navaid for PIREP";
      });

      if(airportButton && waypointButton){
        bottomZone.appendChild(button);
      }
    } else {
      document.body.appendChild(button);
    }

    if(window.moveCorrectionButtonsToBottom){
      window.moveCorrectionButtonsToBottom();
      const bottom = document.getElementById("bottomCorrectionZone");
      if(bottom){
        bottom.appendChild(button);
      }
    }
  }

  function boot(){
    ensureStore();
    applyLocalRecords();
    createModal();
    createButton();

    window.applyAdjacentAirportLookup = applyAdjacentAirportLookup;
    window.clearAdjacentAirportDisplayState = clearAdjacentAirportDisplayState;
    window.addNonZfwAirportRecord = function(identifier, centerCode, airportName){
      const saved = addRecordToStore(identifier, centerCode, airportName || canonicalAirportIdent(identifier));
      if(saved) saveSharedRecord(saved.ident, saved.record);
      return Boolean(saved);
    };
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", boot);
  }else{
    boot();
  }
})();
