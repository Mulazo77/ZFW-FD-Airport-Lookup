(function () {
  "use strict";

  const STORAGE_KEY = "zfwAirportLocatorCorrections";

  const SECTOR_ALIASES = {
    "LBBL": "LBB 64",
    "LBB L": "LBB 64",
    "LBB-L": "LBB 64",
    "LBB64": "LBB 64",
    "64": "LBB 64",

    "SPSL": "SPS 34",
    "SPS L": "SPS 34",
    "SPS-L": "SPS 34",
    "SPS34": "SPS 34",
    "34": "SPS 34",

    "OKCL": "OKC 35",
    "OKC L": "OKC 35",
    "OKC-L": "OKC 35",
    "OKC35": "OKC 35",
    "35": "OKC 35",

    "UKWL": "UKW 75",
    "UKW L": "UKW 75",
    "UKW-L": "UKW 75",
    "UKW75": "UKW 75",
    "75": "UKW 75",

    "ABIL": "ABI 63",
    "ABI L": "ABI 63",
    "ABI-L": "ABI 63",
    "ABI63": "ABI 63",
    "63": "ABI 63",

    "EDNL": "EDN 62",
    "EDN L": "EDN 62",
    "EDN-L": "EDN 62",
    "EDN62": "EDN 62",
    "62": "EDN 62",

    "MAFL": "MAF 40",
    "MAF L": "MAF 40",
    "MAF-L": "MAF 40",
    "MAF40": "MAF 40",
    "40": "MAF 40",

    "SEAL": "SEA 37",
    "SEA L": "SEA 37",
    "SEA-L": "SEA 37",
    "SEA37": "SEA 37",
    "37": "SEA 37",

    "MLCL": "MLC 38",
    "MLC L": "MLC 38",
    "MLC-L": "MLC 38",
    "MLC38": "MLC 38",
    "38": "MLC 38",

    "FRIL": "FRI 53",
    "FRI L": "FRI 53",
    "FRI-L": "FRI 53",
    "FRI53": "FRI 53",
    "53": "FRI 53",

    "UIML": "UIM 83",
    "UIM L": "UIM 83",
    "UIM-L": "UIM 83",
    "UIM83": "UIM 83",
    "83": "UIM 83",

    "DONL": "DON 29",
    "DON L": "DON 29",
    "DON-L": "DON 29",
    "DON29": "DON 29",
    "29": "DON 29",

    "POSL": "POS 32",
    "POS L": "POS 32",
    "POS-L": "POS 32",
    "POS32": "POS 32",
    "32": "POS 32",

    "TXKL": "TXK 27",
    "TXK L": "TXK 27",
    "TXK-L": "TXK 27",
    "TXK27": "TXK 27",
    "27": "TXK 27",

    "MLUL": "MLU 30",
    "MLU L": "MLU 30",
    "MLU-L": "MLU 30",
    "MLU30": "MLU 30",
    "30": "MLU 30"
  };

  const SECTOR_TO_AREA = {
    "LBB 64": "RDR",
    "SPS 34": "UKW",
    "OKC 35": "UKW",
    "UKW 75": "UKW",
    "ABI 63": "JEN",
    "EDN 62": "JEN",
    "MAF 40": "JEN",
    "SEA 37": "BYP",
    "MLC 38": "BYP",
    "FRI 53": "BYP",
    "UIM 83": "BYP",
    "DON 29": "DAL",
    "POS 32": "DAL",
    "TXK 27": "BYP",
    "MLU 30": "BYP"
  };

  function getRecords() {
    if (!window.AIRPORT_DATA) {
      window.AIRPORT_DATA = { records: {} };
    }
    if (!window.AIRPORT_DATA.records) {
      window.AIRPORT_DATA.records = {};
    }
    return window.AIRPORT_DATA.records;
  }

  function splitList(value) {
    if (!value) return [];
    return String(value)
      .split(/[,\n;]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function dedupe(values) {
    const out = [];
    values.forEach((value) => {
      if (value && !out.includes(value)) out.push(value);
    });
    return out;
  }

  function normalizeIdent(value) {
    return String(value || "").trim().toUpperCase();
  }

  function aliasForIdent(ident) {
    ident = normalizeIdent(ident);
    if (ident.length === 4 && ident.startsWith("K")) return ident.slice(1);
    if (ident.length === 3) return "K" + ident;
    return "";
  }

  function lookupRecord(ident) {
    const records = getRecords();
    ident = normalizeIdent(ident);
    if (records[ident]) return { ident, record: records[ident] };

    const alias = aliasForIdent(ident);
    if (alias && records[alias]) return { ident: alias, record: records[alias] };

    return null;
  }

  function makeSectorAliasKey(value) {
    return String(value || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, " ")
      .replace(/[^A-Z0-9 ]/g, "")
      .replace(/\s+/g, " ");
  }

  function buildDynamicSectorAliases() {
    const records = getRecords();
    Object.values(records).forEach((record) => {
      (record.sectors || []).forEach((sector) => {
        const clean = String(sector || "").trim().toUpperCase();
        if (!clean) return;

        const numberMatch = clean.match(/\b(\d{2})\b/);
        const nameMatch = clean.match(/^([A-Z]{2,4})/);

        if (numberMatch && !SECTOR_ALIASES[numberMatch[1]]) {
          SECTOR_ALIASES[numberMatch[1]] = clean;
        }

        if (nameMatch) {
          const prefix = nameMatch[1];
          SECTOR_ALIASES[prefix] = clean;
          SECTOR_ALIASES[prefix + "L"] = clean;
          SECTOR_ALIASES[prefix + " L"] = clean;
          SECTOR_ALIASES[prefix + "-" + "L"] = clean;
        }
      });
    });
  }

  function normalizeSector(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";

    const upper = raw.toUpperCase();
    const compact = upper.replace(/[^A-Z0-9]/g, "");
    const spaced = makeSectorAliasKey(upper);

    if (SECTOR_ALIASES[upper]) return SECTOR_ALIASES[upper];
    if (SECTOR_ALIASES[spaced]) return SECTOR_ALIASES[spaced];
    if (SECTOR_ALIASES[compact]) return SECTOR_ALIASES[compact];

    const numberOnly = upper.match(/^\d{2}$/);
    if (numberOnly && SECTOR_ALIASES[numberOnly[0]]) return SECTOR_ALIASES[numberOnly[0]];

    const lFormat = upper.match(/^([A-Z]{2,4})[\s-]*L$/);
    if (lFormat) {
      const key = lFormat[1] + "L";
      if (SECTOR_ALIASES[key]) return SECTOR_ALIASES[key];
    }

    const sectorFormat = upper.match(/^([A-Z]{2,4})[\s-]*(\d{2})$/);
    if (sectorFormat) return sectorFormat[1] + " " + sectorFormat[2];

    return upper;
  }

  function normalizeSectors(value) {
    return dedupe(splitList(value).map(normalizeSector));
  }

  function normalizeAreas(value, sectors) {
    const direct = splitList(value).map((item) => item.toUpperCase());
    if (direct.length) return dedupe(direct);

    const derived = (sectors || [])
      .map((sector) => SECTOR_TO_AREA[sector])
      .filter(Boolean);

    return dedupe(derived);
  }

  function normalizeApps(value) {
    return dedupe(
      splitList(value).map((item) => {
        let app = item.toUpperCase().trim();
        if (!app) return "";
        if (!app.endsWith("APP") && app !== "D10") app += " APP";
        if (app === "D10") app = "D10 APP";
        return app;
      })
    );
  }

  function makeRecordFromForm(form) {
    const ident = normalizeIdent(form.identifier.value);
    const sectors = normalizeSectors(form.sectors.value);
    const areas = normalizeAreas(form.areas.value, sectors);
    const apps = normalizeApps(form.apps.value);
    const vscs = splitList(form.vscs.value);
    const contacts = splitList(form.contacts.value);
    const hours = splitList(form.hours.value);

    const latText = form.lat.value.trim();
    const lonText = form.lon.value.trim();

    const record = {
      sectors,
      areas,
      apps,
      vscs,
      contacts,
      hours,
      airport_name: form.airportName.value.trim()
    };

    if (latText !== "") record.lat = Math.round(Number(latText) * 10000) / 10000;
    if (lonText !== "") record.lon = Math.round(Number(lonText) * 10000) / 10000;

    return { ident, record };
  }

  function loadCorrections() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    } catch (error) {
      console.warn("Could not read airport corrections.", error);
      return {};
    }
  }

  function saveCorrections(corrections) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(corrections));
  }

  function applyOneCorrection(ident, record) {
    const records = getRecords();
    ident = normalizeIdent(ident);
    const alias = aliasForIdent(ident);

    delete records[ident];
    if (alias) delete records[alias];

    records[ident] = JSON.parse(JSON.stringify(record));

    if (alias) {
      records[alias] = JSON.parse(JSON.stringify(record));
    }
  }

  function applySavedCorrections() {
    buildDynamicSectorAliases();
    const corrections = loadCorrections();
    Object.keys(corrections).forEach((ident) => {
      applyOneCorrection(ident, corrections[ident]);
    });
  }

  function showMessage(message, isError) {
    const existing = document.getElementById("correctionMessage");
    if (!existing) return;

    existing.textContent = message;
    existing.className = isError ? "correction-message error" : "correction-message";
  }

  function fillFormFromRecord(form, ident, record) {
    form.identifier.value = ident || "";
    form.airportName.value = record.airport_name || "";
    form.sectors.value = (record.sectors || []).join(", ");
    form.areas.value = (record.areas || []).join(", ");
    form.apps.value = (record.apps || []).join(", ");
    form.vscs.value = (record.vscs || []).join(", ");
    form.contacts.value = (record.contacts || []).join(", ");
    form.hours.value = (record.hours || []).join(", ");

  }

  function clearForm(form) {
    Array.from(form.elements).forEach((element) => {
      if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
        element.value = "";
      }
    });
  }

  function openModal(mode) {
    const modal = document.getElementById("correctionModal");
    const form = document.getElementById("correctionForm");
    const title = document.getElementById("correctionModalTitle");
    const submitButton = document.getElementById("correctionSubmit");
    const currentSearch = document.getElementById("airportInput");

    clearForm(form);
    showMessage("", false);

    form.dataset.mode = mode;
    title.textContent = mode === "add" ? "Add/Amend Airport" : "Amend Airport";
    submitButton.textContent = mode === "add" ? "Add Airport" : "Save Amendment";

    if (mode === "amend") {
      const currentIdent = normalizeIdent(currentSearch ? currentSearch.value : "");
      if (currentIdent) {
        const found = lookupRecord(currentIdent);
        if (found) {
          fillFormFromRecord(form, found.ident, found.record);
        } else {
          form.identifier.value = currentIdent;
          showMessage("No existing record found. Use Add/Amend Airport if this is a new airport.", true);
        }
      }
    }

    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("correction-modal-open");
    setTimeout(() => form.identifier.focus(), 0);
  }

  function closeModal() {
    const modal = document.getElementById("correctionModal");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("correction-modal-open");
  }

  function refreshCurrentLookup(ident) {
    const input = document.getElementById("airportInput");
    if (!input) return;

    input.value = ident;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.focus();
  }

  function bindAirportCorrectionButton() {
    const button = document.getElementById("amendAirportButton");
    if (button && button.dataset.airportCorrectionBound !== "true") {
      button.dataset.airportCorrectionBound = "true";

      const handler = function (event) {
        if (event) {
          event.preventDefault();
          event.stopPropagation();
        }
        openModal("add");
      };

      button.addEventListener("pointerdown", handler, true);
      button.addEventListener("click", handler, true);
    }
  }

  function createCorrectionUi() {
    bindAirportCorrectionButton();

    if (document.getElementById("correctionModal")) return;

    const style = document.createElement("style");
    style.textContent = `
      .correction-tools {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        align-items: center;
        margin-top: 10px;
      }

      .correction-tools button,
      .correction-modal button {
        border: 0;
        border-radius: 10px;
        background: #156082;
        color: #ffffff;
        font-weight: 700;
        padding: 10px 14px;
        cursor: pointer;
      }

      .correction-tools button.secondary {
        background: #475569;
      }

      .correction-modal[aria-hidden="true"] {
        display: none;
      }

      .correction-modal[aria-hidden="false"] {
        position: fixed;
        inset: 0;
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 18px;
        background: rgba(15, 23, 42, 0.78);
      }

      .correction-panel {
        width: min(920px, 100%);
        max-height: 92vh;
        overflow: auto;
        background: #ffffff;
        color: #0f172a;
        border-radius: 18px;
        box-shadow: 0 24px 70px rgba(0, 0, 0, 0.35);
        padding: 24px;
      }

      .correction-panel h2 {
        margin: 0 0 6px;
        font-size: 1.45rem;
      }

      .correction-panel p {
        margin: 0 0 18px;
        color: #475569;
      }

      .correction-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px;
      }

      .correction-field.full {
        grid-column: 1 / -1;
      }

      .correction-field label {
        display: block;
        font-weight: 700;
        margin-bottom: 5px;
      }

      .correction-field input,
      .correction-field textarea {
        width: 100%;
        border: 1px solid #cbd5e1;
        border-radius: 10px;
        padding: 10px 12px;
        font: inherit;
        box-sizing: border-box;
      }

      .correction-field textarea {
        min-height: 72px;
        resize: vertical;
      }

      .correction-help {
        margin-top: 4px;
        color: #64748b;
        font-size: 0.85rem;
      }

      .correction-actions {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        margin-top: 18px;
      }

      .correction-actions .cancel {
        background: #64748b;
      }

      .correction-message {
        margin-top: 12px;
        font-weight: 700;
        color: #166534;
      }

      .correction-message.error {
        color: #b91c1c;
      }

      body.correction-modal-open {
        overflow: hidden;
      }

      @media (max-width: 720px) {
        .correction-grid {
          grid-template-columns: 1fr;
        }
      }
    `;
    document.head.appendChild(style);

    const tools = document.getElementById("correctionTools");
    if (tools && !document.getElementById("amendAirportButton")) {
      const button = document.createElement("button");
      button.type = "button";
      button.id = "amendAirportButton";
      button.textContent = "Add/Amend Airport";
      tools.appendChild(button);
    }

    const modal = document.createElement("div");
    modal.id = "correctionModal";
    modal.className = "correction-modal";
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML = `
      <div class="correction-panel" role="dialog" aria-modal="true" aria-labelledby="correctionModalTitle">
        <h2 id="correctionModalTitle">Airport Correction</h2>
        <p>Add or amend a local airport record. Separate multiple sectors, apps, VSCS entries, contacts, or hours with commas.</p>

        <form id="correctionForm">
          <div class="correction-grid">
            <div class="correction-field">
              <label for="corrIdentifier">Airport Identifier</label>
              <input id="corrIdentifier" name="identifier" type="text" maxlength="5" required />
              <div class="correction-help">Examples: F82, KGGG, GGG</div>
            </div>

            <div class="correction-field">
              <label for="corrAirportName">Airport Name</label>
              <input id="corrAirportName" name="airportName" type="text" />
            </div>

            <div class="correction-field">
              <label for="corrSectors">Sector</label>
              <input id="corrSectors" name="sectors" type="text" placeholder="LBB L, LBB-L, LBB 64, or 64" />
            </div>

            <div class="correction-field">
              <label for="corrAreas">Area</label>
              <input id="corrAreas" name="areas" type="text" placeholder="RDR, UKW, JEN, DAL, BYP, CQY" />
              <div class="correction-help">Leave blank to derive area from the sector when possible.</div>
            </div>

            <div class="correction-field">
              <label for="corrApps">Approach</label>
              <input id="corrApps" name="apps" type="text" placeholder="LBB, LBB APP, SPS APP" />
            </div>

            <div class="correction-field">
              <label for="corrVscs">APP VSCS</label>
              <input id="corrVscs" name="vscs" type="text" placeholder='346 (05), 353 (04), 337 (08)' />
            </div>

            <div class="correction-field full">
              <label for="corrContacts">APP Contact / Notes</label>
              <textarea id="corrContacts" name="contacts" placeholder="Phone Number and Additional Info (Do Not Enter Military Approach Control Numbers)"></textarea>
            </div>

            <div class="correction-field">
              <label for="corrHours">APP Hours</label>
              <input id="corrHours" name="hours" type="text" placeholder="0000-2359" />
            </div>

            <div class="correction-field">
              <label for="corrLat">Latitude</label>
              <input id="corrLat" name="lat" type="number" step="0.0001" placeholder="33.1234" />
              <div class="correction-help">Approximation is okay. Four decimals is enough.</div>
            </div>

            <div class="correction-field">
              <label for="corrLon">Longitude</label>
              <input id="corrLon" name="lon" type="number" step="0.0001" placeholder="-101.1234" />
              <div class="correction-help">Approximation is okay. Four decimals is enough.</div>
            </div>
          </div>

          <div id="correctionMessage" class="correction-message"></div>

          <div class="correction-actions">
            <button type="button" class="cancel" id="correctionCancel">Cancel</button>
            <button type="submit" id="correctionSubmit">Save</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(modal);

    const addAirportButton = document.getElementById("addAirportButton");
    const amendAirportButton = document.getElementById("amendAirportButton");

    if (addAirportButton) {
      addAirportButton.addEventListener("click", () => openModal("combined"));
    }

    if (amendAirportButton) {
      amendAirportButton.addEventListener("click", () => openModal("combined"));
    }
    document.getElementById("correctionCancel").addEventListener("click", closeModal);

    modal.addEventListener("click", (event) => {
      if (event.target === modal) closeModal();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && modal.getAttribute("aria-hidden") === "false") closeModal();
    });

    document.getElementById("correctionForm").addEventListener("submit", function (event) {
      event.preventDefault();

      const mode = this.dataset.mode;
      const { ident, record } = makeRecordFromForm(this);

      if (!ident) {
        showMessage("Airport identifier is required.", true);
        return;
      }

      if (Number.isNaN(record.lat) || Number.isNaN(record.lon)) {
        showMessage("Latitude and longitude must be valid numbers when entered. APP fields may be left blank when none apply.", true);
        return;
      }

      const records = getRecords();
      const exists = Boolean(lookupRecord(ident));

      if (mode === "add" && exists) {
        showMessage("That airport already exists. Use Add/Amend Airport instead.", true);
        return;
      }

      if (mode === "amend" && !exists) {
        showMessage("That airport does not exist yet. Use Add/Amend Airport instead.", true);
        return;
      }

      const corrections = loadCorrections();
      corrections[ident] = record;
      saveCorrections(corrections);
      applyOneCorrection(ident, record);

      if (window.ZFW_SAVE_SHARED_RECORD) {
        window.ZFW_SAVE_SHARED_RECORD("airport", ident, record)
          .then(function (saved) {
            showMessage(saved
              ? "Airport saved for all PCs."
              : "Airport saved locally only. Firebase is not configured.",
              !saved
            );
          })
          .catch(function (error) {
            console.error(error);
            showMessage("Airport saved locally, but Firestore save failed. Check Firebase config/rules.", true);
          });
      } else {
        showMessage("Airport saved locally only.", false);
      }

      refreshCurrentLookup(ident);

      setTimeout(closeModal, 600);
    });
  }

  applySavedCorrections();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", createCorrectionUi);
  } else {
    createCorrectionUi();
  }
})();


/* PIREP waypoint/navaid add-amend tool */
(function () {
  "use strict";

  const STORAGE_KEY = "zfwPirepNavCorrections";

  function normalizeIdent(value) {
    return String(value || "").trim().toUpperCase();
  }

  function getAirportRecords() {
    if (!window.AIRPORT_DATA) window.AIRPORT_DATA = { records: {} };
    if (!window.AIRPORT_DATA.records) window.AIRPORT_DATA.records = {};
    return window.AIRPORT_DATA.records;
  }

  function getNavData() {
    if (!window.ZFW_NAV_DATA) window.ZFW_NAV_DATA = {};
    return window.ZFW_NAV_DATA;
  }

  function loadCorrections() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    } catch (error) {
      console.warn("Could not read PIREP waypoint/navaid corrections.", error);
      return {};
    }
  }

  function saveCorrections(corrections) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(corrections));
  }

  function applyPirepCorrection(ident, record) {
    const navData = getNavData();
    const airportRecords = getAirportRecords();

    ident = normalizeIdent(ident);

    // Navaids/waypoints are FAA identifiers, not airports. Never store a K-prefixed alias.
    if (ident.length === 4 && ident.startsWith("K")) {
      ident = ident.slice(1);
    }

    record.record_type = record.record_type || "WAYPOINT";

    delete navData[ident];
    delete airportRecords[ident];

    const fakeK = "K" + ident;
    if (airportRecords[fakeK] && String(airportRecords[fakeK].record_type || "").toUpperCase() !== "AIRPORT") {
      delete airportRecords[fakeK];
    }

    navData[ident] = JSON.parse(JSON.stringify(record));
    airportRecords[ident] = JSON.parse(JSON.stringify(record));
  }

  function applySavedPirepCorrections() {
    const corrections = loadCorrections();
    Object.keys(corrections).forEach(function (ident) {
      applyPirepCorrection(ident, corrections[ident]);
    });
  }

  function findExistingRecord(ident) {
    ident = normalizeIdent(ident);
    const navData = getNavData();
    const airportRecords = getAirportRecords();

    if (navData[ident]) return navData[ident];
    if (airportRecords[ident]) return airportRecords[ident];

    return null;
  }

  function showPirepMessage(message, isError) {
    const msg = document.getElementById("pirepNavMessage");
    if (!msg) return;

    msg.textContent = message;
    msg.className = isError ? "correction-message error" : "correction-message";
  }

  function clearPirepForm(form) {
    Array.from(form.elements).forEach(function (element) {
      if (element.tagName === "INPUT" || element.tagName === "TEXTAREA" || element.tagName === "SELECT") {
        element.value = "";
      }
    });
  }

  function fillPirepForm(form, ident, record) {
    form.identifier.value = ident || "";

    form.recordType.value = record.record_type || "WAYPOINT";
    form.nearestWx.value = record.nearest_wx || "";

    if (form.notes) form.notes.value = Array.isArray(record.contacts) ? record.contacts.join(", ") : "";
  }

  function makePirepRecordFromForm(form) {
    const ident = normalizeIdent(form.identifier.value);

    const record = {
      sectors: [],
      areas: [],
      apps: [],
      vscs: [],
      contacts: [],
      hours: [],
      airport_name: ident,
      record_type: form.recordType.value || "WAYPOINT",
      nearest_wx: normalizeIdent(form.nearestWx.value)
    };

    return { ident, record };
  }

  function currentSearchOrStatusIdent() {
    const input = document.getElementById("airportInput");
    const fromInput = normalizeIdent(input ? input.value : "");

    if (fromInput) {
      return fromInput;
    }

    const status = document.getElementById("status");
    const statusText = status ? String(status.textContent || "").trim().toUpperCase() : "";
    const statusMatch = statusText.match(/^([A-Z0-9]{3,5})\s+(?:NOT\s+FOUND|FOUND)\b/);

    return statusMatch ? normalizeIdent(statusMatch[1]) : "";
  }

  function openPirepModal() {
    const modal = document.getElementById("pirepNavModal");
    const form = document.getElementById("pirepNavForm");

    clearPirepForm(form);
    showPirepMessage("", false);

    const currentIdent = currentSearchOrStatusIdent();

    if (currentIdent) {
      const existing = findExistingRecord(currentIdent);

      if (existing && !isAirportRecord(existing)) {
        fillPirepForm(form, currentIdent, existing);
        showPirepMessage("Existing waypoint/navaid loaded. Saving will replace the old data.", false);
      } else {
        form.identifier.value = currentIdent;
        form.recordType.value = currentIdent.length === 5 ? "WAYPOINT" : "NAVAID";
        showPirepMessage("New waypoint/navaid ready to add. Enter the nearest weather reporting station and save.", false);
      }
    }

    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("correction-modal-open");
    setTimeout(function () {
      if (form.identifier.value && !form.nearestWx.value) {
        form.nearestWx.focus();
      } else {
        form.identifier.focus();
      }
    }, 0);
  }

  function closePirepModal() {
    const modal = document.getElementById("pirepNavModal");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("correction-modal-open");
  }

  function refreshCurrentLookup(ident) {
    const input = document.getElementById("airportInput");
    if (!input) return;

    input.value = ident;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));

    if (window.ZFW_UPDATE_NEAREST_WX) {
      setTimeout(window.ZFW_UPDATE_NEAREST_WX, 0);
      setTimeout(window.ZFW_UPDATE_NEAREST_WX, 100);
    }

    input.focus();
  }

  function reopenOrCreatePirepModal() {
    if (!document.getElementById("pirepNavModal")) {
      createPirepUi();
    }

    openPirepModal();
  }

  function bindPirepNavButton() {
    const button = document.getElementById("addPirepNavButton");
    if (button && button.dataset.pirepNavBound !== "true") {
      button.dataset.pirepNavBound = "true";

      const handler = function (event) {
        if (event) {
          event.preventDefault();
          event.stopPropagation();
        }
        reopenOrCreatePirepModal();
      };

      button.addEventListener("pointerdown", handler, true);
      button.addEventListener("click", handler, true);
    }
  }

  function createPirepUi() {
    const tools = document.getElementById("correctionTools");
    let button = document.getElementById("addPirepNavButton");

    if (tools && !button) {
      button = document.createElement("button");
      button.type = "button";
      button.id = "addPirepNavButton";
      button.className = "secondary";
      button.textContent = "Add/Amend Waypoint/Navaid for PIREP";
      tools.appendChild(button);
    }

    bindPirepNavButton();

    if (document.getElementById("pirepNavModal")) return;

    const modal = document.createElement("div");
    modal.id = "pirepNavModal";
    modal.className = "correction-modal";
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML = `
      <div class="correction-panel" role="dialog" aria-modal="true" aria-labelledby="pirepNavModalTitle">
        <h2 id="pirepNavModalTitle">Add/Amend Waypoint/Navaid for PIREP</h2>
        <p>Use this form to add/amend PIREP reference fixes (Waypoints/Navaids). Saving an existing identifier replaces the old waypoint/navaid weather station data.</p>

        <form id="pirepNavForm">
          <div class="correction-grid">
            <div class="correction-field">
              <label for="pirepIdentifier">Waypoint/Navaid Identifier</label>
              <input id="pirepIdentifier" name="identifier" type="text" maxlength="5" required />
              <div class="correction-help">Examples: BYP, EMG, CHMLI, BSKAT</div>
            </div>

            <div class="correction-field">
              <label for="pirepRecordType">Type</label>
              <select id="pirepRecordType" name="recordType">
                <option value="WAYPOINT">Waypoint</option>
                <option value="NAVAID">Navaid</option>
              </select>
            </div>

<div class="correction-field">
              <label for="pirepNearestWx">Nearest Weather Reporting Station</label>
              <input id="pirepNearestWx" name="nearestWx" type="text" maxlength="4" required />
              <div class="correction-help">Enter the valid reporting station identifier only, such as SHV, F00, SPS, GGG.</div>
            </div>
          </div>

          <div id="pirepNavMessage" class="correction-message"></div>

          <div class="correction-actions">
            <button type="button" class="cancel" id="pirepNavCancel">Cancel</button>
            <button type="submit" id="pirepNavSubmit">Save Waypoint/Navaid</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById("pirepNavCancel").addEventListener("click", closePirepModal);

    modal.addEventListener("click", function (event) {
      if (event.target === modal) closePirepModal();
    });

    document.getElementById("pirepNavForm").addEventListener("submit", function (event) {
      event.preventDefault();

      const result = makePirepRecordFromForm(this);
      let ident = result.ident;
      const record = result.record;

      if (ident.length === 4 && ident.startsWith("K")) {
        ident = ident.slice(1);
      }

      if (!ident) {
        showPirepMessage("Waypoint/navaid identifier is required.", true);
        return;
      }

if (!record.nearest_wx) {
        showPirepMessage("Nearest weather reporting station is required.", true);
        return;
      }

const corrections = loadCorrections();
      corrections[ident] = record;
      saveCorrections(corrections);
      applyPirepCorrection(ident, record);

      if (window.ZFW_SAVE_SHARED_RECORD) {
        window.ZFW_SAVE_SHARED_RECORD("navpoint", ident, record)
          .then(function (saved) {
            showPirepMessage(saved
              ? "Waypoint/navaid saved for all PCs."
              : "Waypoint/navaid saved locally only. Firebase is not configured.",
              !saved
            );
          })
          .catch(function (error) {
            console.error(error);
            showPirepMessage("Waypoint/navaid saved locally, but Firestore save failed. Check Firebase config/rules.", true);
          });
      } else {
        showPirepMessage("Waypoint/navaid saved locally only.", false);
      }

      refreshCurrentLookup(ident);
      setTimeout(closePirepModal, 700);
    });
  }

  applySavedPirepCorrections();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", createPirepUi);
  } else {
    createPirepUi();
  }
})();


/* Combined Add/Amend button behavior */
(function () {
  "use strict";

  function normalizeIdent(value) {
    return String(value || "").trim().toUpperCase();
  }

  function getAirportRecords() {
    if (!window.AIRPORT_DATA) window.AIRPORT_DATA = { records: {} };
    if (!window.AIRPORT_DATA.records) window.AIRPORT_DATA.records = {};
    return window.AIRPORT_DATA.records;
  }

  function airportExists(ident) {
    ident = normalizeIdent(ident);
    const records = getAirportRecords();
    if (records[ident]) return true;
    if (ident.length === 4 && ident.startsWith("K") && records[ident.slice(1)]) return true;
    if (ident.length === 3 && records["K" + ident]) return true;
    return false;
  }

  function createCombinedButtonCleanup() {
    const addAirportButton = document.getElementById("addAirportButton");
    const amendAirportButton = document.getElementById("amendAirportButton");

    if (amendAirportButton) {
      amendAirportButton.textContent = "Add/Amend Airport";
      amendAirportButton.style.display = "";
    }

    if (addAirportButton && amendAirportButton && addAirportButton !== amendAirportButton) {
      addAirportButton.style.display = "none";
    } else if (addAirportButton) {
      addAirportButton.textContent = "Add/Amend Airport";
    }

    const pirepButton = document.getElementById("addPirepNavButton");
    if (pirepButton) {
      pirepButton.textContent = "Add/Amend Waypoint/Navaid for PIREP";
    }
  }

  function patchAirportFormSubmit() {
    const form = document.getElementById("correctionForm");
    if (!form || form.dataset.combinedAddAmendPatched === "true") return;

    form.dataset.combinedAddAmendPatched = "true";

    // Force all airport corrections through amend mode. The existing submit logic
    // treats amend as replace when record exists and add when record does not, after this patch.
    form.addEventListener("submit", function () {
      form.dataset.mode = "combined";
    }, true);
  }

  // Patch the legacy modal title after it opens.
  function patchModalText() {
    const title = document.getElementById("correctionModalTitle");
    const submit = document.getElementById("correctionSubmit");
    if (title) title.textContent = "Add/Amend Airport";
    if (submit) submit.textContent = "Save Airport";
  }

  function observeModal() {
    const modal = document.getElementById("correctionModal");
    if (!modal || !window.MutationObserver) return;

    new MutationObserver(function () {
      if (modal.getAttribute("aria-hidden") === "false") {
        patchModalText();
        patchAirportFormSubmit();
      }
    }).observe(modal, { attributes: true, attributeFilter: ["aria-hidden"] });
  }

  function boot() {
    createCombinedButtonCleanup();
    patchAirportFormSubmit();
    observeModal();

    setInterval(function () {
      createCombinedButtonCleanup();
      patchModalText();
    }, 500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();



/* Airport form dropdown/GPS enhancement */
(function () {
  "use strict";

  const LOW_SECTORS = [
    "",
    "MAF 40", "LBB 64", "ABI 63", "EDN 62", "SPS 34", "OKC 35", "UKW 75", "POS 32", "ACT 96", "FRI 53", "MLC 38", "SEA 37", "UIM 83", "TXK 27", "DON 29", "MLU 30"
  ];

  const AREAS = ["", "DAL", "CQY", "BYP", "JEN", "UKW", "RDR"];

  const APPROACHES = [
    "N/A",
    "D10 APP", "LBB APP", "SPS APP", "LTS APP", "FSI APP",
    "GGG APP", "SHV APP", "TYR APP", "ACT APP", "ABI APP", "SJT APP",
    "MLU APP", "FSM APP", "OKC APP", "TUL APP", "LAW APP"
  ];

  function normalizeIdent(value) {
    return String(value || "").trim().toUpperCase();
  }

  function optionHtml(values, selected) {
    selected = normalizeIdent(selected);
    return values.map(function (value) {
      const label = value || "";
      const sel = normalizeIdent(value) === selected ? " selected" : "";
      return `<option value="${value}"${sel}>${label || "Select"}</option>`;
    }).join("");
  }

  function replaceInputWithSelect(input, values, currentValue) {
    if (!input || input.tagName === "SELECT") return input;

    const select = document.createElement("select");
    select.id = input.id;
    select.name = input.name;
    select.className = input.className;
    select.innerHTML = optionHtml(values, currentValue || input.value || input.placeholder || "");

    input.replaceWith(select);
    return select;
  }

  function dmmToDecimal(deg, minutes, hemi) {
    let value = Number(deg) + Number(minutes) / 60;
    if (String(hemi).toUpperCase() === "S" || String(hemi).toUpperCase() === "W") {
      value *= -1;
    }
    return Math.round(value * 10000) / 10000;
  }

  function parseSkyVectorGps(value) {
    const text = String(value || "").toUpperCase().replace(/GPS/g, "").trim();

    // Accept N33°39.84' W101°49.07'
    let m = text.match(/([NS])\s*(\d{1,2})\s*[°\s]\s*(\d{1,2}(?:\.\d+)?)\s*['’]?\s*[, ]+\s*([EW])\s*(\d{1,3})\s*[°\s]\s*(\d{1,2}(?:\.\d+)?)\s*['’]?/);
    if (m) {
      return {
        lat: dmmToDecimal(m[2], m[3], m[1]),
        lon: dmmToDecimal(m[5], m[6], m[4])
      };
    }

    // Accept 33°39.84'N 101°49.07'W
    m = text.match(/(\d{1,2})\s*[°\s]\s*(\d{1,2}(?:\.\d+)?)\s*['’]?\s*([NS])\s*[, ]+\s*(\d{1,3})\s*[°\s]\s*(\d{1,2}(?:\.\d+)?)\s*['’]?\s*([EW])/);
    if (m) {
      return {
        lat: dmmToDecimal(m[1], m[2], m[3]),
        lon: dmmToDecimal(m[4], m[5], m[6])
      };
    }

    // Accept decimal pair as fallback.
    m = text.match(/(-?\d{1,3}\.\d+)\s*,?\s+(-?\d{1,3}\.\d+)/);
    if (m) {
      return {
        lat: Math.round(Number(m[1]) * 10000) / 10000,
        lon: Math.round(Number(m[2]) * 10000) / 10000
      };
    }

    return null;
  }

  function createGpsField() {
    const latInput = document.querySelector('#correctionForm input[name="lat"], #correctionForm input[name="latitude"], #correctionForm #latitude, #correctionForm #airportLat');
    const lonInput = document.querySelector('#correctionForm input[name="lon"], #correctionForm input[name="longitude"], #correctionForm #longitude, #correctionForm #airportLon');

    if (!latInput && !lonInput) return;

    const existingGps = document.getElementById("airportGpsPaste");
    if (existingGps) return;

    const wrapper = document.createElement("div");
    wrapper.className = "correction-field full";
    wrapper.innerHTML = `
      <label for="airportGpsPaste">GPS Coordinates</label>
      <input id="airportGpsPaste" name="gps" type="text" placeholder="Copy & Paste the GPS info from SkyVector" />
      <div class="correction-help">Accepted example: GPS N33°39.84' W101°49.07'</div>
    `;

    const insertAt = latInput ? latInput.closest(".correction-field") : lonInput.closest(".correction-field");
    if (insertAt && insertAt.parentNode) {
      insertAt.parentNode.insertBefore(wrapper, insertAt);
    }

    if (latInput) {
      latInput.closest(".correction-field")?.remove();
    }

    if (lonInput) {
      lonInput.closest(".correction-field")?.remove();
    }
  }


  function removeAreaField() {
    const areaInput = document.querySelector('#correctionForm [name="area"], #correctionForm [name="areas"], #correctionForm #area, #correctionForm #airportArea');
    const areaField = areaInput ? areaInput.closest(".correction-field") : null;
    if (areaField) {
      areaField.remove();
    }
  }


  function areaFromSectorValue(sectorValue) {
    const sector = String(sectorValue || "").toUpperCase().trim();

    // Operational area mapping. Area names are the six ZFW areas;
    // they are not airport identifiers or sector identifiers.
    const sectorAreaMap = {
      "LBB 64": "RDR",
      "POS 32": "RDR",
      "MAF 40": "JEN",
      "ABI 63": "JEN",
      "EDN 62": "JEN",
      "ACT 96": "DAL",
      "UIM 83": "DAL",
      "TXK 27": "DAL",
      "SPS 34": "UKW",
      "OKC 35": "UKW",
      "UKW 75": "UKW",
      "FRI 53": "BYP",
      "MLC 38": "BYP",
      "SEA 37": "BYP",
      "DON 29": "CQY",
      "MLU 30": "CQY"
    };

    return sectorAreaMap[sector] || "";
  }

  function ensureDerivedAreaField(form) {
    if (!form) return;

    const sectorField = form.querySelector('[name="sector"], [name="sectors"], #sector, #airportSector');
    const sectorValue = sectorField ? sectorField.value : "";
    const derivedArea = areaFromSectorValue(sectorValue);

    let hiddenArea = form.querySelector('input[name="area"]');
    if (!hiddenArea) {
      hiddenArea = document.createElement("input");
      hiddenArea.type = "hidden";
      hiddenArea.name = "area";
      form.appendChild(hiddenArea);
    }

    hiddenArea.value = derivedArea;
  }

  function enhanceAirportForm() {
    const form = document.getElementById("correctionForm");
    if (!form) return;

    removeAreaField();

    const sectorInput = form.querySelector('[name="sector"], [name="sectors"], #sector, #airportSector');
    const appInput = form.querySelector('[name="app"], [name="apps"], [name="approach"], #approach, #airportApproach');

    replaceInputWithSelect(sectorInput, LOW_SECTORS);
    replaceInputWithSelect(appInput, APPROACHES);

    createGpsField();

    if (form.dataset.gpsPatched !== "true") {
      form.dataset.gpsPatched = "true";
      form.addEventListener("submit", function (event) {
        ensureDerivedAreaField(form);
        const gpsInput = document.getElementById("airportGpsPaste");
        if (!gpsInput || !gpsInput.value.trim()) return;

        const parsed = parseSkyVectorGps(gpsInput.value);
        if (!parsed) {
          event.preventDefault();
          const message = document.getElementById("correctionMessage");
          if (message) {
            message.textContent = "GPS format not recognized. Use format like GPS N33°39.84' W101°49.07'";
            message.className = "correction-message error";
          } else {
            alert("GPS format not recognized. Use format like GPS N33°39.84' W101°49.07'");
          }
          return;
        }

        // Create hidden lat/lon fields so the existing save logic continues to work.
        let latHidden = form.querySelector('input[name="lat"]');
        let lonHidden = form.querySelector('input[name="lon"]');

        if (!latHidden) {
          latHidden = document.createElement("input");
          latHidden.type = "hidden";
          latHidden.name = "lat";
          form.appendChild(latHidden);
        }

        if (!lonHidden) {
          lonHidden = document.createElement("input");
          lonHidden.type = "hidden";
          lonHidden.name = "lon";
          form.appendChild(lonHidden);
        }

        latHidden.value = parsed.lat;
        lonHidden.value = parsed.lon;
      }, true);
    }
  }

  function bootAirportFormEnhancement() {
    enhanceAirportForm();

    const modal = document.getElementById("correctionModal");
    if (modal && window.MutationObserver) {
      new MutationObserver(function () {
        if (modal.getAttribute("aria-hidden") === "false") {
          setTimeout(enhanceAirportForm, 0);
          setTimeout(enhanceAirportForm, 150);
        }
      }).observe(modal, { attributes: true, attributeFilter: ["aria-hidden"] });
    }

    setInterval(enhanceAirportForm, 500);
  }

  window.ZFW_PARSE_SKYVECTOR_GPS = parseSkyVectorGps;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootAirportFormEnhancement);
  } else {
    bootAirportFormEnhancement();
  }
})();



/* Static correction button binding safety net */
(function () {
  "use strict";

  function bindStaticCorrectionButtons() {
    const airportButton = document.getElementById("amendAirportButton");
    if (airportButton && airportButton.dataset.airportCorrectionBound !== "true" && typeof openModal === "function") {
      airportButton.dataset.airportCorrectionBound = "true";
      airportButton.addEventListener("click", function () { openModal("add"); });
    }

    const pirepButton = document.getElementById("addPirepNavButton");
    if (pirepButton && pirepButton.dataset.pirepNavBound !== "true" && typeof openPirepModal === "function") {
      pirepButton.dataset.pirepNavBound = "true";

      const pirepHandler = function (event) {
        if (event) {
          event.preventDefault();
          event.stopPropagation();
        }
        openPirepModal();
      };

      pirepButton.addEventListener("pointerdown", pirepHandler, true);
      pirepButton.addEventListener("click", pirepHandler, true);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindStaticCorrectionButtons);
  } else {
    bindStaticCorrectionButtons();
  }

  setTimeout(bindStaticCorrectionButtons, 250);
  setTimeout(bindStaticCorrectionButtons, 750);
  setTimeout(bindStaticCorrectionButtons, 1500);
})();


/* Highlight correction buttons when a searched item is not found */
(function () {
  "use strict";

  const BUTTON_IDS = [
    "amendAirportButton",
    "addPirepNavButton",
    "addNonZfwAirportButton"
  ];

  function ensureNotFoundHighlightStyle() {
    if (document.getElementById("zfwNotFoundButtonHighlightStyle")) return;

    const style = document.createElement("style");
    style.id = "zfwNotFoundButtonHighlightStyle";
    style.textContent = `
      @keyframes zfwNotFoundButtonGlow {
        0%, 100% {
          outline-color: rgba(65, 209, 125, 0.55);
          box-shadow:
            0 0 0 2px rgba(65, 209, 125, 0.35),
            0 0 10px rgba(65, 209, 125, 0.25),
            inset 0 0 0 1px rgba(65, 209, 125, 0.30);
        }

        50% {
          outline-color: rgba(65, 209, 125, 1);
          box-shadow:
            0 0 0 5px rgba(65, 209, 125, 0.60),
            0 0 28px rgba(65, 209, 125, 0.70),
            inset 0 0 0 2px rgba(65, 209, 125, 0.65);
        }
      }

      #correctionTools button.zfw-not-found-action {
        border: 2px solid var(--green) !important;
        outline: 3px solid rgba(65, 209, 125, 0.85) !important;
        outline-offset: 4px !important;
        animation: zfwNotFoundButtonGlow 2.1s ease-in-out infinite !important;
      }
    `;
    document.head.appendChild(style);
  }

  function statusShowsNotFound() {
    const status = document.getElementById("status");
    const text = status ? String(status.textContent || "").trim().toUpperCase() : "";

    return /^[A-Z0-9]{3,5}\s+NOT\s+FOUND\b/.test(text);
  }

  function zfwUpdateNotFoundButtonHighlight() {
    ensureNotFoundHighlightStyle();

    const on = statusShowsNotFound();

    BUTTON_IDS.forEach(function (id) {
      const button = document.getElementById(id);
      if (button) {
        button.classList.toggle("zfw-not-found-action", on);
      }
    });
  }

  function watchNotFoundStatus() {
    zfwUpdateNotFoundButtonHighlight();

    const status = document.getElementById("status");
    if (status && !status.dataset.notFoundObserverAttached) {
      status.dataset.notFoundObserverAttached = "true";

      new MutationObserver(zfwUpdateNotFoundButtonHighlight).observe(status, {
        childList: true,
        subtree: true,
        characterData: true
      });
    }

    const input = document.getElementById("airportInput");
    if (input && !input.dataset.notFoundButtonWatcherAttached) {
      input.dataset.notFoundButtonWatcherAttached = "true";
      ["input", "change", "blur"].forEach(function (eventName) {
        input.addEventListener(eventName, function () {
          setTimeout(zfwUpdateNotFoundButtonHighlight, 0);
          setTimeout(zfwUpdateNotFoundButtonHighlight, 100);
        });
      });
    }
  }

  window.zfwUpdateNotFoundButtonHighlight = zfwUpdateNotFoundButtonHighlight;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", watchNotFoundStatus);
  } else {
    watchNotFoundStatus();
  }

  setTimeout(watchNotFoundStatus, 250);
  setTimeout(watchNotFoundStatus, 750);
  setInterval(zfwUpdateNotFoundButtonHighlight, 1000);
})();


/* Capture-level correction button opening so active search text cannot block buttons */
(function () {
  "use strict";

  function zfwBindActionButtonsCapture() {
    const airportButton = document.getElementById("amendAirportButton");
    if (airportButton && airportButton.dataset.zfwCaptureBound !== "true") {
      airportButton.dataset.zfwCaptureBound = "true";
      airportButton.addEventListener("pointerdown", function (event) {
        event.preventDefault();
        event.stopPropagation();
        if (typeof openModal === "function") openModal("add");
      }, true);
    }

    const pirepButton = document.getElementById("addPirepNavButton");
    if (pirepButton && pirepButton.dataset.zfwCaptureBound !== "true") {
      pirepButton.dataset.zfwCaptureBound = "true";
      pirepButton.addEventListener("pointerdown", function (event) {
        event.preventDefault();
        event.stopPropagation();
        if (typeof openPirepModal === "function") openPirepModal();
      }, true);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", zfwBindActionButtonsCapture);
  } else {
    zfwBindActionButtonsCapture();
  }

  setTimeout(zfwBindActionButtonsCapture, 250);
  setTimeout(zfwBindActionButtonsCapture, 750);
  setTimeout(zfwBindActionButtonsCapture, 1500);
})();
