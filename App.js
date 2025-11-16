import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, Modal, FlatList, ScrollView, Alert } from 'react-native';
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
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import TabNavigator from './src/components/TabNavigator';
import TripCard from './src/components/TripCard';
import Dashboard from './src/components/Dashboard';
import Settings from './src/components/Settings';
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
  const [bgActive, setBgActive] = useState(false);
  const [filteredLocations, setFilteredLocations] = useState([]);
  const [filterActive, setFilterActive] = useState(false);
  const [activeTab, setActiveTab] = useState('map');
  const [selectedTrip, setSelectedTrip] = useState(null);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [datePickerMode, setDatePickerMode] = useState('start');
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date());
  const [filterModalVisible, setFilterModalVisible] = useState(false);
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

  const onApplyFilter = useCallback(async () => {
    try {
      const s = startDate.getTime();
      const e = endDate.getTime();
      if (s >= e) {
        Alert.alert('Invalid Range', 'Start date must be before end date');
        return;
      }
      const rows = await db
        .get('locations')
        .query(Q.where('timestamp', Q.between(s, e)), Q.sortBy('timestamp', Q.asc))
        .fetch();
      const pts = rows.map((m) => ({ latitude: m.latitude, longitude: m.longitude, timestamp: m.timestamp }));
      setFilteredLocations(pts);
      setFilterActive(true);
      setFilterModalVisible(false);
      if (pts.length > 0) {
        const first = pts[0];
        setRegion((r) => ({ ...(r || {}), latitude: first.latitude, longitude: first.longitude }));
      }
      Alert.alert('Filter Applied', `Showing ${pts.length} locations`);
    } catch (err) {
      Alert.alert('Error', 'Failed to apply filter');
    }
  }, [db, startDate, endDate]);

  const onClearFilter = useCallback(() => {
    setFilterActive(false);
    setFilteredLocations([]);
    setSelectedTrip(null);
  }, []);

  const onTripPress = useCallback((trip) => {
    setSelectedTrip(trip);
    setActiveTab('map');
    // Center map on trip start
    if (trip.points && trip.points.length > 0) {
      const midPoint = trip.points[Math.floor(trip.points.length / 2)];
      setRegion((r) => ({ 
        ...(r || {}), 
        latitude: midPoint.latitude, 
        longitude: midPoint.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      }));
    }
  }, []);

  const handleDateConfirm = useCallback((date) => {
    if (datePickerMode === 'start') {
      setStartDate(date);
    } else {
      setEndDate(date);
    }
    setDatePickerVisible(false);
  }, [datePickerMode]);

  const tripLocations = useMemo(() => {
    if (!selectedTrip || !selectedTrip.points) return [];
    return selectedTrip.points;
  }, [selectedTrip]);

  const renderMapView = () => (
    <View style={styles.mapContainer}>
      {region ? (
        <TrackMap 
          region={region} 
          tileUrls={tileUrls} 
          savedLocations={selectedTrip ? tripLocations : displayedLocations} 
          location={location} 
        />
      ) : (
        <View style={styles.center}>
          {loading ? <ActivityIndicator size="large" color="#6366f1" /> : <Text>{errorMsg || 'Location unavailable'}</Text>}
        </View>
      )}
      
      {/* Map Controls */}
      <View style={styles.mapControlsContainer}>
        {selectedTrip && (
          <TouchableOpacity 
            style={styles.clearTripBtn}
            onPress={() => setSelectedTrip(null)}
          >
            <Ionicons name="close-circle" size={20} color="white" />
            <Text style={styles.clearTripText}>Clear Trip</Text>
          </TouchableOpacity>
        )}
        
        <TouchableOpacity onPress={onRecenter} style={styles.mapBtn}>
          <Ionicons name="locate" size={22} color="#6366f1" />
        </TouchableOpacity>
        
        <TouchableOpacity onPress={() => setFilterModalVisible(true)} style={styles.mapBtn}>
          <Ionicons name="calendar" size={22} color={filterActive ? '#10b981' : '#6366f1'} />
        </TouchableOpacity>
        
        {filterActive && (
          <TouchableOpacity onPress={onClearFilter} style={styles.mapBtn}>
            <Ionicons name="close" size={22} color="#ef4444" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  const renderTripsView = () => (
    <View style={styles.tripsContainer}>
      <View style={styles.tripsHeader}>
        <Text style={styles.tripsTitle}>Your Trips</Text>
        <Text style={styles.tripsSubtitle}>{trips.length} trips recorded</Text>
      </View>
      <FlatList
        data={trips}
        keyExtractor={(item, index) => `trip-${index}`}
        renderItem={({ item, index }) => (
          <TripCard 
            trip={item} 
            index={index} 
            onPress={onTripPress}
          />
        )}
        contentContainerStyle={{ paddingBottom: 20 }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="car-outline" size={48} color="#d1d5db" />
            <Text style={styles.emptyText}>No trips recorded yet</Text>
            <Text style={styles.emptySubtext}>Start moving to record your first trip</Text>
          </View>
        }
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.container}>
        {/* Header */}
        <LinearGradient
          colors={['#6366f1', '#8b5cf6']}
          style={styles.header}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        >
          <View style={styles.headerContent}>
            <View>
              <Text style={styles.headerTitle}>Location Tracker</Text>
              <Text style={styles.headerSubtitle}>
                {bgActive ? 'Background tracking active' : 'Foreground tracking only'}
              </Text>
            </View>
            <TouchableOpacity 
              style={styles.headerBtn}
              onPress={onToggleBackground}
            >
              <Ionicons 
                name={bgActive ? "radio-button-on" : "radio-button-off"} 
                size={24} 
                color="white" 
              />
            </TouchableOpacity>
          </View>
        </LinearGradient>

        {/* Content */}
        <View style={styles.content}>
          {activeTab === 'map' && renderMapView()}
          {activeTab === 'trips' && renderTripsView()}
          {activeTab === 'dashboard' && <Dashboard trips={trips} locations={savedLocations} />}
          {activeTab === 'settings' && (
            <Settings 
              database={db}
              bgActive={bgActive}
              onToggleBackground={onToggleBackground}
              onClearData={() => {
                setSavedLocations([]);
                setFilteredLocations([]);
                setSelectedTrip(null);
              }}
            />
          )}
        </View>

        {/* Tab Navigator */}
        <TabNavigator 
          activeTab={activeTab} 
          onTabChange={setActiveTab}
        />
      </View>
      {/* Date Range Filter Modal */}
      <Modal visible={filterModalVisible} transparent animationType="slide" onRequestClose={() => setFilterModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.filterModal}>
            <View style={styles.filterHeader}>
              <Text style={styles.filterTitle}>Filter by Date Range</Text>
              <TouchableOpacity onPress={() => setFilterModalVisible(false)}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>
            
            <View style={styles.dateRangeContainer}>
              <TouchableOpacity 
                style={styles.datePickerBtn}
                onPress={() => {
                  setDatePickerMode('start');
                  setDatePickerVisible(true);
                }}
              >
                <Ionicons name="calendar-outline" size={20} color="#6366f1" />
                <View style={styles.datePickerContent}>
                  <Text style={styles.datePickerLabel}>Start Date</Text>
                  <Text style={styles.datePickerValue}>
                    {startDate.toLocaleDateString()} {startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
              </TouchableOpacity>
              
              <View style={styles.dateRangeDivider}>
                <Ionicons name="arrow-forward" size={20} color="#9ca3af" />
              </View>
              
              <TouchableOpacity 
                style={styles.datePickerBtn}
                onPress={() => {
                  setDatePickerMode('end');
                  setDatePickerVisible(true);
                }}
              >
                <Ionicons name="calendar-outline" size={20} color="#6366f1" />
                <View style={styles.datePickerContent}>
                  <Text style={styles.datePickerLabel}>End Date</Text>
                  <Text style={styles.datePickerValue}>
                    {endDate.toLocaleDateString()} {endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
            
            <View style={styles.filterActions}>
              <TouchableOpacity 
                style={[styles.filterBtn, styles.filterBtnSecondary]}
                onPress={() => {
                  setFilterModalVisible(false);
                  onClearFilter();
                }}
              >
                <Text style={styles.filterBtnSecondaryText}>Clear Filter</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.filterBtn, styles.filterBtnPrimary]}
                onPress={onApplyFilter}
              >
                <Text style={styles.filterBtnPrimaryText}>Apply Filter</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      
      {/* Date Time Picker */}
      <DateTimePickerModal
        isVisible={datePickerVisible}
        mode="datetime"
        onConfirm={handleDateConfirm}
        onCancel={() => setDatePickerVisible(false)}
        date={datePickerMode === 'start' ? startDate : endDate}
      />
      <StatusBar style="auto" />
    </SafeAreaView>
  );

}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  header: {
    paddingTop: 12,
    paddingBottom: 16,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: 'white',
  },
  headerSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 2,
  },
  headerBtn: {
    padding: 8,
  },
  content: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapContainer: {
    flex: 1,
    position: 'relative',
  },
  mapControlsContainer: {
    position: 'absolute',
    bottom: 20,
    right: 16,
    gap: 12,
  },
  mapBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  clearTripBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ef4444',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  clearTripText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  tripsContainer: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  tripsHeader: {
    padding: 16,
    paddingTop: 8,
  },
  tripsTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
  },
  tripsSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#9ca3af',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#d1d5db',
    marginTop: 4,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterModal: {
    width: '90%',
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  filterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  filterTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  dateRangeContainer: {
    marginBottom: 24,
  },
  datePickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    gap: 12,
  },
  datePickerContent: {
    flex: 1,
  },
  datePickerLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 2,
  },
  datePickerValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  dateRangeDivider: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  filterActions: {
    flexDirection: 'row',
    gap: 12,
  },
  filterBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBtnPrimary: {
    backgroundColor: '#6366f1',
  },
  filterBtnSecondary: {
    backgroundColor: '#f3f4f6',
  },
  filterBtnPrimaryText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '600',
  },
  filterBtnSecondaryText: {
    color: '#6b7280',
    fontSize: 15,
    fontWeight: '600',
  },
});

