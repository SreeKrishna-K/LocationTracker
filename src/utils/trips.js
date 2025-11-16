import { distMeters } from './geo';

export const segmentTrips = (points, gapMs = 10 * 60 * 1000, minPoints = 2) => {
  if (!points || points.length === 0) return [];
  const trips = [];
  let cur = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (cur.length === 0) {
      cur.push(p);
      continue;
    }
    const prev = cur[cur.length - 1];
    if ((p.timestamp - prev.timestamp) >= gapMs) {
      if (cur.length >= minPoints) trips.push(buildTrip(cur));
      cur = [p];
    } else {
      cur.push(p);
    }
  }
  if (cur.length >= minPoints) trips.push(buildTrip(cur));
  return trips;
};

const buildTrip = (arr) => {
  const start = arr[0];
  const end = arr[arr.length - 1];
  let distance = 0;
  for (let i = 1; i < arr.length; i++) {
    distance += distMeters(arr[i - 1], arr[i]);
  }
  return {
    start,
    end,
    startTime: start.timestamp,
    endTime: end.timestamp,
    durationMs: end.timestamp - start.timestamp,
    distanceMeters: distance,
    points: arr,  // Include all points for visualization
  };
};
