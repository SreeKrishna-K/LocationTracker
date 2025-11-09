import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, Modal, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import TrackMap from './src/components/TrackMap';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { useDatabase } from '@nozbe/watermelondb/hooks';
import { Q } from '@nozbe/watermelondb';
import { OfflineManager } from '@maplibre/maplibre-react-native';
import { database } from './src/db/database';
import { distMeters } from './src/utils/geo';

const BG_TASK = 'LOCATION_TRACKING_TASK';
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
      if (d > 50) {
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
        console.log(`BG saved (>50m: ${Math.round(d)}m)`);
      } else {
        console.log(`BG skipped (${Math.round(d)}m < 50m)`);
      }
    }
  });
} catch (e) {
  // defineTask can throw if registered twice in fast refresh; ignore
}

export default function App() {
  const db = useDatabase();
  const [location, setLocation] = useState(null);
  const [region, setRegion] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [savedLocations, setSavedLocations] = useState([]);
  const [debugVisible, setDebugVisible] = useState(false);
  const [bgActive, setBgActive] = useState(false);
  const lastSavedRef = useRef(null);
  const watchRef = useRef(null);
  const tileUrls = [
    'https://a.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png',
    'https://b.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png',
    'https://c.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png',
  ];


  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setErrorMsg('Permission to access location was denied');
        setLoading(false);
        return;
      }
      try {
        await OfflineManager.setMaximumAmbientCacheSize(300 * 1024 * 1024);
      } catch (e) {
        console.log('Ambient cache size set error', e);
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
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
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 5000,
            distanceInterval: 10,
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
              if (d > 50) {
                lastSavedRef.current = point;
                setSavedLocations((prev) => {
                  const next = [...prev, point];
                  console.log(`Saved location (>50m: ${Math.round(d)}m). Total: ${next.length}`);
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
                console.log(`Skipped update (${Math.round(d)}m < 50m)`);
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
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 5000,
          distanceInterval: 10,
          pausesUpdatesAutomatically: false,
          showsBackgroundLocationIndicator: true,
          foregroundService: {
            notificationTitle: 'Location Tracking',
            notificationBody: 'Tracking location in background',
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

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.container}>
        {region ? (
          <TrackMap region={region} tileUrls={tileUrls} savedLocations={savedLocations} location={location} />
        ) : (
          <View style={styles.center}>
            {loading ? <ActivityIndicator size="large" /> : <Text>{errorMsg || 'Location unavailable'}</Text>}
          </View>
        )}
        <View style={styles.attributionContainer} pointerEvents="none">
          <Text style={styles.attributionText}>© OpenStreetMap contributors · Tiles © OpenStreetMap</Text>
        </View>
        <View style={styles.leftBtnStack}>
          <TouchableOpacity onPress={() => setDebugVisible(true)} style={styles.debugBtn}>
            <Text style={styles.debugBtnText}>Debug</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onToggleBackground} style={styles.bgBtn}>
            <Text style={styles.bgBtnText}>{bgActive ? 'BG: On' : 'BG: Off'}</Text>
          </TouchableOpacity>
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
