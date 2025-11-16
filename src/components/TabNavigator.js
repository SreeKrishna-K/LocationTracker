import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const TabNavigator = ({ activeTab, onTabChange }) => {
  const tabs = [
    { id: 'map', label: 'Map', icon: 'map-outline', activeIcon: 'map' },
    { id: 'trips', label: 'Trips', icon: 'car-outline', activeIcon: 'car' },
    { id: 'dashboard', label: 'Analytics', icon: 'stats-chart-outline', activeIcon: 'stats-chart' },
    { id: 'settings', label: 'Settings', icon: 'settings-outline', activeIcon: 'settings' },
  ];

  return (
    <View style={styles.container}>
      {tabs.map((tab) => (
        <TouchableOpacity
          key={tab.id}
          style={styles.tab}
          onPress={() => onTabChange(tab.id)}
        >
          <Ionicons
            name={activeTab === tab.id ? tab.activeIcon : tab.icon}
            size={24}
            color={activeTab === tab.id ? '#6366f1' : '#9ca3af'}
          />
          <Text style={[
            styles.label,
            activeTab === tab.id && styles.activeLabel
          ]}>
            {tab.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingBottom: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 10,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
  },
  label: {
    fontSize: 11,
    marginTop: 4,
    color: '#9ca3af',
  },
  activeLabel: {
    color: '#6366f1',
    fontWeight: '600',
  },
});

export default TabNavigator;
