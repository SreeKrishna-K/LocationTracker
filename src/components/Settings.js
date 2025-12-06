import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, Switch, TouchableOpacity, Alert, Platform, Modal, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { LinearGradient } from 'expo-linear-gradient';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { ADAPTIVE_TRACKING_ENABLED } from '../config/constants';
import { createGPX, createCSV, createKML, formatBytes } from '../utils/exportFormats';

const Settings = ({ database, bgActive, onToggleBackground, onClearData }) => {
  const [permissions, setPermissions] = useState({
    foreground: false,
    background: false,
  });
  const [locationCount, setLocationCount] = useState(0);
  const [settings, setSettings] = useState({
    highAccuracy: false,
    showNotifications: true,
  });
  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    checkPermissions();
    getLocationCount();
  }, []);

  const checkPermissions = async () => {
    const fg = await Location.getForegroundPermissionsAsync();
    const bg = await Location.getBackgroundPermissionsAsync();
    setPermissions({
      foreground: fg.status === 'granted',
      background: bg.status === 'granted',
    });
  };

  const getLocationCount = async () => {
    try {
      const locations = await database.get('locations').query().fetchCount();
      setLocationCount(locations);
    } catch (e) {
      console.log('Error getting location count:', e);
    }
  };

  const requestForegroundPermission = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    setPermissions(prev => ({ ...prev, foreground: status === 'granted' }));
  };

  const requestBackgroundPermission = async () => {
    const { status } = await Location.requestBackgroundPermissionsAsync();
    setPermissions(prev => ({ ...prev, background: status === 'granted' }));
  };

  const handleClearData = () => {
    Alert.alert(
      'Clear All Data',
      'This will permanently delete all location history and trips. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Clear', 
          style: 'destructive',
          onPress: async () => {
            try {
              await database.write(async () => {
                const locations = await database.get('locations').query().fetch();
                await database.batch(...locations.map(l => l.prepareDestroyPermanently()));
              });
              Alert.alert('Success', 'All data has been cleared.');
              getLocationCount();
              if (onClearData) onClearData();
            } catch (e) {
              Alert.alert('Error', 'Failed to clear data.');
              console.log('Clear data error:', e);
            }
          }
        },
      ]
    );
  };

  const showExportOptions = () => {
    setExportModalVisible(true);
  };

  const exportData = async (format = 'json') => {
    setExporting(true);
    setExportModalVisible(false);
    try {
      // Fetch all locations
      const locations = await database.get('locations').query().fetch();
      
      // Group locations by trips for better organization
      const trips = [];
      let currentTrip = [];
      const TRIP_GAP = 10 * 60 * 1000; // 10 minutes
      
      for (let i = 0; i < locations.length; i++) {
        const loc = locations[i];
        
        if (currentTrip.length > 0) {
          const lastLoc = currentTrip[currentTrip.length - 1];
          if (loc.timestamp - lastLoc.timestamp > TRIP_GAP) {
            trips.push(currentTrip);
            currentTrip = [];
          }
        }
        
        currentTrip.push({
          lat: loc.latitude,
          lng: loc.longitude,
          timestamp: loc.timestamp,
          datetime: new Date(loc.timestamp).toISOString(),
          speed: loc.speed || 0,
          accuracy: loc.accuracy || null,
          altitude: loc.altitude || null,
          heading: loc.heading || null,
          activityType: loc.activityType || 'UNKNOWN',
        });
      }
      
      if (currentTrip.length > 0) {
        trips.push(currentTrip);
      }
      
      // Prepare location data
      const allLocations = locations.map(loc => ({
        lat: loc.latitude,
        lng: loc.longitude,
        timestamp: loc.timestamp,
        speed: loc.speed || 0,
        accuracy: loc.accuracy || null,
        altitude: loc.altitude || null,
        heading: loc.heading || null,
        activityType: loc.activityType || 'UNKNOWN',
      }));
      
      let fileContent, fileName, mimeType;
      
      switch (format) {
        case 'gpx':
          fileContent = createGPX(allLocations, trips);
          fileName = `location_export_${new Date().toISOString().split('T')[0]}.gpx`;
          mimeType = 'application/gpx+xml';
          break;
          
        case 'csv':
          fileContent = createCSV(allLocations);
          fileName = `location_export_${new Date().toISOString().split('T')[0]}.csv`;
          mimeType = 'text/csv';
          break;
          
        case 'kml':
          fileContent = createKML(allLocations, trips);
          fileName = `location_export_${new Date().toISOString().split('T')[0]}.kml`;
          mimeType = 'application/vnd.google-earth.kml+xml';
          break;
          
        default: // JSON
          const exportData = {
            exportDate: new Date().toISOString(),
            totalLocations: locations.length,
            totalTrips: trips.length,
            trackingMode: ADAPTIVE_TRACKING_ENABLED ? 'adaptive' : 'fixed',
            trips: trips.map((trip, index) => ({
              tripNumber: index + 1,
              startTime: trip[0]?.datetime,
              endTime: trip[trip.length - 1]?.datetime,
              points: trip.length,
              locations: trip,
            })),
          };
          fileContent = JSON.stringify(exportData, null, 2);
          fileName = `location_export_${new Date().toISOString().split('T')[0]}.json`;
          mimeType = 'application/json';
      }
      
      // Create file
      const fileUri = `${FileSystem.documentDirectory}${fileName}`;
      await FileSystem.writeAsStringAsync(fileUri, fileContent, {
        encoding: FileSystem.EncodingType.UTF8
      });
      
      // Get file size for display
      const fileInfo = await FileSystem.getInfoAsync(fileUri);
      const fileSize = formatBytes(fileInfo.size || 0);
      
      // Check if sharing is available
      const canShare = await Sharing.isAvailableAsync();
      
      if (canShare) {
        await Sharing.shareAsync(fileUri, {
          mimeType: mimeType,
          dialogTitle: 'Export Location Data',
          UTI: format === 'csv' ? 'public.comma-separated-values-text' : 
               format === 'gpx' ? 'public.xml' : 
               format === 'kml' ? 'com.google.earth.kml' : 
               'public.json',
        });
      } else {
        Alert.alert(
          'Export Complete',
          `Format: ${format.toUpperCase()}\nFile: ${fileName}\nSize: ${fileSize}\n\n${locations.length} locations in ${trips.length} trips`,
          [{ text: 'OK' }]
        );
      }
    } catch (e) {
      console.error('Export error:', e);
      Alert.alert('Export Error', 'Failed to export data. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const SettingRow = ({ icon, title, subtitle, rightComponent, onPress, danger }) => (
    <TouchableOpacity 
      style={styles.settingRow} 
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={[styles.iconContainer, danger && styles.dangerIcon]}>
        <Ionicons name={icon} size={20} color={danger ? '#ef4444' : '#6366f1'} />
      </View>
      <View style={styles.settingContent}>
        <Text style={[styles.settingTitle, danger && styles.dangerText]}>{title}</Text>
        {subtitle && <Text style={styles.settingSubtitle}>{subtitle}</Text>}
      </View>
      {rightComponent}
    </TouchableOpacity>
  );

  return (
    <>
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.subtitle}>Configure app behavior</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Permissions</Text>
        <View style={styles.sectionContent}>
          <SettingRow
            icon="location-outline"
            title="Location Access"
            subtitle={permissions.foreground ? 'Granted' : 'Not granted'}
            rightComponent={
              !permissions.foreground && (
                <TouchableOpacity onPress={requestForegroundPermission} style={styles.grantButton}>
                  <Text style={styles.grantButtonText}>Grant</Text>
                </TouchableOpacity>
              )
            }
          />
          <SettingRow
            icon="navigate-circle-outline"
            title="Background Location"
            subtitle={permissions.background ? 'Granted' : 'Not granted'}
            rightComponent={
              !permissions.background && (
                <TouchableOpacity onPress={requestBackgroundPermission} style={styles.grantButton}>
                  <Text style={styles.grantButtonText}>Grant</Text>
                </TouchableOpacity>
              )
            }
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Tracking</Text>
        <View style={styles.sectionContent}>
          <SettingRow
            icon="radio-outline"
            title="Background Tracking"
            subtitle={bgActive ? 'Active' : 'Inactive'}
            rightComponent={
              <Switch
                value={bgActive}
                onValueChange={onToggleBackground}
                trackColor={{ false: '#e5e7eb', true: '#c7d2fe' }}
                thumbColor={bgActive ? '#6366f1' : '#9ca3af'}
              />
            }
          />
          <SettingRow
            icon="analytics-outline"
            title="Adaptive Tracking"
            subtitle={ADAPTIVE_TRACKING_ENABLED ? 'Smart mode: IDLE/WALKING/VEHICLE' : 'Fixed thresholds'}
            rightComponent={
              <View style={[styles.badge, { backgroundColor: ADAPTIVE_TRACKING_ENABLED ? '#10b981' : '#9ca3af' }]}>
                <Text style={styles.badgeText}>{ADAPTIVE_TRACKING_ENABLED ? 'ON' : 'OFF'}</Text>
              </View>
            }
          />
          <SettingRow
            icon="speedometer-outline"
            title="High Accuracy Mode"
            subtitle="Uses more battery"
            rightComponent={
              <Switch
                value={settings.highAccuracy}
                onValueChange={(v) => setSettings(prev => ({ ...prev, highAccuracy: v }))}
                trackColor={{ false: '#e5e7eb', true: '#c7d2fe' }}
                thumbColor={settings.highAccuracy ? '#6366f1' : '#9ca3af'}
              />
            }
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Data Management</Text>
        <View style={styles.sectionContent}>
          <SettingRow
            icon="server-outline"
            title="Stored Locations"
            subtitle={`${locationCount} points`}
            rightComponent={
              <Ionicons name="information-circle-outline" size={20} color="#9ca3af" />
            }
          />
          <SettingRow
            icon="download-outline"
            title="Export Data"
            subtitle="Multiple formats available"
            onPress={showExportOptions}
            rightComponent={
              exporting ? (
                <ActivityIndicator size="small" color="#6366f1" />
              ) : (
                <Ionicons name="chevron-forward" size={20} color="#6b7280" />
              )
            }
          />
          <SettingRow
            icon="trash-outline"
            title="Clear All Data"
            subtitle="Delete all location history"
            onPress={handleClearData}
            danger
            rightComponent={
              <Ionicons name="chevron-forward" size={20} color="#ef4444" />
            }
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>
        <View style={styles.sectionContent}>
          <SettingRow
            icon="information-circle-outline"
            title="Version"
            subtitle="1.0.0"
          />
          <SettingRow
            icon="shield-checkmark-outline"
            title="Privacy"
            subtitle="All data stored locally"
            rightComponent={
              <View style={styles.badge}>
                <Text style={styles.badgeText}>Offline</Text>
              </View>
            }
          />
        </View>
      </View>
    </ScrollView>
    
    {/* Export Format Selection Modal */}
    <Modal
      animationType="slide"
      transparent={true}
      visible={exportModalVisible}
      onRequestClose={() => setExportModalVisible(false)}
    >
      <View style={styles.modalContainer}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Choose Export Format</Text>
            <TouchableOpacity 
              onPress={() => setExportModalVisible(false)}
              style={styles.closeButton}
            >
              <Ionicons name="close" size={24} color="#6b7280" />
            </TouchableOpacity>
          </View>
          
          <View style={styles.formatOptions}>
            <TouchableOpacity 
              style={styles.formatOption}
              onPress={() => exportData('json')}
            >
              <View style={styles.formatIcon}>
                <Ionicons name="code-slash" size={24} color="#6366f1" />
              </View>
              <View style={styles.formatInfo}>
                <Text style={styles.formatTitle}>JSON</Text>
                <Text style={styles.formatDescription}>Complete data with all fields</Text>
              </View>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.formatOption}
              onPress={() => exportData('gpx')}
            >
              <View style={styles.formatIcon}>
                <Ionicons name="map" size={24} color="#10b981" />
              </View>
              <View style={styles.formatInfo}>
                <Text style={styles.formatTitle}>GPX</Text>
                <Text style={styles.formatDescription}>GPS Exchange Format for mapping apps</Text>
              </View>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.formatOption}
              onPress={() => exportData('csv')}
            >
              <View style={styles.formatIcon}>
                <Ionicons name="grid" size={24} color="#f59e0b" />
              </View>
              <View style={styles.formatInfo}>
                <Text style={styles.formatTitle}>CSV</Text>
                <Text style={styles.formatDescription}>Spreadsheet compatible format</Text>
              </View>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.formatOption}
              onPress={() => exportData('kml')}
            >
              <View style={styles.formatIcon}>
                <Ionicons name="earth" size={24} color="#8b5cf6" />
              </View>
              <View style={styles.formatInfo}>
                <Text style={styles.formatTitle}>KML</Text>
                <Text style={styles.formatDescription}>Google Earth format with styling</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  header: {
    padding: 16,
    paddingTop: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
    marginLeft: 16,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionContent: {
    backgroundColor: 'white',
    marginHorizontal: 16,
    borderRadius: 16,
    overflow: 'hidden',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  dangerIcon: {
    backgroundColor: '#fee2e2',
  },
  settingContent: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: '#111827',
  },
  settingSubtitle: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
  },
  dangerText: {
    color: '#ef4444',
  },
  grantButton: {
    backgroundColor: '#6366f1',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  grantButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  badge: {
    backgroundColor: '#10b981',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    color: 'white',
    fontSize: 11,
    fontWeight: '600',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  closeButton: {
    padding: 8,
  },
  formatOptions: {
    gap: 12,
  },
  formatOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  formatIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  formatInfo: {
    flex: 1,
  },
  formatTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  formatDescription: {
    fontSize: 13,
    color: '#6b7280',
  },
});

export default Settings;
