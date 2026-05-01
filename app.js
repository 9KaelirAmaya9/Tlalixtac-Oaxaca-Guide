import PLACES from './data/places.js';

const HOME = { lat: 17.0606387, lng: -96.655188 };
const STORAGE_KEY = 'oaxaca-guide-settings';

const CATEGORIES = {
  food: { color: '#D97B4F', label: 'Eat & Drink', emoji: '🍽' },
  activity: { color: '#4EA882', label: 'Things To Do', emoji: '🌿' },
  fitness: { color: '#4D8FC4', label: 'Workout', emoji: '💪' },
  laundry: { color: '#9B68C0', label: 'Laundry', emoji: '👕' },
  medical: { color: '#C44E4E', label: 'Medical', emoji: '🏥' },
  market: { color: '#72B04F', label: 'Market', emoji: '🛒' },
  atm: { color: '#C4A030', label: 'ATM / Bank', emoji: '💳' },
  transit: { color: '#4E8EC4', label: 'Bus / Transit', emoji: '🚌' },
};

const elements = {
  body: document.body,
  search: document.getElementById('searchInput'),
  chips: document.querySelectorAll('[data-filter]'),
  count: document.getElementById('resultCount'),
  clear: document.getElementById('clearFilters'),
  list: document.getElementById('placesList'),
  theme: document.getElementById('themeToggle'),
  locate: document.getElementById('locateButton'),
  panel: document.querySelector('.panel'),
  sheetButton: document.getElementById('sheetToggle'),
  sheetHandle: document.getElementById('sheetHandle'),
  noResults: document.getElementById('noResults'),
};

const state = {
  currentCategory: 'all',
  searchTerm: '',
  activeId: null,
  theme: 'dark',
};

const markers = new Map();
let map;
let darkTiles;
let labelTiles;
let lightTiles;
let locMarker = null;
let locCircle = null;

function loadSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    state.theme = stored.theme || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    state.currentCategory = stored.category || 'all';
    state.searchTerm = stored.search || '';
  } catch {
    state.theme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
}

function saveSettings() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ theme: state.theme, category: state.currentCategory, search: state.searchTerm })
  );
}

function setTheme(theme) {
  state.theme = theme;
  elements.body.classList.toggle('light', theme === 'light');
  elements.theme.textContent = theme === 'light' ? '🌙 Dark' : '☀️ Light';

  if (theme === 'light') {
    map.removeLayer(darkTiles);
    map.removeLayer(labelTiles);
    lightTiles.addTo(map);
  } else {
    if (map.hasLayer(lightTiles)) map.removeLayer(lightTiles);
    darkTiles.addTo(map);
    labelTiles.addTo(map);
  }
  saveSettings();
}

function mkIcon(cat, isActive) {
  const color = CATEGORIES[cat]?.color || '#999';
  const size = isActive ? 32 : 22;
  const glow = isActive ? `0 0 0 8px ${color}22, 0 0 0 16px ${color}14` : '0 4px 16px rgba(0,0,0,.35)';
  return L.divIcon({
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid rgba(255,255,255,0.9);box-shadow:${glow};"></div>`,
  });
}

function buildMap() {
  map = L.map('map', {
    center: [HOME.lat + 0.003, HOME.lng - 0.02],
    zoom: 14,
    zoomControl: false,
    preferCanvas: true,
  });

  darkTiles = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    subdomains: 'abcd',
  }).addTo(map);

  labelTiles = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    subdomains: 'abcd',
    pane: 'overlayPane',
  }).addTo(map);

  lightTiles = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    subdomains: 'abcd',
  });

  L.control.zoom({ position: 'bottomright' }).addTo(map);
}

function createMarkers() {
  PLACES.forEach((place) => {
    const marker = L.marker([place.lat, place.lng], { icon: mkIcon(place.cat, false) })
      .on('click', () => setActivePlace(place.id, { fly: true, openPopup: true }))
      .bindPopup(createPopupHtml(place), { maxWidth: 280, offset: [0, -5] });
    markers.set(place.id, marker);
    marker.addTo(map);
  });
}

function createPopupHtml(place) {
  const rating = place.r ? `<div class="popup-rating">⭐ ${place.r} <span>(${place.rc})</span></div>` : '';
  const link = place.gid
    ? `<a class="popup-link" href="https://www.google.com/maps/place/?q=place_id:${place.gid}" target="_blank" rel="noopener">Open in Google Maps</a>`
    : '';
  return `<div class="popup-body"><div class="popup-title">${place.name}</div><div class="popup-meta">${place.addr}</div>${rating}<div class="popup-meta">⏰ ${place.h}</div>${link}</div>`;
}

function filterPlaces() {
  const term = state.searchTerm.trim().toLowerCase();
  return PLACES.filter((place) => {
    const matchesCategory = state.currentCategory === 'all' || place.cat === state.currentCategory;
    const matchesSearch =
      !term ||
      place.name.toLowerCase().includes(term) ||
      place.addr.toLowerCase().includes(term) ||
      (place.tip || '').toLowerCase().includes(term);
    return matchesCategory && matchesSearch;
  });
}

function updateCount(count) {
  elements.count.textContent = count;
}

function updateChips() {
  elements.chips.forEach((chip) => {
    chip.classList.toggle('active', chip.dataset.filter === state.currentCategory);
  });
}

function renderList() {
  const visiblePlaces = filterPlaces();
  elements.list.innerHTML = '';

  if (!visiblePlaces.length) {
    elements.noResults.style.display = 'block';
    updateCount(0);
    hideAllMarkers();
    return;
  }

  elements.noResults.style.display = 'none';
  updateCount(visiblePlaces.length);

  visiblePlaces.forEach((place) => {
    const card = document.createElement('article');
    card.className = 'place-card';
    card.id = `place-${place.id}`;
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-pressed', String(state.activeId === place.id));
    card.innerHTML = `
      <div class="place-card-top">
        <h3>${place.name}</h3>
        <span class="badge" style="background:${CATEGORIES[place.cat].color}20;color:${CATEGORIES[place.cat].color};border-color:rgba(255,255,255,.15);">${CATEGORIES[place.cat].emoji} ${CATEGORIES[place.cat].label}</span>
      </div>
      <div class="meta">${place.addr}</div>
      <div class="meta">⏰ ${place.h}</div>
      <p class="tip">${place.tip || ''}</p>
      <div class="link-row">
        <div class="meta">${place.r ? `⭐ ${place.r} (${place.rc})` : 'Local favorite'}</div>
        ${place.gid ? `<a href="https://www.google.com/maps/place/?q=place_id:${place.gid}" target="_blank" rel="noopener">View map</a>` : ''}
      </div>
    `;
    card.addEventListener('click', () => setActivePlace(place.id, { fly: true, openPopup: true }));
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        card.click();
      }
    });
    elements.list.appendChild(card);
  });

  updateMarkers();
}

function hideAllMarkers() {
  markers.forEach((marker) => {
    if (map.hasLayer(marker)) map.removeLayer(marker);
  });
}

function updateMarkers() {
  const visibleIds = new Set(filterPlaces().map((place) => place.id));
  markers.forEach((marker, id) => {
    const place = PLACES.find((item) => item.id === id);
    if (!place) return;
    const shouldDisplay = visibleIds.has(id);
    if (shouldDisplay && !map.hasLayer(marker)) {
      marker.addTo(map);
    } else if (!shouldDisplay && map.hasLayer(marker)) {
      map.removeLayer(marker);
    }
    marker.setIcon(mkIcon(place.cat, state.activeId === id));
  });
}

function setActivePlace(id, { fly = true, openPopup = false } = {}) {
  if (state.activeId === id) {
    if (openPopup) {
      const marker = markers.get(id);
      marker?.openPopup();
    }
    return;
  }

  state.activeId = id;
  document.querySelectorAll('.place-card').forEach((card) => {
    card.classList.toggle('active', card.id === `place-${id}`);
  });

  markers.forEach((marker, markerId) => {
    const place = PLACES.find((item) => item.id === markerId);
    if (!place) return;
    marker.setIcon(mkIcon(place.cat, markerId === id));
  });

  const selected = PLACES.find((place) => place.id === id);
  if (!selected) return;

  if (fly) {
    map.flyTo([selected.lat, selected.lng], 16, { duration: 0.85, easeLinearity: 0.4 });
  }

  const marker = markers.get(id);
  if (openPopup && marker) {
    setTimeout(() => marker.openPopup(), 400);
  }
}

function updateFilters(category) {
  state.currentCategory = category;
  state.searchTerm = category === 'all' ? state.searchTerm : state.searchTerm;
  updateChips();
  renderList();
  saveSettings();
}

function clearFilters() {
  state.currentCategory = 'all';
  state.searchTerm = '';
  elements.search.value = '';
  updateChips();
  renderList();
  saveSettings();
}

function handleSearch(event) {
  state.searchTerm = event.target.value;
  renderList();
  saveSettings();
}

let dragState = {
  active: false,
  startY: 0,
  offsetY: 0,
  closedOffset: 0,
  startOpen: true,
};

function updateSheetButton() {
  const isClosed = elements.panel.classList.contains('closed');
  elements.sheetButton.textContent = isClosed ? 'Show list' : 'Hide list';
  elements.sheetButton.setAttribute('aria-expanded', String(!isClosed));
}

function toggleSheet() {
  elements.panel.classList.toggle('closed');
  updateSheetButton();
}

function setPanelTransform(value) {
  elements.panel.style.transition = 'none';
  elements.panel.style.transform = `translateY(${value}px)`;
}

function resetPanelTransform() {
  elements.panel.style.transition = '';
  elements.panel.style.transform = '';
}

function onSheetPointerDown(event) {
  if (window.innerWidth > 820) return;
  dragState.active = true;
  dragState.startY = event.clientY;
  dragState.startOpen = !elements.panel.classList.contains('closed');
  const rect = elements.panel.getBoundingClientRect();
  dragState.closedOffset = rect.height - 72;
  elements.sheetHandle.setPointerCapture(event.pointerId);
}

function onSheetPointerMove(event) {
  if (!dragState.active) return;
  const dy = event.clientY - dragState.startY;
  const base = dragState.startOpen ? 0 : dragState.closedOffset;
  let translateY = base + dy;
  translateY = Math.max(0, Math.min(dragState.closedOffset, translateY));
  setPanelTransform(translateY);
}

function onSheetPointerUp() {
  if (!dragState.active) return;
  dragState.active = false;
  const translateY = parseFloat(elements.panel.style.transform.replace('translateY(', '') || '0');
  const threshold = dragState.closedOffset * 0.35;
  const shouldClose = dragState.startOpen ? translateY > threshold : translateY > dragState.closedOffset - threshold;
  elements.panel.classList.toggle('closed', shouldClose);
  resetPanelTransform();
  updateSheetButton();
}

function locateMe() {
  if (!navigator.geolocation) {
    alert('Geolocation is not available in this browser.');
    return;
  }

  elements.locate.disabled = true;
  elements.locate.textContent = '⌛ Locating...';

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude, accuracy } = position.coords;
      if (locMarker) {
        map.removeLayer(locMarker);
        map.removeLayer(locCircle);
      }
      locCircle = L.circle([latitude, longitude], {
        radius: accuracy,
        color: '#4D8FC4',
        fillColor: '#4D8FC4',
        fillOpacity: 0.15,
        weight: 2,
        dashArray: '4 4',
      }).addTo(map);
      locMarker = L.circleMarker([latitude, longitude], {
        radius: 8,
        color: '#fff',
        weight: 2.5,
        fillColor: '#4D8FC4',
        fillOpacity: 1,
      })
        .addTo(map)
        .bindPopup('<div style="font-weight:600">📍 You are here</div>');

      map.flyTo([latitude, longitude], 15, { duration: 0.8 });
      elements.locate.textContent = '📍 Locate';
      elements.locate.disabled = false;
    },
    () => {
      elements.locate.textContent = '📍 Locate';
      elements.locate.disabled = false;
      alert('Unable to find your location. Please allow location access.');
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

function attachEvents() {
  elements.search.addEventListener('input', handleSearch);
  elements.clear.addEventListener('click', clearFilters);
  elements.theme.addEventListener('click', () => setTheme(state.theme === 'light' ? 'dark' : 'light'));
  elements.locate.addEventListener('click', locateMe);
  elements.sheetButton?.addEventListener('click', toggleSheet);
  elements.sheetHandle?.addEventListener('pointerdown', onSheetPointerDown);
  elements.sheetHandle?.addEventListener('pointermove', onSheetPointerMove);
  elements.sheetHandle?.addEventListener('pointerup', onSheetPointerUp);
  elements.sheetHandle?.addEventListener('pointercancel', onSheetPointerUp);
  elements.chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      updateFilters(chip.dataset.filter);
      if (elements.sheetButton) {
        elements.panel.classList.remove('closed');
        updateSheetButton();
      }
    });
  });
}

function init() {
  loadSettings();
  buildMap();
  setTheme(state.theme);
  elements.search.value = state.searchTerm;
  createMarkers();
  attachEvents();
  updateChips();
  renderList();
  if (elements.sheetButton) updateSheetButton();
}

document.addEventListener('DOMContentLoaded', init);
