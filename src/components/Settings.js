import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, Switch, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { LinearGradient } from 'expo-linear-gradient';

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

  const exportData = async () => {
    try {
      const locations = await database.get('locations').query().fetch();
      const data = locations.map(l => ({
        lat: l.latitude,
        lng: l.longitude,
        timestamp: l.timestamp,
      }));
      
      // In a real app, you'd save this to a file or share it
      Alert.alert(
        'Export Data',
        `${data.length} locations ready for export. (Export functionality coming soon)`,
        [{ text: 'OK' }]
      );
    } catch (e) {
      Alert.alert('Error', 'Failed to export data.');
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
            subtitle="Download as JSON"
            onPress={exportData}
            rightComponent={
              <Ionicons name="chevron-forward" size={20} color="#6b7280" />
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
});

export default Settings;
