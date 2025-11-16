import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

const TripCard = ({ trip, index, onPress }) => {
  const formatTime = (ms) => {
    const date = new Date(ms);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (ms) => {
    const date = new Date(ms);
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const formatDuration = (ms) => {
    const seconds = Math.floor(ms / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes} min`;
  };

  const formatDistance = (meters) => {
    const km = meters / 1000;
    return km >= 1 ? `${km.toFixed(1)} km` : `${Math.round(meters)} m`;
  };

  const getSpeedKmh = () => {
    const hours = trip.durationMs / (1000 * 60 * 60);
    const km = trip.distanceMeters / 1000;
    return hours > 0 ? (km / hours).toFixed(1) : '0';
  };

  return (
    <TouchableOpacity onPress={() => onPress(trip)} style={styles.container}>
      <LinearGradient
        colors={['#ffffff', '#fafafa']}
        style={styles.card}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.header}>
          <View style={styles.dateContainer}>
            <Text style={styles.date}>{formatDate(trip.startTime)}</Text>
            <Text style={styles.tripNumber}>Trip #{index + 1}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#6b7280" />
        </View>

        <View style={styles.timeRow}>
          <View style={styles.timeBlock}>
            <Ionicons name="play-circle-outline" size={16} color="#10b981" />
            <Text style={styles.timeText}>{formatTime(trip.startTime)}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.timeBlock}>
            <Ionicons name="stop-circle-outline" size={16} color="#ef4444" />
            <Text style={styles.timeText}>{formatTime(trip.endTime)}</Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Ionicons name="time-outline" size={18} color="#6366f1" />
            <Text style={styles.statValue}>{formatDuration(trip.durationMs)}</Text>
          </View>
          <View style={styles.stat}>
            <Ionicons name="navigate-outline" size={18} color="#8b5cf6" />
            <Text style={styles.statValue}>{formatDistance(trip.distanceMeters)}</Text>
          </View>
          <View style={styles.stat}>
            <Ionicons name="speedometer-outline" size={18} color="#f59e0b" />
            <Text style={styles.statValue}>{getSpeedKmh()} km/h</Text>
          </View>
        </View>

        <View style={styles.pointsInfo}>
          <Text style={styles.pointsText}>{trip.points?.length || 0} location points</Text>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginVertical: 8,
  },
  card: {
    borderRadius: 16,
    padding: 16,
    backgroundColor: 'white',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  dateContainer: {
    flex: 1,
  },
  date: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  tripNumber: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  timeBlock: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  divider: {
    width: 30,
    height: 1,
    backgroundColor: '#e5e7eb',
  },
  timeText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statValue: {
    fontSize: 13,
    fontWeight: '500',
    color: '#374151',
  },
  pointsInfo: {
    marginTop: 8,
    alignItems: 'center',
  },
  pointsText: {
    fontSize: 11,
    color: '#9ca3af',
  },
});

export default TripCard;
