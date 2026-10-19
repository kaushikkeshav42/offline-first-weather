const DB_NAME = "WeatherOfflineDB";
const DB_VERSION = 1;
const STORE_NAME = "forecasts";
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes fresh TTL

export function openWeatherDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "cityKey" });
        store.createIndex("timestamp", "timestamp", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveForecastToIDB(cityKey, payload) {
  const db = await openWeatherDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.put({
      cityKey: cityKey.toLowerCase().trim(),
      cityName: payload.cityName,
      country: payload.country,
      current: payload.current,
      daily: payload.daily,
      timestamp: Date.now()
    });
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getForecastFromIDB(cityKey) {
  const db = await openWeatherDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(cityKey.toLowerCase().trim());
    req.onsuccess = () => {
      const record = req.result;
      if (!record) return resolve(null);
      const isFresh = Date.now() - record.timestamp < CACHE_TTL_MS;
      resolve({ ...record, isFresh });
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getAllCachedCities() {
  const db = await openWeatherDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}