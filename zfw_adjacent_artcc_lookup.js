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


  const CENTER_INFO = {
    ZAB: { name: "Albuquerque ARTCC", fdcd: "505-856-4561" },
    ZKC: { name: "Kansas City ARTCC", fdcd: "913-254-8508" },
    ZHU: { name: "Houston ARTCC", fdcd: "281-230-5622" },
    ZME: { name: "Memphis ARTCC", fdcd: "901-368-8453/8449" }
  };

  function canonicalAirportIdent(value){
    const ident = normalizeIdent(value);
    if(ident.length === 4 && ident.startsWith("K")) return ident.slice(1);
    return ident;
  }

  function isValidAirportIdent(value){
    return /^[A-Z0-9]{3}$/.test(canonicalAirportIdent(value));
  }

  function ensureAdjacentStore(){
    if(!window.ZFW_ADJACENT_ARTCC_AIRPORTS){
      window.ZFW_ADJACENT_ARTCC_AIRPORTS = { centers: {}, airports: {}, dcs_center_lookup: {} };
    }

    const store = window.ZFW_ADJACENT_ARTCC_AIRPORTS;
    store.centers = store.centers || {};
    store.airports = store.airports || {};
    store.dcs_center_lookup = store.dcs_center_lookup || {};

    Object.keys(CENTER_INFO).forEach(function(center){
      store.centers[center] = store.centers[center] || CENTER_INFO[center];
    });

    return store;
  }

  function addRecordToStore(identifier, centerCode, airportName){
    const ident = canonicalAirportIdent(identifier);
    centerCode = normalizeIdent(centerCode);

    if(!isValidAirportIdent(ident) || !CENTER_INFO[centerCode]){
      return null;
    }

    const store = ensureAdjacentStore();
    const record = {
      center: centerCode,
      name: String(airportName || ident).trim().toUpperCase(),
      fdcd: CENTER_INFO[centerCode].fdcd
    };

    store.airports[ident] = record;
    store.airports["K" + ident] = record;

    // User-entered non-ZFW airports are operational fallback records. Keep them
    // out of AIRPORT_DATA so they do not look like local ZFW airports.
    return { ident: ident, record: record };
  }

  async function saveSharedRecord(identifier, record){
    if(typeof window.ZFW_SAVE_SHARED_RECORD !== "function"){
      return false;
    }

    return await window.ZFW_SAVE_SHARED_RECORD("non_zfw_airports", identifier, record);
  }

  function injectNonZfwStyles(){
    if(document.getElementById("nonZfwAirportStyles")) return;

    const style = document.createElement("style");
    style.id = "nonZfwAirportStyles";
    style.textContent = `
      #nonZfwAirportModal {
        position: fixed !important;
        inset: 0 !important;
        z-index: 10000 !important;
        display: none;
        align-items: center !important;
        justify-content: center !important;
        padding: 24px !important;
        background: rgba(0, 0, 0, 0.62) !important;
      }

      #nonZfwAirportModal[aria-hidden="false"] {
        display: flex !important;
      }

      #nonZfwAirportModal .correction-dialog {
        width: min(720px, 96vw) !important;
        background: #ffffff !important;
        color: #111827 !important;
        border-radius: 14px !important;
        padding: 24px !important;
        box-shadow: 0 24px 80px rgba(0, 0, 0, 0.45) !important;
      }

      #nonZfwAirportModal h2 {
        margin: 0 0 8px !important;
        color: #111827 !important;
      }

      #nonZfwAirportModal p {
        margin: 0 0 18px !important;
        color: #475569 !important;
      }

      #nonZfwAirportModal label {
        display: block !important;
        font-weight: 800 !important;
        margin-bottom: 6px !important;
        color: #111827 !important;
      }

      #nonZfwAirportModal input,
      #nonZfwAirportModal select {
        width: 100% !important;
        padding: 10px 12px !important;
        border: 1px solid #cbd5e1 !important;
        border-radius: 10px !important;
        background: #ffffff !important;
        color: #111827 !important;
        font-size: 1rem !important;
        box-sizing: border-box !important;
      }

      #nonZfwAirportModal .correction-grid {
        display: grid !important;
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        gap: 14px !important;
      }

      #nonZfwAirportModal .correction-field.full {
        grid-column: 1 / -1 !important;
      }

      #nonZfwAirportModal .correction-help {
        margin-top: 6px !important;
        color: #64748b !important;
        font-size: 0.88rem !important;
      }

      #nonZfwAirportModal .correction-actions {
        margin-top: 18px !important;
        display: flex !important;
        justify-content: flex-end !important;
        gap: 10px !important;
      }

      #nonZfwAirportModal .correction-actions button {
        border: 0 !important;
        border-radius: 12px !important;
        padding: 10px 14px !important;
        font-weight: 800 !important;
        cursor: pointer !important;
      }

      #nonZfwAirportModal .correction-actions .cancel {
        background: #64748b !important;
        color: #ffffff !important;
      }

      #nonZfwAirportModal .correction-actions button[type="submit"] {
        background: #156082 !important;
        color: #ffffff !important;
      }

      #nonZfwAirportModal .correction-message {
        margin-top: 12px !important;
        font-weight: 800 !important;
        color: #166534 !important;
      }

      #nonZfwAirportModal .correction-message.error {
        color: #b91c1c !important;
      }

      @media (max-width: 720px) {
        #nonZfwAirportModal .correction-grid {
          grid-template-columns: 1fr !important;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function createNonZfwModal(){
    injectNonZfwStyles();

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

    const cancel = document.getElementById("nonZfwCancel");
    if(cancel) cancel.addEventListener("click", closeNonZfwModal);

    modal.addEventListener("click", function(event){
      if(event.target === modal) closeNonZfwModal();
    });

    const form = document.getElementById("nonZfwAirportForm");
    if(form){
      form.addEventListener("submit", submitNonZfwAirport);
    }
  }

  async function submitNonZfwAirport(event){
    event.preventDefault();

    const identifier = canonicalAirportIdent(document.getElementById("nonZfwIdentifier")?.value);
    const centerCode = normalizeIdent(document.getElementById("nonZfwCenter")?.value);
    const airportName = String(document.getElementById("nonZfwName")?.value || identifier).trim().toUpperCase();
    const message = document.getElementById("nonZfwMessage");

    if(!isValidAirportIdent(identifier)){
      if(message){
        message.textContent = "Enter a valid 3-character airport identifier, with or without K.";
        message.className = "correction-message error";
      }
      return;
    }

    if(!CENTER_INFO[centerCode]){
      if(message){
        message.textContent = "Select ZAB, ZKC, ZHU, or ZME.";
        message.className = "correction-message error";
      }
      return;
    }

    const saved = addRecordToStore(identifier, centerCode, airportName);

    if(!saved){
      if(message){
        message.textContent = "Could not save record.";
        message.className = "correction-message error";
      }
      return;
    }

    try{
      const shared = await saveSharedRecord(saved.ident, saved.record);

      if(message){
        message.textContent = shared ? "Non-ZFW airport saved for all PCs." : "Non-ZFW airport saved locally only. Firestore is not configured or did not accept this category.";
        message.className = shared ? "correction-message" : "correction-message error";
      }
    }catch(error){
      console.error(error);
      if(message){
        message.textContent = "Saved locally, but Firestore save failed. Check Firestore rules for non_zfw_airports.";
        message.className = "correction-message error";
      }
    }

    const input = document.getElementById("airportInput");
    if(input){
      input.value = saved.ident;
      applyAdjacentAirportLookup(saved.ident);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }

    setTimeout(closeNonZfwModal, 900);
  }

  function openNonZfwModal(){
    createNonZfwModal();

    const modal = document.getElementById("nonZfwAirportModal");
    const input = document.getElementById("airportInput");
    const ident = document.getElementById("nonZfwIdentifier");
    const form = document.getElementById("nonZfwAirportForm");
    const message = document.getElementById("nonZfwMessage");

    if(form) form.reset();

    if(message){
      message.textContent = "";
      message.className = "correction-message";
    }

    if(input && ident && normalizeIdent(input.value).length >= 3){
      ident.value = canonicalAirportIdent(input.value);
    }

    if(modal) modal.setAttribute("aria-hidden", "false");

    setTimeout(function(){
      if(ident) ident.focus();
    }, 0);
  }

  function closeNonZfwModal(){
    const modal = document.getElementById("nonZfwAirportModal");
    if(modal) modal.setAttribute("aria-hidden", "true");
  }

  function wireNonZfwButton(){
    createNonZfwModal();

    const button = document.getElementById("addNonZfwAirportButton");
    if(!button || button.dataset.nonZfwWired === "true") return;

    button.dataset.nonZfwWired = "true";
    button.addEventListener("click", openNonZfwModal);
  }

  function bootNonZfwTools(){
    ensureAdjacentStore();
    wireNonZfwButton();

    setTimeout(wireNonZfwButton, 250);
    setTimeout(wireNonZfwButton, 750);
    setTimeout(wireNonZfwButton, 1500);

    window.addNonZfwAirportRecord = function(identifier, centerCode, airportName){
      const saved = addRecordToStore(identifier, centerCode, airportName || canonicalAirportIdent(identifier));
      if(saved) saveSharedRecord(saved.ident, saved.record);
      return Boolean(saved);
    };
  }


  window.applyAdjacentAirportLookup = applyAdjacentAirportLookup;
  window.clearAdjacentAirportDisplayState = clearAdjacentAirportDisplayState;
  window.ZFW_ADJACENT_LOOKUP_ACTIVE = false;

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", bootNonZfwTools);
  }else{
    bootNonZfwTools();
  }
})();
