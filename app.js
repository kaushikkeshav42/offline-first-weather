import { saveForecastToIDB, getForecastFromIDB, getAllCachedCities } from "./db.js";

const state = {
  totalRequests: 0,
  cacheHits: 0,
  isOnline: navigator.onLine
};

const searchInput = document.getElementById("city-search");
const weatherDisplay = document.getElementById("weather-display");
const networkBadge = document.getElementById("network-badge");
const cacheHitCounter = document.getElementById("cache-hit-counter");
const cachedCitiesList = document.getElementById("cached-cities-list");

// Register Service Worker for offline asset & API caching
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((err) => {
      console.warn("Service Worker registration failed:", err);
    });
  });
}

// Debounce Utility (300ms)
function debounce(fn, delay = 300) {
  let timerId;
  return (...args) => {
    clearTimeout(timerId);
    timerId = setTimeout(() => fn(...args), delay);
  };
}

function updateMetricsUI() {
  if (state.totalRequests === 0) return;
  const pct = Math.round((state.cacheHits / state.totalRequests) * 100);
  cacheHitCounter.textContent = `Network Calls Saved: ${pct}% (${state.cacheHits}/${state.totalRequests})`;
}

function updateNetworkStatus() {
  state.isOnline = navigator.onLine;
  networkBadge.textContent = state.isOnline ? "Online" : "Offline Mode (IndexedDB Active)";
  networkBadge.className = `badge ${state.isOnline ? "online" : "offline"}`;
}

window.addEventListener("online", updateNetworkStatus);
window.addEventListener("offline", updateNetworkStatus);

async function fetchWeatherForCity(query) {
  const cleanQuery = query.trim();
  if (cleanQuery.length < 2) return;

  state.totalRequests += 1;
  const cached = await getForecastFromIDB(cleanQuery);

  // Return IndexedDB cached response if fresh OR if browser is offline
  if (cached && (cached.isFresh || !navigator.onLine)) {
    state.cacheHits += 1;
    updateMetricsUI();
    renderWeather(cached, "IndexedDB Cache Hit");
    return;
  }

  try {
    weatherDisplay.innerHTML = `<p>Fetching live forecast for <strong>${cleanQuery}</strong>...</p>`;

    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cleanQuery)}&count=1&language=en&format=json`
    );
    const geoData = await geoRes.json();

    if (!geoData.results || geoData.results.length === 0) {
      weatherDisplay.innerHTML = `<p>No matching location found for "${cleanQuery}".</p>`;
      return;
    }

    const { latitude, longitude, name, country } = geoData.results[0];
    const weatherRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min&timezone=auto`
    );
    const weatherData = await weatherRes.json();

    const payload = {
      cityName: name,
      country: country || "",
      current: weatherData.current,
      daily: weatherData.daily
    };

    await saveForecastToIDB(cleanQuery, payload);
    await saveForecastToIDB(name, payload);
    updateMetricsUI();
    renderWeather({ ...payload, timestamp: Date.now() }, "Live REST API");
    await refreshCachedCitiesList();
  } catch (error) {
    // Fallback to stale IndexedDB data if network fails mid-request
    if (cached) {
      state.cacheHits += 1;
      updateMetricsUI();
      renderWeather(cached, "Offline Fallback (Stale IndexedDB)");
    } else {
      weatherDisplay.innerHTML = `<p>Offline and no cached forecast available for "${cleanQuery}".</p>`;
    }
  }
}

function renderWeather(data, sourceLabel) {
  const daysHtml = data.daily.time
    .slice(0, 5)
    .map(
      (dateStr, idx) => `
      <div class="day-box">
        <strong>${new Date(dateStr).toLocaleDateString("en-US", { weekday: "short" })}</strong>
        <div>↑ ${Math.round(data.daily.temperature_2m_max[idx])}°C</div>
        <div style="color:var(--muted)">↓ ${Math.round(data.daily.temperature_2m_min[idx])}°C</div>
      </div>
    `
    )
    .join("");

  weatherDisplay.innerHTML = `
    <div class="weather-header">
      <div>
        <h2>${data.cityName}, ${data.country}</h2>
        <small style="color:var(--muted)">Source: ${sourceLabel} • Updated ${new Date(data.timestamp).toLocaleTimeString()}</small>
      </div>
      <div class="temp-Readout">${Math.round(data.current.temperature_2m)}°C</div>
    </div>
    <p>Humidity: <strong>${data.current.relative_humidity_2m}%</strong> | Wind Speed: <strong>${data.current.wind_speed_10m} km/h</strong></p>
    <div class="forecast-grid">${daysHtml}</div>
  `;
}

async function refreshCachedCitiesList() {
  const all = await getAllCachedCities();
  const uniqueByName = new Map();
  all.forEach((item) => uniqueByName.set(item.cityName, item));

  cachedCitiesList.innerHTML = "";
  uniqueByName.forEach((item) => {
    const btn = document.createElement("button");
    btn.className = "city-pill";
    btn.textContent = `${item.cityName} (${Math.round(item.current.temperature_2m)}°C)`;
    btn.addEventListener("click", () => {
      searchInput.value = item.cityName;
      fetchWeatherForCity(item.cityName);
    });
    cachedCitiesList.appendChild(btn);
  });
}

searchInput.addEventListener(
  "input",
  debounce((e) => {
    fetchWeatherForCity(e.target.value);
  }, 300)
);

updateNetworkStatus();
refreshCachedCitiesList();
fetchWeatherForCity("Bahadurgarh");