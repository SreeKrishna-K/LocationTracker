import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import { database } from '../db/database';
import { distMeters } from './geo';
import {
  BG_TASK,
  BG_WATCHDOG_TASK,
  BG_ACCURACY,
  BG_TIME_INTERVAL_MS,
  BG_DISTANCE_INTERVAL_M,
  MIN_MOVE_TO_SAVE_M,
  FG_SERVICE_TITLE,
  FG_SERVICE_BODY,
  BACKGROUND_FETCH_INTERVAL_SEC,
} from '../config/constants';

let bgLastSaved = null;

// Define the background location task
export const defineBackgroundTask = () => {
  try {
    TaskManager.defineTask(BG_TASK, async ({ data, error }) => {
      if (error) {
        console.log('Background task error:', error);
        return;
      }

      const { locations } = data || {};
      if (!locations || locations.length === 0) {
        console.log('No locations received in background');
        return;
      }

      const location = locations[0];
      const point = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        timestamp: Date.now(),
        synced: false,
      };

      // Save first location or if moved enough
      if (!bgLastSaved) {
        bgLastSaved = point;
        await saveLocationToDatabase(point);
        console.log('BG saved (first):', point);
      } else {
        const distance = distMeters(bgLastSaved, point);
        if (distance > MIN_MOVE_TO_SAVE_M) {
          bgLastSaved = point;
          await saveLocationToDatabase(point);
          console.log(`BG saved (>${MIN_MOVE_TO_SAVE_M}m: ${Math.round(distance)}m)`);
        } else {
          console.log(`BG skipped (${Math.round(distance)}m < ${MIN_MOVE_TO_SAVE_M}m)`);
        }
      }
    });
  } catch (e) {
    console.log('defineTask error (may be already defined):', e.message);
  }
};

// Define watchdog task to restart location tracking if it stops
export const defineWatchdogTask = () => {
  try {
    TaskManager.defineTask(BG_WATCHDOG_TASK, async ({ data, error }) => {
      if (error) {
        console.log('Watchdog task error:', error);
        return BackgroundFetch.BackgroundFetchResult.Failed;
      }

      try {
        // Check if location updates are running
        const isStarted = await Location.hasStartedLocationUpdatesAsync(BG_TASK);
        if (isStarted) {
          console.log('Background location is already running');
          return BackgroundFetch.BackgroundFetchResult.NoData;
        }

        // Check permissions
        const { status } = await Location.getBackgroundPermissionsAsync();
        if (status !== 'granted') {
          console.log('Background permission not granted');
          return BackgroundFetch.BackgroundFetchResult.NoData;
        }

        // Restart location tracking
        console.log('Restarting background location tracking...');
        await startBackgroundLocationTracking();
        return BackgroundFetch.BackgroundFetchResult.NewData;
      } catch (e) {
        console.log('Watchdog restart error:', e);
        return BackgroundFetch.BackgroundFetchResult.Failed;
      }
    });
  } catch (e) {
    console.log('defineWatchdogTask error:', e.message);
  }
};

// Start background location tracking
export const startBackgroundLocationTracking = async () => {
  try {
    // First check if already running
    const isStarted = await Location.hasStartedLocationUpdatesAsync(BG_TASK);
    if (isStarted) {
      console.log('Background location already running');
      return true;
    }

    // Request permissions if needed
    const { status } = await Location.requestBackgroundPermissionsAsync();
    if (status !== 'granted') {
      console.log('Background permission denied');
      return false;
    }

    // Start location updates with Android foreground service
    await Location.startLocationUpdatesAsync(BG_TASK, {
      accuracy: Location.Accuracy[BG_ACCURACY],
      timeInterval: BG_TIME_INTERVAL_MS,
      distanceInterval: BG_DISTANCE_INTERVAL_M,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      deferredUpdatesInterval: 0,
      deferredUpdatesDistance: 0,
      activityType: Location.ActivityType.Other,
      foregroundService: {
        notificationTitle: FG_SERVICE_TITLE,
        notificationBody: FG_SERVICE_BODY,
        notificationColor: '#6366f1',
        killServiceOnDestroy: false,
      },
    });

    console.log('Background location tracking started');
    return true;
  } catch (e) {
    console.error('Failed to start background location:', e);
    return false;
  }
};

// Stop background location tracking
export const stopBackgroundLocationTracking = async () => {
  try {
    const isStarted = await Location.hasStartedLocationUpdatesAsync(BG_TASK);
    if (isStarted) {
      await Location.stopLocationUpdatesAsync(BG_TASK);
      console.log('Background location tracking stopped');
    }
    return true;
  } catch (e) {
    console.error('Failed to stop background location:', e);
    return false;
  }
};

// Register watchdog task
export const registerWatchdogTask = async () => {
  try {
    // Check if background fetch is available
    const status = await BackgroundFetch.getStatusAsync();
    if (status !== BackgroundFetch.BackgroundFetchStatus.Available) {
      console.log('BackgroundFetch not available:', status);
      return false;
    }

    // Check if already registered
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BG_WATCHDOG_TASK);
    if (isRegistered) {
      console.log('Watchdog already registered');
      return true;
    }

    // Register the watchdog task
    await BackgroundFetch.registerTaskAsync(BG_WATCHDOG_TASK, {
      minimumInterval: BACKGROUND_FETCH_INTERVAL_SEC,
      stopOnTerminate: false,
      startOnBoot: true,
    });

    console.log('Watchdog task registered');
    return true;
  } catch (e) {
    console.error('Failed to register watchdog:', e);
    return false;
  }
};

// Check background location status
export const checkBackgroundLocationStatus = async () => {
  try {
    const isStarted = await Location.hasStartedLocationUpdatesAsync(BG_TASK);
    const { status } = await Location.getBackgroundPermissionsAsync();
    const isWatchdogRegistered = await TaskManager.isTaskRegisteredAsync(BG_WATCHDOG_TASK);
    
    return {
      isTracking: isStarted,
      hasPermission: status === 'granted',
      watchdogActive: isWatchdogRegistered,
    };
  } catch (e) {
    console.error('Failed to check status:', e);
    return {
      isTracking: false,
      hasPermission: false,
      watchdogActive: false,
    };
  }
};

// Save location to database
const saveLocationToDatabase = async (point) => {
  try {
    await database.write(async () => {
      await database.get('locations').create((record) => {
        record.latitude = point.latitude;
        record.longitude = point.longitude;
        record.timestamp = point.timestamp;
        record.synced = false;
      });
    });
    return true;
  } catch (e) {
    console.error('Failed to save location to DB:', e);
    return false;
  }
};

// Initialize all background tasks
export const initializeBackgroundTasks = async () => {
  console.log('Initializing background tasks...');
  
  // Define tasks
  defineBackgroundTask();
  defineWatchdogTask();
  
  // Register watchdog
  await registerWatchdogTask();
  
  // Start background location if configured
  const { default: constants } = await import('../config/constants');
  if (constants.AUTO_BG_ON_START) {
    await startBackgroundLocationTracking();
  }
  
  const status = await checkBackgroundLocationStatus();
  console.log('Background task status:', status);
  
  return status;
};
