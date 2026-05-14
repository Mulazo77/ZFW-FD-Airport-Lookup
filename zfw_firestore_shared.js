// Shared Firestore correction layer for ZFW FDU Airport Locator.
// Keeps the current site login in place and saves corrections centrally.
// Requires firebase_config.js to be loaded before this file.

(function () {
  "use strict";

  const FIREBASE_APP_URL = "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
  const FIREBASE_AUTH_URL = "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
  const FIREBASE_FIRESTORE_URL = "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

  let firebaseReadyPromise = null;
  let firestoreApi = null;
  let db = null;

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

  function clone(value) {
    return JSON.parse(JSON.stringify(value || {}));
  }

  function recordCollection(type) {
    type = String(type || "").toLowerCase();
    if (type === "airport") return "airports";
    return "navpoints";
  }

  async function importFirebaseModules() {
    const [appMod, authMod, firestoreMod] = await Promise.all([
      import(FIREBASE_APP_URL),
      import(FIREBASE_AUTH_URL),
      import(FIREBASE_FIRESTORE_URL)
    ]);

    return { appMod, authMod, firestoreMod };
  }

  async function initFirebase() {
    if (firebaseReadyPromise) return firebaseReadyPromise;

    firebaseReadyPromise = (async function () {
      if (!window.ZFW_FIREBASE_CONFIG || window.ZFW_FIREBASE_CONFIG.apiKey === "PASTE_API_KEY_HERE") {
        console.warn("Firebase config is not set. Shared corrections are disabled until firebase_config.js is completed.");
        return null;
      }

      const { appMod, authMod, firestoreMod } = await importFirebaseModules();

      const app = appMod.initializeApp(window.ZFW_FIREBASE_CONFIG);
      const auth = authMod.getAuth(app);
      db = firestoreMod.getFirestore(app);
      firestoreApi = firestoreMod;

      // Keeps current ZFW/ZFWCD site login, then uses anonymous Firebase auth for Firestore rules.
      // This is not strong identity security, but it matches the current gate while enabling central writes.
      await authMod.signInAnonymously(auth);

      return { app, auth, db, firestoreApi };
    })();

    return firebaseReadyPromise;
  }

  function applyRecord(type, ident, record) {
    ident = normalizeIdent(ident);
    if (!ident) return;

    record = clone(record);

    if (record.type === undefined) {
      record.type = type === "airport" ? "AIRPORT" : (record.record_type || "WAYPOINT");
    }

    if (type === "airport") {
      const records = getAirportRecords();
      records[ident] = record;

      if (ident.length === 4 && ident.startsWith("K")) {
        records[ident.slice(1)] = clone(record);
      } else if (ident.length === 3) {
        records["K" + ident] = clone(record);
      }
    } else {
      const navData = getNavData();
      navData[ident] = record;
      getAirportRecords()[ident] = record;
    }
  }

  async function loadSharedCorrections() {
    const ready = await initFirebase();
    if (!ready) return;

    const { collection, getDocs } = firestoreApi;

    for (const type of ["airport", "navpoint"]) {
      const colName = recordCollection(type);
      const snapshot = await getDocs(collection(db, "zfw_corrections", colName, "records"));

      snapshot.forEach((docSnap) => {
        applyRecord(type, docSnap.id, docSnap.data());
      });
    }

    if (window.ZFW_UPDATE_NEAREST_WX) {
      window.ZFW_UPDATE_NEAREST_WX();
    }
  }

  async function saveSharedRecord(type, ident, record) {
    const ready = await initFirebase();
    if (!ready) {
      alert("Firebase is not configured yet. The correction was applied only to this browser.");
      return false;
    }

    ident = normalizeIdent(ident);
    if (!ident) return false;

    const { doc, setDoc, serverTimestamp } = firestoreApi;
    const colName = recordCollection(type);
    const cleanRecord = clone(record);

    cleanRecord.identifier = ident;
    cleanRecord.data_category = type === "airport" ? "airport" : "navpoint";
    cleanRecord.updated_at = serverTimestamp();

    await setDoc(doc(db, "zfw_corrections", colName, "records", ident), cleanRecord);

    applyRecord(type, ident, cleanRecord);

    if (window.ZFW_UPDATE_NEAREST_WX) {
      window.ZFW_UPDATE_NEAREST_WX();
    }

    return true;
  }

  function listenForSharedCorrections() {
    initFirebase().then((ready) => {
      if (!ready) return;

      const { collection, onSnapshot } = firestoreApi;

      ["airport", "navpoint"].forEach((type) => {
        const colName = recordCollection(type);

        onSnapshot(collection(db, "zfw_corrections", colName, "records"), (snapshot) => {
          snapshot.docChanges().forEach((change) => {
            if (change.type === "removed") return;
            applyRecord(type, change.doc.id, change.doc.data());
          });

          if (window.ZFW_UPDATE_NEAREST_WX) {
            window.ZFW_UPDATE_NEAREST_WX();
          }
        });
      });
    });
  }

  window.ZFW_SAVE_SHARED_RECORD = saveSharedRecord;
  window.ZFW_LOAD_SHARED_CORRECTIONS = loadSharedCorrections;

  // Load once immediately, then listen for future changes.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      loadSharedCorrections().then(listenForSharedCorrections);
    });
  } else {
    loadSharedCorrections().then(listenForSharedCorrections);
  }
})();
