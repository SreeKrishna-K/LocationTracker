// Adaptive tracking configuration
export const ADAPTIVE_TRACKING_ENABLED = true;

// Legacy fixed tracking settings (used when ADAPTIVE_TRACKING_ENABLED = false)
export const BG_TASK = 'LOCATION_TRACKING_TASK';
export const ACCURACY = 'Balanced';
export const FG_TIME_INTERVAL_MS = 5000;
export const FG_DISTANCE_INTERVAL_M = 10;
export const BG_ACCURACY = 'Balanced';
export const BG_TIME_INTERVAL_MS = 5000;
export const BG_DISTANCE_INTERVAL_M = 10;
export const MIN_MOVE_TO_SAVE_M = 50;
export const INITIAL_ZOOM = 15;
export const TILE_URLS = [
  'https://a.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png',
  'https://b.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png',
  'https://c.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png',
];
export const TILE_SIZE = 256;
export const CACHE_SIZE_BYTES = 300 * 1024 * 1024;
export const TRIP_GAP_MS = 10 * 60 * 1000;
export const TRIP_MIN_POINTS = 2;
export const FG_SERVICE_TITLE = 'Location Tracking';
export const FG_SERVICE_BODY = 'Tracking location in background';
export const RENDER_WORLD_COPIES = false;
export const AUTO_BG_ON_START = true;
export const BG_WATCHDOG_ENABLED = true;
export const BG_WATCHDOG_TASK = 'LOCATION_WATCHDOG_TASK';
export const BACKGROUND_FETCH_INTERVAL_SEC = 15 * 60; // 15 minutes (Android minimum)

// Adaptive sampling thresholds
export const ADAPTIVE_THRESHOLDS = {
  IDLE: {
    speedRange: [0, 0.5], // 0-0.5 m/s (< 1.8 km/h)
    timeInterval: 120000, // 120 seconds
    distanceThreshold: 25, // 25 meters
  },
  WALKING: {
    speedRange: [0.5, 3.0], // 0.5-3 m/s (1.8-10.8 km/h)
    timeInterval: 20000, // 20 seconds
    distanceThreshold: 15, // 15 meters
  },
  VEHICLE: {
    speedRange: [3.0, Infinity], // >3 m/s (>10.8 km/h)
    timeInterval: 5000, // 5 seconds
    distanceThreshold: 10, // 10 meters
  },
  ACCURACY_GOOD: 30, // meters - good accuracy threshold
  ACCURACY_MAX: 100, // meters - reject if worse than this
  SPEED_SMOOTHING: 0.3, // exponential smoothing alpha
  STATE_TRANSITION_SAMPLES: 3, // samples needed for state change
  BUFFER_SIZE: 10, // points before batch write
  BUFFER_TIMEOUT: 60000, // max time before flush (ms)
  COMPRESSION_THRESHOLD: 5, // meters for collinear point removal
};
