/**
 * Global variables and state
 */
let map, marker, routeControl;
let watchId = null;
let currentMode = "today";
let currentSpeed = 200;
let animationInterval = null;
let currentRoute = null;
let currentIndex = 0;
let isAnimating = false;
let currentLatLng = null;

/**
 * Constants
 */
const DEFAULT_CENTER = [18.5204, 73.8567];
const DEFAULT_ZOOM = 15;
const MAP_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const MAP_ATTRIBUTION = "&copy; OpenStreetMap contributors";
const BUS_ICON_URL = "./school-bus.png";
const BUS_ICON_SIZE = [50, 50];
const BUS_ICON_ANCHOR = [25, 25];
const BUS_POPUP_ANCHOR = [0, -25];
const YESTERDAY_DATA_URL = "./dummy-route-data.json";
const THIS_WEEK_DATA_URL = "./this-week-route-data.json";

// DOM Elements (Cached)
let statusDot, statusText, speedValueDisplay, modeSelect, speedSlider, searchInput;

/**
 * Caches frequently used DOM elements.
 */
function cacheDOMElements() {
  statusDot = document.getElementById('statusDot');
  statusText = document.getElementById('statusText');
  speedValueDisplay = document.getElementById('speedValue');
  modeSelect = document.getElementById('mode');
  speedSlider = document.getElementById('speed');
  searchInput = document.getElementById('search');
}

/**
 * Updates the status indicator in the UI.
 * @param {string} status - The status type ('active', 'paused', or empty for 'Ready').
 * @param {string} text - The text to display.
 */
function updateStatus(status, text) {
  if (!statusDot || !statusText) return; // Ensure elements are cached
  
  statusDot.className = 'status-dot'; // Reset classes
  if (status === 'active') {
    statusDot.classList.add('active');
  } else if (status === 'paused') {
    statusDot.classList.add('paused');
  }
  
  statusText.textContent = text;
}

/**
 * Formats the HTML content for the vehicle status popup.
 * @returns {string} HTML string for the popup content.
 */
function formatPopupContent() {
  const now = new Date();
  const lat = currentLatLng ? currentLatLng.lat.toFixed(4) : 'N/A';
  const lng = currentLatLng ? currentLatLng.lng.toFixed(4) : 'N/A';
  // Simple speed estimation based on animation interval
  const speed = isAnimating ? (3600000 / (currentSpeed * 10)).toFixed(1) : '0.0'; // More realistic estimation

  return `
    <div class="vehicle-popup">
      <h3><i class="fas fa-bus"></i> Vehicle Status</h3>
      <p><strong>Date:</strong> ${now.toLocaleDateString()}</p>
      <p><strong>Time:</strong> ${now.toLocaleTimeString()}</p>
      <p><strong>Position:</strong> ${lat}, ${lng}</p>
      <p><strong>Speed:</strong> ${speed} km/h (approx)</p>
      <p><strong>Status:</strong> ${isAnimating ? 'Moving' : 'Stopped'}</p>
    </div>
  `;
}

/**
 * Updates the marker's popup content if it is currently open.
 */
function updatePopupIfOpen() {
  if (marker && marker.isPopupOpen()) {
    marker.setPopupContent(formatPopupContent());
  }
}

/**
 * Starts the route animation.
 */
function startAnimation() {
  if (!currentRoute || isAnimating) return;
  
  isAnimating = true;
  updateStatus('active', 'Animating');
  
  // Clear existing interval just in case
  if (animationInterval) clearInterval(animationInterval);

  animationInterval = setInterval(() => {
    if (currentIndex >= currentRoute.length) {
      stopAnimation(); // Reached end of route
      updateStatus('', 'Finished'); // Indicate completion
      return;
    }

    const coord = currentRoute[currentIndex];
    currentLatLng = L.latLng(coord.lat, coord.lng);
    const nextCoord = currentRoute[currentIndex + 1];
    
    // Update marker position and rotation
    marker.setLatLng(currentLatLng);
    if (nextCoord) {
      const angle = calculateAngle(coord, nextCoord);
      if (marker.setRotationAngle) {
        marker.setRotationAngle(angle);
      }
    }

    map.setView(currentLatLng, map.getZoom()); // Follow marker
    updatePopupIfOpen();

    currentIndex++;
  }, currentSpeed);
}

/**
 * Stops the route animation.
 */
function stopAnimation() {
  if (animationInterval) {
    clearInterval(animationInterval);
    animationInterval = null;
  }
  if (isAnimating) { // Only update status if it was actually animating
    isAnimating = false;
    updateStatus('paused', 'Paused');
    updatePopupIfOpen();
  }
}

/**
 * Resets the animation state and marker position.
 */
function resetAnimation() {
  stopAnimation();
  currentIndex = 0;
  isAnimating = false; // Ensure this is reset
  if (currentRoute && currentRoute.length > 0) {
    const startCoord = currentRoute[0];
    currentLatLng = L.latLng(startCoord.lat, startCoord.lng);
    marker.setLatLng(currentLatLng);
    map.setView(currentLatLng, map.getZoom()); // Move view to start
  } else if (marker) {
    // If no route, reset to marker's initial/current known position
    currentLatLng = marker.getLatLng();
    map.setView(currentLatLng, map.getZoom());
  }
  updateStatus('', 'Ready');
  updatePopupIfOpen();
}

/**
 * Initializes the Leaflet map and marker.
 */
function initMap() {
  map = L.map("map").setView(DEFAULT_CENTER, DEFAULT_ZOOM);
  L.tileLayer(MAP_TILE_URL, {
    attribution: MAP_ATTRIBUTION
  }).addTo(map);

  const busIcon = L.icon({
    iconUrl: BUS_ICON_URL,
    iconSize: BUS_ICON_SIZE,
    iconAnchor: BUS_ICON_ANCHOR,
    popupAnchor: BUS_POPUP_ANCHOR
  });

  marker = L.marker(DEFAULT_CENTER, {
    icon: busIcon,
    rotationAngle: 0,
    rotationOrigin: "center center"
  }).addTo(map);

  currentLatLng = marker.getLatLng(); // Store initial position

  // Attach popup generation to marker click
  marker.on('click', () => {
    marker.unbindPopup()
    marker.bindPopup(formatPopupContent()).openPopup();
  });

  // Try to get user's current location
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => { // Success
        const { latitude: lat, longitude: lng } = pos.coords;
        currentLatLng = L.latLng(lat, lng);
        map.setView(currentLatLng, DEFAULT_ZOOM);
        marker.setLatLng(currentLatLng);
        updatePopupIfOpen();
      },
      (err) => { // Error
        console.warn(`Geolocation error: ${err.message}`);
        // Keep default view if geolocation fails
      }
    );
  }
}

/**
 * Calculates the bearing (angle) between two geographical points.
 * @param {object} start - The starting point ({lat, lng}).
 * @param {object} end - The ending point ({lat, lng}).
 * @returns {number} The bearing in degrees (0-360), adjusted for marker orientation.
 */
function calculateAngle(start, end) {
  const lat1 = (start.lat * Math.PI) / 180;
  const lat2 = (end.lat * Math.PI) / 180;
  const dLon = ((end.lng - start.lng) * Math.PI) / 180;

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) -
            Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

  const bearing = (Math.atan2(y, x) * 180) / Math.PI;
  // Normalize to 0-360 and add 90 degrees offset for the bus icon pointing direction
  return ((bearing + 360) % 360) + 90;
}

/**
 * Clears the existing route from the map.
 */
function clearRoute() {
  if (routeControl) {
    map.removeControl(routeControl);
    routeControl = null;
  }
  currentRoute = null;
}

/**
 * Creates and displays a route on the map based on waypoints.
 * @param {L.LatLng[]} waypoints - An array of Leaflet LatLng objects.
 */
function displayRoute(waypoints) {
  clearRoute(); // Remove previous route first

  if (!waypoints || waypoints.length < 2) {
    console.warn("Not enough waypoints to display a route.");
    updateStatus('', 'Route Error');
    return;
  }

  routeControl = L.Routing.control({
    waypoints,
    routeWhileDragging: false,
    addWaypoints: false,
    draggableWaypoints: false,
    fitSelectedRoutes: true,
    show: false, // Hide the default routing panel
    lineOptions: {
      styles: [{ color: "#3388ff", opacity: 0.7, weight: 5 }]
    }
  }).addTo(map);

  routeControl.on("routesfound", function (e) {
    if (e.routes && e.routes.length > 0) {
      // Use the coordinates from the routing machine for animation
      // This often provides more points than the original waypoints
      currentRoute = e.routes[0].coordinates;
      currentIndex = 0;
      resetAnimation(); // Prepare for animation, reset marker to start
    } else {
      console.warn("No routes found by routing machine.");
      currentRoute = null;
      updateStatus('', 'No route found');
    }
  });

  routeControl.on("routingerror", function (e) {
    console.error("Routing error:", e.error);
    alert(`Error finding route: ${e.error.message}`);
    currentRoute = null;
    updateStatus('', 'Routing Error');
  });
}

/**
 * Handles clicks on the map (for setting destination in 'today' mode).
 * @param {L.LeafletMouseEvent} e - The map click event.
 */
function handleMapClick(e) {
  if (currentMode !== "today" || !marker) return;

  const startPoint = marker.getLatLng();
  const endPoint = e.latlng;
  displayRoute([startPoint, endPoint]);
}

/**
 * Handles the location search input.
 */
async function handleSearch() {
  if (!searchInput) return;
  const query = searchInput.value.trim();
  if (!query) {
    alert("Please enter a location to search.");
    return;
  }

  updateStatus('', 'Searching...'); // Indicate searching

  try {
    // Use Nominatim for geocoding
    const apiUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`;
    const res = await fetch(apiUrl);
    if (!res.ok) {
      throw new Error(`Network response was not ok (${res.status})`);
    }
    const data = await res.json();
    
    if (!data || data.length === 0) {
      alert("Location not found.");
      updateStatus('', 'Not Found');
      return;
    }

    const result = data[0];
    const lat = parseFloat(result.lat);
    const lon = parseFloat(result.lon);
    const destination = L.latLng(lat, lon);

    map.setView(destination, DEFAULT_ZOOM);

    if (marker) {
      // Display route from current marker position to searched location
      displayRoute([marker.getLatLng(), destination]);
    }
    updateStatus('', 'Route Found'); // Or Ready if no route displayed

  } catch (error) {
    console.error("Search error:", error);
    alert(`Failed to search for location: ${error.message}`);
    updateStatus('', 'Search Error');
  }
}

/**
 * Fetches historical route data from a specified JSON file.
 * @param {string} url - The URL of the JSON file to fetch.
 * @returns {Promise<L.LatLng[]> | null} A promise resolving to an array of LatLng objects, or null on error.
 */
async function fetchHistoricalData(url) {
  try {
    const response = await fetch(url); // Use the passed URL
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    
    // Convert fetched data to Leaflet LatLng objects
    if (Array.isArray(data)) {
      return data.map(point => L.latLng(point.latitude, point.longitude));
    }
    console.warn("Fetched data is not an array:", data);
    return null;

  } catch (error) {
    console.error(`Failed to fetch historical data from ${url}:`, error);
    alert(`Could not load historical route data: ${error.message}`);
    return null;
  }
}

/**
 * Handles changes in the history mode selection.
 */
async function updateMode() {
  if (!modeSelect) return;
  currentMode = modeSelect.value;

  // Stop any ongoing real-time tracking or animation
  if (watchId) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  resetAnimation(); // Reset animation state
  clearRoute();     // Clear any displayed route

  if (currentMode === "today") {
    // Enable real-time tracking if available
    if (navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const { latitude: lat, longitude: lng } = pos.coords;
          currentLatLng = L.latLng(lat, lng);
          marker.setLatLng(currentLatLng);
          updatePopupIfOpen();
        },
        (err) => {
          console.warn(`Geolocation watch error: ${err.message}`);
          if (watchId) navigator.geolocation.clearWatch(watchId);
          watchId = null;
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        }
      );
    }
    // Reset marker to current known position and view
    if(marker && currentLatLng) {
        marker.setLatLng(currentLatLng);
        map.setView(currentLatLng, map.getZoom());
    } else if (marker) {
        // Fallback if currentLatLng is somehow null
        currentLatLng = marker.getLatLng(); 
        map.setView(currentLatLng, map.getZoom());
    }
    updateStatus('', 'Tracking');

  } else {
    // Determine which data file to fetch
    const dataUrl = currentMode === "yesterday" ? YESTERDAY_DATA_URL : THIS_WEEK_DATA_URL;
    
    updateStatus('', 'Loading Route...');
    const waypoints = await fetchHistoricalData(dataUrl); // Pass the correct URL
    if (waypoints && waypoints.length > 0) {
      displayRoute(waypoints);
       updateStatus('', 'Route Loaded');
    } else {
        updateStatus('', 'Load Failed');
    }
  }
}

/**
 * Toggles the visibility of the sidebar (for mobile/tablet).
 */
function toggleSidebar() {
  const sidebar = document.querySelector('.sidebar');
  if (sidebar) {
    sidebar.classList.toggle('active');
  }
}

/**
 * Sets up all event listeners for UI elements.
 */
function setupEventListeners() {
  // Close sidebar when clicking outside on smaller screens
  document.addEventListener('click', (e) => {
    const sidebar = document.querySelector('.sidebar');
    const toggleBtn = document.querySelector('.toggle-sidebar');
    if (sidebar && toggleBtn && window.innerWidth <= 1024 &&
        sidebar.classList.contains('active') && // Only if active
        !sidebar.contains(e.target) &&
        !toggleBtn.contains(e.target)) {
      sidebar.classList.remove('active');
    }
  });

  // Map click for routing (delegated from initMap)
  if (map) {
    map.on("click", handleMapClick);
  }

  // Mode selection change
  if (modeSelect) {
    modeSelect.addEventListener("change", updateMode);
  }

  // Speed slider input
  if (speedSlider) {
    speedSlider.addEventListener("input", (e) => {
      currentSpeed = Number(e.target.value);
      if (speedValueDisplay) {
        speedValueDisplay.textContent = `${currentSpeed}ms`;
      }
      // If animating, restart animation with new speed
      if (isAnimating) {
        stopAnimation();
        startAnimation();
      }
    });
  }
  
  // Search button click (assuming button is adjacent to input)
  const searchButton = searchInput?.nextElementSibling;
  if (searchButton && searchButton.tagName === 'BUTTON') {
      searchButton.addEventListener('click', handleSearch);
  }
  // Allow searching by pressing Enter in the input field
  if (searchInput) {
      searchInput.addEventListener('keypress', (e) => {
          if (e.key === 'Enter') {
              handleSearch();
          }
      });
  }

  // Animation control buttons (assuming they exist)
  document.querySelector('.start-btn')?.addEventListener('click', startAnimation);
  document.querySelector('.stop-btn')?.addEventListener('click', stopAnimation);
  document.querySelector('.reset-btn')?.addEventListener('click', resetAnimation);
}

/**
 * Main initialization function, runs when the DOM is ready.
 */
function main() {
  cacheDOMElements();
  initMap();
  setupEventListeners();
  updateStatus('', 'Ready'); // Initial status
}

// Run main function when the DOM is fully loaded
document.addEventListener("DOMContentLoaded", main);
 
function toggleFAQ() {
  const modal = document.getElementById('faqModal');
  modal.classList.toggle('active');
}