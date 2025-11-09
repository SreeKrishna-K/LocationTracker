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
