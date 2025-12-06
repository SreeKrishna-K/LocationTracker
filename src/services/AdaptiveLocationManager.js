import * as Location from 'expo-location';
import { distMeters } from '../utils/geo';

// Movement states
export const MovementState = {
  IDLE: 'IDLE',
  WALKING: 'WALKING',
  VEHICLE: 'VEHICLE',
};

// Adaptive sampling configuration per state
const StateConfig = {
  IDLE: {
    timeInterval: 120000, // 120s
    distanceThreshold: 25, // 25m minimum movement
    accuracy: Location.Accuracy.Balanced,
    speedRange: [0, 0.5], // 0-0.5 m/s (< 1.8 km/h)
  },
  WALKING: {
    timeInterval: 20000, // 20s
    distanceThreshold: 15, // 15m minimum movement
    accuracy: Location.Accuracy.High,
    speedRange: [0.5, 3.0], // 0.5-3 m/s (1.8-10.8 km/h)
  },
  VEHICLE: {
    timeInterval: 5000, // 5s
    distanceThreshold: 10, // 10m minimum movement
    accuracy: Location.Accuracy.BestForNavigation,
    speedRange: [3.0, Infinity], // >3 m/s (>10.8 km/h)
  },
};

// Accuracy thresholds
const ACCURACY_THRESHOLD_GOOD = 30; // meters
const ACCURACY_THRESHOLD_MAX = 100; // meters - reject if worse than this

// State transition smoothing
const STATE_TRANSITION_SAMPLES = 3; // Need N consistent samples to change state
const SPEED_SMOOTHING_ALPHA = 0.3; // Exponential smoothing factor

class AdaptiveLocationManager {
  constructor() {
    this.currentState = MovementState.IDLE;
    this.lastLocation = null;
    this.lastSavedLocation = null;
    this.speedHistory = [];
    this.smoothedSpeed = 0;
    this.stateTransitionBuffer = [];
    this.locationBuffer = [];
    this.bufferFlushInterval = null;
    this.lastFlushTime = Date.now();
  }

  // Determine movement state based on speed
  determineMovementState(speed) {
    if (speed < StateConfig.IDLE.speedRange[1]) {
      return MovementState.IDLE;
    } else if (speed < StateConfig.WALKING.speedRange[1]) {
      return MovementState.WALKING;
    } else {
      return MovementState.VEHICLE;
    }
  }

  // Apply exponential smoothing to speed
  smoothSpeed(newSpeed) {
    if (this.smoothedSpeed === 0) {
      this.smoothedSpeed = newSpeed;
    } else {
      this.smoothedSpeed = SPEED_SMOOTHING_ALPHA * newSpeed + (1 - SPEED_SMOOTHING_ALPHA) * this.smoothedSpeed;
    }
    return this.smoothedSpeed;
  }

  // Handle state transitions with hysteresis
  updateState(proposedState) {
    if (proposedState === this.currentState) {
      // Clear buffer if state is stable
      this.stateTransitionBuffer = [];
      return this.currentState;
    }

    // Add to transition buffer
    this.stateTransitionBuffer.push(proposedState);

    // Check if we have enough consistent samples
    if (this.stateTransitionBuffer.length >= STATE_TRANSITION_SAMPLES) {
      const allSame = this.stateTransitionBuffer.every(state => state === proposedState);
      if (allSame) {
        // Transition to new state
        console.log(`State transition: ${this.currentState} -> ${proposedState}`);
        this.currentState = proposedState;
        this.stateTransitionBuffer = [];
      } else {
        // Remove oldest sample
        this.stateTransitionBuffer.shift();
      }
    }

    return this.currentState;
  }

  // Calculate speed from location updates
  calculateSpeed(location) {
    if (!this.lastLocation) {
      // If we have native speed, use it
      return location.coords.speed || 0;
    }

    const timeDelta = (location.timestamp - this.lastLocation.timestamp) / 1000; // seconds
    if (timeDelta <= 0) {
      return this.smoothedSpeed;
    }

    const distance = distMeters(
      { latitude: this.lastLocation.coords.latitude, longitude: this.lastLocation.coords.longitude },
      { latitude: location.coords.latitude, longitude: location.coords.longitude }
    );

    const calculatedSpeed = distance / timeDelta;
    
    // Use native speed if available and reasonable, otherwise use calculated
    const speed = (location.coords.speed !== null && location.coords.speed >= 0) 
      ? location.coords.speed 
      : calculatedSpeed;

    return this.smoothSpeed(speed);
  }

  // Check if location should be saved based on adaptive criteria
  shouldSaveLocation(location, force = false) {
    // Always reject if accuracy is too poor
    if (location.coords.accuracy > ACCURACY_THRESHOLD_MAX) {
      console.log(`Location rejected: accuracy ${location.coords.accuracy}m > ${ACCURACY_THRESHOLD_MAX}m`);
      return false;
    }

    // Always save first location
    if (!this.lastSavedLocation) {
      return true;
    }

    // Force save if requested (e.g., on state change)
    if (force) {
      return true;
    }

    const config = StateConfig[this.currentState];
    const timeSinceLastSave = Date.now() - this.lastSavedLocation.timestamp;
    const distanceFromLastSave = distMeters(
      { latitude: this.lastSavedLocation.latitude, longitude: this.lastSavedLocation.longitude },
      { latitude: location.coords.latitude, longitude: location.coords.longitude }
    );

    // Adjust thresholds based on accuracy
    let adjustedDistanceThreshold = config.distanceThreshold;
    let adjustedTimeInterval = config.timeInterval;
    
    if (location.coords.accuracy > ACCURACY_THRESHOLD_GOOD) {
      // Poor accuracy - increase thresholds
      const accuracyFactor = location.coords.accuracy / ACCURACY_THRESHOLD_GOOD;
      adjustedDistanceThreshold *= accuracyFactor;
      adjustedTimeInterval *= Math.min(accuracyFactor, 2); // Cap time adjustment
    }

    // Save if either time or distance threshold exceeded
    const timeExceeded = timeSinceLastSave >= adjustedTimeInterval;
    const distanceExceeded = distanceFromLastSave >= adjustedDistanceThreshold;

    if (timeExceeded || distanceExceeded) {
      console.log(
        `Save location: state=${this.currentState}, time=${Math.round(timeSinceLastSave / 1000)}s, ` +
        `distance=${Math.round(distanceFromLastSave)}m, accuracy=${Math.round(location.coords.accuracy)}m`
      );
      return true;
    }

    return false;
  }

  // Process incoming location update
  async processLocation(location) {
    // Calculate speed and determine state
    const speed = this.calculateSpeed(location);
    const proposedState = this.determineMovementState(speed);
    const previousState = this.currentState;
    const newState = this.updateState(proposedState);

    // Check if we should save this location
    const stateChanged = previousState !== newState;
    const shouldSave = this.shouldSaveLocation(location, stateChanged);

    if (shouldSave) {
      const locationData = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        timestamp: location.timestamp || Date.now(),
        speed: speed,
        accuracy: location.coords.accuracy,
        altitude: location.coords.altitude,
        heading: location.coords.heading,
        activity_type: this.currentState,
      };

      // Add to buffer
      this.locationBuffer.push(locationData);
      this.lastSavedLocation = locationData;

      // Check if we should flush buffer
      if (this.shouldFlushBuffer()) {
        await this.flushBuffer();
      }
    }

    // Update last location
    this.lastLocation = location;

    return {
      state: this.currentState,
      speed: speed,
      saved: shouldSave,
    };
  }

  // Check if buffer should be flushed
  shouldFlushBuffer() {
    const BUFFER_SIZE_THRESHOLD = 10; // Flush every 10 points
    const BUFFER_TIME_THRESHOLD = 60000; // Flush every minute
    
    const timeSinceFlush = Date.now() - this.lastFlushTime;
    
    return (
      this.locationBuffer.length >= BUFFER_SIZE_THRESHOLD ||
      (this.locationBuffer.length > 0 && timeSinceFlush >= BUFFER_TIME_THRESHOLD)
    );
  }

  // Flush location buffer (to be implemented by consumer)
  async flushBuffer() {
    if (this.locationBuffer.length === 0) return [];

    // Compress points using simplified Douglas-Peucker algorithm
    const compressed = this.compressPoints(this.locationBuffer);
    
    // Return compressed points and clear buffer
    const points = [...compressed];
    this.locationBuffer = [];
    this.lastFlushTime = Date.now();
    
    console.log(`Flushing ${points.length} locations (compressed from ${this.locationBuffer.length})`);
    return points;
  }

  // Simple point compression - remove redundant collinear points
  compressPoints(points) {
    if (points.length <= 2) return points;

    const compressed = [points[0]]; // Always keep first point
    
    for (let i = 1; i < points.length - 1; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const next = points[i + 1];
      
      // Calculate perpendicular distance from curr to line between prev and next
      const dist = this.perpendicularDistance(prev, curr, next);
      
      // Keep point if distance is significant or if state changed
      const COLLINEAR_THRESHOLD = 5; // meters
      const stateChanged = curr.activity_type !== prev.activity_type;
      
      if (dist > COLLINEAR_THRESHOLD || stateChanged) {
        compressed.push(curr);
      }
    }
    
    compressed.push(points[points.length - 1]); // Always keep last point
    return compressed;
  }

  // Calculate perpendicular distance from point to line
  perpendicularDistance(lineStart, point, lineEnd) {
    const A = point.longitude - lineStart.longitude;
    const B = point.latitude - lineStart.latitude;
    const C = lineEnd.longitude - lineStart.longitude;
    const D = lineEnd.latitude - lineStart.latitude;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    
    if (lenSq === 0) return distMeters(lineStart, point);
    
    let param = dot / lenSq;

    let xx, yy;

    if (param < 0) {
      xx = lineStart.longitude;
      yy = lineStart.latitude;
    } else if (param > 1) {
      xx = lineEnd.longitude;
      yy = lineEnd.latitude;
    } else {
      xx = lineStart.longitude + param * C;
      yy = lineStart.latitude + param * D;
    }

    return distMeters(point, { latitude: yy, longitude: xx });
  }

  // Get current configuration
  getCurrentConfig() {
    return StateConfig[this.currentState];
  }

  // Get adaptive update interval (for dynamic scheduling)
  getAdaptiveInterval() {
    const baseConfig = StateConfig[this.currentState];
    let interval = baseConfig.timeInterval;

    // Further adjust based on current speed
    if (this.currentState === MovementState.VEHICLE && this.smoothedSpeed > 20) {
      // Highway speeds - more frequent updates
      interval = Math.max(2000, interval / 2);
    } else if (this.currentState === MovementState.IDLE && this.smoothedSpeed < 0.1) {
      // Really stationary - less frequent updates
      interval = Math.min(300000, interval * 2);
    }

    return interval;
  }

  // Reset manager state
  reset() {
    this.currentState = MovementState.IDLE;
    this.lastLocation = null;
    this.lastSavedLocation = null;
    this.speedHistory = [];
    this.smoothedSpeed = 0;
    this.stateTransitionBuffer = [];
    this.locationBuffer = [];
    this.lastFlushTime = Date.now();
  }
}

// Singleton instance
export default new AdaptiveLocationManager();
