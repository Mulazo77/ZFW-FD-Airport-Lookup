// Safe Firestore correction layer for ZFW FDU Airport Locator.
// This version will not trap the site in a loading loop if Firebase is blocked,
// not configured, or anonymous auth is not enabled.

(function () {
  "use strict";

  const FIREBASE_APP_URL = "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
  const FIREBASE_AUTH_URL = "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
  const FIREBASE_FIRESTORE_URL = "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
  const FIREBASE_TIMEOUT_MS = 5000;

  let initialized = false;
  let initFailed = false;
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

  function applyRecord(type, ident, record) {
    ident = normalizeIdent(ident);
    if (!ident) return;

    record = clone(record);

    if (type === "airport") {
      const records = getAirportRecords();
      records[ident] = record;

      if (ident.length === 4 && ident.startsWith("K")) {
        records[ident.slice(1)] = clone(record);
      } else if (ident.length === 3) {
        records["K" + ident] = clone(record);
      }
    } else {
      getNavData()[ident] = record;
      getAirportRecords()[ident] = record;
    }

    if (window.ZFW_UPDATE_NEAREST_WX) {
      setTimeout(window.ZFW_UPDATE_NEAREST_WX, 0);
    }
  }

  function timeoutPromise(ms) {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Firebase connection timed out.")), ms);
    });
  }

  async function initFirebaseSafe() {
    if (initialized) return true;
    if (initFailed) return false;

    try {
      if (!window.ZFW_FIREBASE_CONFIG || window.ZFW_FIREBASE_CONFIG.apiKey === "PASTE_API_KEY_HERE") {
        throw new Error("Firebase config is missing.");
      }

      const firebaseLoad = Promise.all([
        import(FIREBASE_APP_URL),
        import(FIREBASE_AUTH_URL),
        import(FIREBASE_FIRESTORE_URL)
      ]);

      const [appMod, authMod, firestoreMod] = await Promise.race([
        firebaseLoad,
        timeoutPromise(FIREBASE_TIMEOUT_MS)
      ]);

      const app = appMod.initializeApp(window.ZFW_FIREBASE_CONFIG);
      const auth = authMod.getAuth(app);
      db = firestoreMod.getFirestore(app);
      firestoreApi = firestoreMod;

      await Promise.race([
        authMod.signInAnonymously(auth),
        timeoutPromise(FIREBASE_TIMEOUT_MS)
      ]);

      initialized = true;
      console.log("ZFW Firestore shared corrections connected.");
      return true;
    } catch (error) {
      initFailed = true;
      console.warn("ZFW Firestore shared corrections disabled:", error.message || error);
      return false;
    }
  }

  async function loadSharedCorrections() {
    const ok = await initFirebaseSafe();
    if (!ok) return false;

    try {
      const { collection, getDocs } = firestoreApi;

      for (const item of [
        { type: "airport", path: "airports" },
        { type: "navpoint", path: "navpoints" }
      ]) {
        const snapshot = await getDocs(collection(db, "zfw_corrections", item.path, "records"));
        snapshot.forEach((docSnap) => {
          applyRecord(item.type, docSnap.id, docSnap.data());
        });
      }

      return true;
    } catch (error) {
      console.warn("Could not load shared Firestore corrections:", error.message || error);
      return false;
    }
  }

  async function saveSharedRecord(type, ident, record) {
    const ok = await initFirebaseSafe();

    ident = normalizeIdent(ident);
    if (!ident) return false;

    applyRecord(type, ident, record);

    if (!ok) {
      return false;
    }

    try {
      const { doc, setDoc, serverTimestamp } = firestoreApi;
      const collectionName = type === "airport" ? "airports" : "navpoints";
      const cleanRecord = clone(record);

      cleanRecord.identifier = ident;
      cleanRecord.data_category = type === "airport" ? "airport" : "navpoint";
      cleanRecord.updated_at = serverTimestamp();

      await setDoc(doc(db, "zfw_corrections", collectionName, "records", ident), cleanRecord);
      return true;
    } catch (error) {
      console.warn("Could not save shared Firestore correction:", error.message || error);
      return false;
    }
  }

  function listenForSharedCorrections() {
    initFirebaseSafe().then((ok) => {
      if (!ok) return;

      try {
        const { collection, onSnapshot } = firestoreApi;

        [
          { type: "airport", path: "airports" },
          { type: "navpoint", path: "navpoints" }
        ].forEach((item) => {
          onSnapshot(
            collection(db, "zfw_corrections", item.path, "records"),
            (snapshot) => {
              snapshot.docChanges().forEach((change) => {
                if (change.type === "removed") return;
                applyRecord(item.type, change.doc.id, change.doc.data());
              });
            },
            (error) => {
              console.warn("Firestore listener stopped:", error.message || error);
            }
          );
        });
      } catch (error) {
        console.warn("Could not start Firestore listener:", error.message || error);
      }
    });
  }

  window.ZFW_SAVE_SHARED_RECORD = saveSharedRecord;
  window.ZFW_LOAD_SHARED_CORRECTIONS = loadSharedCorrections;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      loadSharedCorrections().then(listenForSharedCorrections);
    });
  } else {
    loadSharedCorrections().then(listenForSharedCorrections);
  }
})();
