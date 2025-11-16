import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, Modal, FlatList, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import TrackMap from './src/components/TrackMap';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import { useDatabase } from '@nozbe/watermelondb/hooks';
import { Q } from '@nozbe/watermelondb';
import { OfflineManager } from '@maplibre/maplibre-react-native';
import { database } from './src/db/database';
import { distMeters } from './src/utils/geo';
import { segmentTrips } from './src/utils/trips';
import {
  BG_TASK,
  FG_TIME_INTERVAL_MS,
  FG_DISTANCE_INTERVAL_M,
  MIN_MOVE_TO_SAVE_M,
  TILE_URLS,
  CACHE_SIZE_BYTES,
  FG_SERVICE_TITLE,
  FG_SERVICE_BODY,
  ACCURACY,
  TRIP_GAP_MS,
  TRIP_MIN_POINTS,
  BG_ACCURACY,
  BG_TIME_INTERVAL_MS,
  BG_DISTANCE_INTERVAL_M,
  AUTO_BG_ON_START,
  BG_WATCHDOG_ENABLED,
  BG_WATCHDOG_TASK,
  BACKGROUND_FETCH_INTERVAL_SEC,
} from './src/config/constants';

let bgLastSaved = null;

try {
  TaskManager.defineTask(BG_TASK, async ({ data, error }) => {
    if (error) {
      console.log('Background task error', error);
      return;
    }
    const { locations } = data || {};
    if (!locations || locations.length === 0) return;
    const l = locations[0];
    const point = {
      latitude: l.coords.latitude,
      longitude: l.coords.longitude,
      timestamp: Date.now(),
      synced: false,
    };
    if (!bgLastSaved) {
      bgLastSaved = point;
      try {
        await database.write(async () => {
          await database.get('locations').create((m) => {
            m.latitude = point.latitude;
            m.longitude = point.longitude;
            m.timestamp = point.timestamp;
            m.synced = false;
          });
        });
      } catch (e) { console.log('BG DB save error', e); }
      console.log('BG saved (first)', point);
    } else {
      const d = distMeters(bgLastSaved, point);
      if (d > MIN_MOVE_TO_SAVE_M) {
        bgLastSaved = point;
        try {
          await database.write(async () => {
            await database.get('locations').create((m) => {
              m.latitude = point.latitude;
              m.longitude = point.longitude;
              m.timestamp = point.timestamp;
              m.synced = false;
            });
          });
        } catch (e) { console.log('BG DB save error', e); }
        console.log(`BG saved (>${MIN_MOVE_TO_SAVE_M}m: ${Math.round(d)}m)`);
      } else {
        console.log(`BG skipped (${Math.round(d)}m < ${MIN_MOVE_TO_SAVE_M}m)`);
      }
    }
  });
} catch (e) {
  // defineTask can throw if registered twice in fast refresh; ignore
}

try {
  TaskManager.defineTask(BG_WATCHDOG_TASK, async ({ data, error }) => {
    if (error) {
      console.log('Watchdog task error', error);
      return BackgroundFetch.Result.Failed;
    }
    try {
      const started = await Location.hasStartedLocationUpdatesAsync(BG_TASK);
      if (started) return BackgroundFetch.Result.NoData;
      const perm = await Location.getBackgroundPermissionsAsync();
      if (perm.status === 'granted') {
        await Location.startLocationUpdatesAsync(BG_TASK, {
          accuracy: Location.Accuracy[BG_ACCURACY],
          timeInterval: BG_TIME_INTERVAL_MS,
          distanceInterval: BG_DISTANCE_INTERVAL_M,
          pausesUpdatesAutomatically: false,
          showsBackgroundLocationIndicator: true,
          foregroundService: {
            notificationTitle: FG_SERVICE_TITLE,
            notificationBody: FG_SERVICE_BODY,
          },
        });
        return BackgroundFetch.Result.NewData;
      }
      return BackgroundFetch.Result.NoData;
    } catch (e2) {
      console.log('Watchdog task start error', e2);
      return BackgroundFetch.Result.Failed;
    }
  });
} catch {}

export default function App() {
  const db = useDatabase();
  const [location, setLocation] = useState(null);
  const [region, setRegion] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [savedLocations, setSavedLocations] = useState([]);
  const [debugVisible, setDebugVisible] = useState(false);
  const [bgActive, setBgActive] = useState(false);
  const [tripsVisible, setTripsVisible] = useState(false);
  const [filterVisible, setFilterVisible] = useState(false);
  const [startInput, setStartInput] = useState('');
  const [endInput, setEndInput] = useState('');
  const [filterError, setFilterError] = useState(null);
  const [filteredLocations, setFilteredLocations] = useState([]);
  const [filterActive, setFilterActive] = useState(false);
  const lastSavedRef = useRef(null);
  const watchRef = useRef(null);
  const tileUrls = TILE_URLS;

  const displayedLocations = useMemo(() => (filterActive ? filteredLocations : savedLocations), [filterActive, filteredLocations, savedLocations]);


  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setErrorMsg('Permission to access location was denied');
        setLoading(false);
        return;
      }
      try {
        await OfflineManager.setMaximumAmbientCacheSize(CACHE_SIZE_BYTES);
      } catch (e) {
        console.log('Ambient cache size set error', e);
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy[ACCURACY] });
      const coords = {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      };
      setLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      setRegion(coords);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        if (!BG_WATCHDOG_ENABLED) return;
        const status = await BackgroundFetch.getStatusAsync();
        if (status !== BackgroundFetch.BackgroundFetchStatus.Available) {
          console.log('BackgroundFetch unavailable', status);
          return;
        }
        const registered = await TaskManager.isTaskRegisteredAsync(BG_WATCHDOG_TASK);
        if (!registered) {
          await BackgroundFetch.registerTaskAsync(BG_WATCHDOG_TASK, {
            minimumInterval: BACKGROUND_FETCH_INTERVAL_SEC,
            stopOnTerminate: false,
            startOnBoot: true,
            requiredNetworkType: BackgroundFetch.NetworkType.ANY,
          });
        }
      } catch (e) {
        console.log('Register watchdog error', e);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        if (!AUTO_BG_ON_START) return;
        const started = await Location.hasStartedLocationUpdatesAsync(BG_TASK);
        if (!started) {
          const { status } = await Location.requestBackgroundPermissionsAsync();
          if (status === 'granted') {
            await Location.startLocationUpdatesAsync(BG_TASK, {
              accuracy: Location.Accuracy[BG_ACCURACY],
              timeInterval: BG_TIME_INTERVAL_MS,
              distanceInterval: BG_DISTANCE_INTERVAL_M,
              pausesUpdatesAutomatically: false,
              showsBackgroundLocationIndicator: true,
              foregroundService: {
                notificationTitle: FG_SERVICE_TITLE,
                notificationBody: FG_SERVICE_BODY,
              },
            });
            setBgActive(true);
          }
        }
      } catch (e) {
        console.log('Auto BG start error', e);
      }
    })();
  }, []);

  useEffect(() => {
    const query = db.get('locations').query(Q.sortBy('timestamp', Q.asc));
    const sub = query.observe().subscribe((rows) => {
      const pts = rows.map((r) => ({
        latitude: r.latitude,
        longitude: r.longitude,
        timestamp: r.timestamp,
        synced: r.synced,
      }));
      setSavedLocations(pts);
      if (pts.length) lastSavedRef.current = pts[pts.length - 1];
    });
    return () => sub?.unsubscribe();
  }, [db]);

  const trips = useMemo(() => segmentTrips(savedLocations, TRIP_GAP_MS, TRIP_MIN_POINTS), [savedLocations]);

  const fmtTime = (ms) => new Date(ms).toLocaleString();
  const fmtDuration = (ms) => {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    if (h) return `${h}h ${m}m ${ss}s`;
    if (m) return `${m}m ${ss}s`;
    return `${ss}s`;
  };
  const fmtKm = (m) => `${(m / 1000).toFixed(2)} km`;

  useEffect(() => {
    (async () => {
      try {
        const started = await Location.hasStartedLocationUpdatesAsync(BG_TASK);
        setBgActive(Boolean(started));
      } catch {}
    })();
  }, []);

  useEffect(() => {
    let isMounted = true;
    const start = async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') return;
        watchRef.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy[ACCURACY],
            timeInterval: FG_TIME_INTERVAL_MS,
            distanceInterval: FG_DISTANCE_INTERVAL_M,
          },
          (loc) => {
            if (!isMounted) return;
            const point = {
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
              timestamp: Date.now(),
              synced: false,
            };
            setLocation({ latitude: point.latitude, longitude: point.longitude });
            if (!lastSavedRef.current) {
              lastSavedRef.current = point;
              setSavedLocations((prev) => {
                const next = [...prev, point];
                console.log('Saved location (first)', point);
                return next;
              });
              try {
                void db.write(async () => {
                  await db.get('locations').create((m) => {
                    m.latitude = point.latitude;
                    m.longitude = point.longitude;
                    m.timestamp = point.timestamp;
                    m.synced = false;
                  });
                });
              } catch (e) { console.log('DB save error', e); }
            } else {
              const d = distMeters(lastSavedRef.current, point);
              if (d > MIN_MOVE_TO_SAVE_M) {
                lastSavedRef.current = point;
                setSavedLocations((prev) => {
                  const next = [...prev, point];
                  console.log(`Saved location (>${MIN_MOVE_TO_SAVE_M}m: ${Math.round(d)}m). Total: ${next.length}`);
                  return next;
                });
                try {
                  void db.write(async () => {
                    await db.get('locations').create((m) => {
                      m.latitude = point.latitude;
                      m.longitude = point.longitude;
                      m.timestamp = point.timestamp;
                      m.synced = false;
                    });
                  });
                } catch (e) { console.log('DB save error', e); }
              } else {
                console.log(`Skipped update (${Math.round(d)}m < ${MIN_MOVE_TO_SAVE_M}m)`);
              }
            }
          }
        );
      } catch (e) {
        console.log('watchPosition error', e);
      }
    };
    start();
    return () => {
      isMounted = false;
      if (watchRef.current) {
        watchRef.current.remove();
        watchRef.current = null;
      }
    };
  }, []);

  const onRecenter = useCallback(() => {
    if (location) {
      setRegion((r) => ({ ...(r || {}), latitude: location.latitude, longitude: location.longitude }));
    }
  }, [location]);

  const onToggleBackground = useCallback(async () => {
    try {
      if (!bgActive) {
        const { status } = await Location.requestBackgroundPermissionsAsync();
        if (status !== 'granted') {
          console.log('Background permission not granted');
          return;
        }
        await Location.startLocationUpdatesAsync(BG_TASK, {
          accuracy: Location.Accuracy[BG_ACCURACY],
          timeInterval: BG_TIME_INTERVAL_MS,
          distanceInterval: BG_DISTANCE_INTERVAL_M,
          pausesUpdatesAutomatically: false,
          showsBackgroundLocationIndicator: true,
          foregroundService: {
            notificationTitle: FG_SERVICE_TITLE,
            notificationBody: FG_SERVICE_BODY,
          },
        });
        setBgActive(true);
      } else {
        await Location.stopLocationUpdatesAsync(BG_TASK);
        setBgActive(false);
      }
    } catch (e) {
      console.log('Background toggle error', e);
    }
  }, [bgActive]);

  const onInvalidateTiles = useCallback(async () => {
    try {
      await OfflineManager.invalidateAmbientCache();
    } catch (e) {
      console.log('Invalidate cache error', e);
    }
  }, []);

  const onClearTiles = useCallback(async () => {
    try {
      await OfflineManager.clearAmbientCache();
    } catch (e) {
      console.log('Clear cache error', e);
    }
  }, []);

  const parseDateTime = (s) => {
    if (!s || !s.trim()) return NaN;
    const direct = new Date(s);
    if (!isNaN(direct.getTime())) return direct.getTime();
    const m = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?$/);
    if (!m) return NaN;
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const d = Number(m[3]);
    const hh = Number(m[4] || '0');
    const mm = Number(m[5] || '0');
    return new Date(y, mo, d, hh, mm).getTime();
  };

  const onApplyFilter = useCallback(async () => {
    try {
      setFilterError(null);
      const s = parseDateTime(startInput);
      const e = parseDateTime(endInput);
      if (isNaN(s) || isNaN(e)) {
        setFilterError('Invalid date/time');
        return;
      }
      if (s >= e) {
        setFilterError('Start must be before end');
        return;
      }
      const rows = await db
        .get('locations')
        .query(Q.where('timestamp', Q.between(s, e)), Q.sortBy('timestamp', Q.asc))
        .fetch();
      const pts = rows.map((m) => ({ latitude: m.latitude, longitude: m.longitude, timestamp: m.timestamp }));
      setFilteredLocations(pts);
      setFilterActive(true);
      setFilterVisible(false);
      if (pts.length > 0) {
        const first = pts[0];
        setRegion((r) => ({ ...(r || {}), latitude: first.latitude, longitude: first.longitude }));
      }
    } catch (err) {
      setFilterError('Query failed');
    }
  }, [db, startInput, endInput]);

  const onClearFilter = useCallback(() => {
    setFilterActive(false);
    setFilteredLocations([]);
    setFilterVisible(false);
    setFilterError(null);
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.container}>
        {region ? (
          <TrackMap region={region} tileUrls={tileUrls} savedLocations={displayedLocations} location={location} />
        ) : (
          <View style={styles.center}>
            {loading ? <ActivityIndicator size="large" /> : <Text>{errorMsg || 'Location unavailable'}</Text>}
          </View>
        )}
        <View style={styles.attributionContainer} pointerEvents="none">
          {/* <Text style={styles.attributionText}>© OpenStreetMap contributors · Tiles © OpenStreetMap</Text> */}
        </View>
        <View style={styles.leftBtnStack}>
          <TouchableOpacity onPress={() => setDebugVisible(true)} style={styles.debugBtn}>
            <Text style={styles.debugBtnText}>Debug</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onToggleBackground} style={styles.bgBtn}>
            <Text style={styles.bgBtnText}>{bgActive ? 'BG: On' : 'BG: Off'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setTripsVisible(true)} style={styles.bgBtn}>
            <Text style={styles.debugBtnText}>Trips</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setFilterVisible(true)} style={styles.bgBtn}>
            <Text style={styles.debugBtnText}>Range</Text>
          </TouchableOpacity>
          {filterActive && (
            <TouchableOpacity onPress={onClearFilter} style={styles.bgBtn}>
              <Text style={styles.debugBtnText}>Clear Range</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.rightBtnStack}>
          <TouchableOpacity onPress={onRecenter} style={styles.recenterBtn}>
            <Text style={styles.debugBtnText}>Recenter</Text>
          </TouchableOpacity>
        </View>
      </View>
      <Modal visible={debugVisible} transparent animationType="slide" onRequestClose={() => setDebugVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Saved locations: {savedLocations.length}</Text>
            <FlatList
              data={savedLocations}
              keyExtractor={(_, i) => String(i)}
              renderItem={({ item, index }) => (
                <Text style={styles.modalItem}>{index + 1}. {item.latitude.toFixed(5)}, {item.longitude.toFixed(5)} · {new Date(item.timestamp).toISOString()}</Text>
              )}
            />
            <TouchableOpacity onPress={onInvalidateTiles} style={styles.modalCloseBtn}>
              <Text style={styles.modalCloseText}>Invalidate Tiles</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onClearTiles} style={styles.modalCloseBtn}>
              <Text style={styles.modalCloseText}>Clear Cache</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setDebugVisible(false)} style={styles.modalCloseBtn}>
              <Text style={styles.modalCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={tripsVisible} transparent animationType="slide" onRequestClose={() => setTripsVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Trips: {trips.length}</Text>
            <FlatList
              data={trips}
              keyExtractor={(_, i) => `trip-${i}`}
              renderItem={({ item, index }) => (
                <Text style={styles.modalItem}>
                  {index + 1}. {fmtTime(item.startTime)} → {fmtTime(item.endTime)} · {fmtDuration(item.durationMs)} · {fmtKm(item.distanceMeters)}
                </Text>
              )}
            />
            <TouchableOpacity onPress={() => setTripsVisible(false)} style={styles.modalCloseBtn}>
              <Text style={styles.modalCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={filterVisible} transparent animationType="slide" onRequestClose={() => setFilterVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Show path by time</Text>
            <Text style={styles.inputLabel}>Start (YYYY-MM-DD or YYYY-MM-DDTHH:mm)</Text>
            <TextInput
              value={startInput}
              onChangeText={setStartInput}
              placeholder="2025-11-16T09:30"
              style={styles.input}
              autoCapitalize="none"
            />
            <Text style={styles.inputLabel}>End (YYYY-MM-DD or YYYY-MM-DDTHH:mm)</Text>
            <TextInput
              value={endInput}
              onChangeText={setEndInput}
              placeholder="2025-11-16T11:00"
              style={styles.input}
              autoCapitalize="none"
            />
            {filterError ? <Text style={styles.errorText}>{filterError}</Text> : null}
            <TouchableOpacity onPress={onApplyFilter} style={styles.modalCloseBtn}>
              <Text style={styles.modalCloseText}>Show Path</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onClearFilter} style={styles.modalCloseBtn}>
              <Text style={styles.modalCloseText}>Clear</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setFilterVisible(false)} style={styles.modalCloseBtn}>
              <Text style={styles.modalCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  debugBtnContainer: {
    position: 'absolute',
    bottom: 24,
    left: 12,
  },
  debugBtn: {
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  debugBtnText: {
    color: '#111827',
    fontWeight: '600',
  },
  fabContainer: {
    position: 'absolute',
    bottom: 24,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  fab: {
    backgroundColor: '#111827',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    elevation: 3,
  },
  fabText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  attributionContainer: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  attributionText: {
    fontSize: 10,
    color: '#111827',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    maxHeight: '60%',
    backgroundColor: '#fff',
    padding: 16,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  modalItem: {
    fontSize: 12,
    marginBottom: 6,
  },
  modalCloseBtn: {
    marginTop: 8,
    alignSelf: 'center',
    backgroundColor: '#111827',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  modalCloseText: {
    color: '#fff',
    fontWeight: '600',
  },
  inputLabel: {
    fontSize: 12,
    marginTop: 8,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errorText: {
    color: '#b91c1c',
    marginTop: 6,
    fontSize: 12,
  },
  leftBtnStack: {
    position: 'absolute',
    top: 12,
    left: 12,
    gap: 8,
  },
  rightBtnStack: {
    position: 'absolute',
    top: 12,
    right: 12,
  },
  bgBtn: {
    marginTop: 8,
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  recenterBtn: {
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
})
;
