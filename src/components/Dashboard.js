import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, Dimensions } from 'react-native';
import { LineChart, BarChart } from 'react-native-chart-kit';
import { Ionicons } from '@expo/vector-icons';
import StatsCard from './StatsCard';

const { width: screenWidth } = Dimensions.get('window');

const Dashboard = ({ trips, locations }) => {
  const stats = useMemo(() => {
    if (!trips || trips.length === 0) {
      return {
        totalTrips: 0,
        totalDistance: 0,
        totalDuration: 0,
        avgSpeed: 0,
        todayTrips: 0,
        weekTrips: 0,
        longestTrip: null,
        dailyStats: [],
      };
    }

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const weekAgo = now.getTime() - (7 * 24 * 60 * 60 * 1000);

    const todayTrips = trips.filter(t => t.startTime >= todayStart);
    const weekTrips = trips.filter(t => t.startTime >= weekAgo);
    
    const totalDistance = trips.reduce((sum, t) => sum + (t.distanceMeters || 0), 0);
    const totalDuration = trips.reduce((sum, t) => sum + (t.durationMs || 0), 0);
    const avgSpeed = totalDuration > 0 ? (totalDistance / 1000) / (totalDuration / (1000 * 60 * 60)) : 0;
    
    const longestTrip = trips.reduce((longest, t) => 
      (!longest || t.distanceMeters > longest.distanceMeters) ? t : longest
    , null);

    // Daily stats for the last 7 days
    const dailyStats = [];
    for (let i = 6; i >= 0; i--) {
      const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i).getTime();
      const dayEnd = dayStart + (24 * 60 * 60 * 1000);
      const dayTrips = trips.filter(t => t.startTime >= dayStart && t.startTime < dayEnd);
      const dayDistance = dayTrips.reduce((sum, t) => sum + (t.distanceMeters || 0), 0);
      
      const date = new Date(dayStart);
      dailyStats.push({
        day: date.toLocaleDateString('en', { weekday: 'short' }),
        distance: dayDistance / 1000, // in km
        trips: dayTrips.length,
      });
    }

    return {
      totalTrips: trips.length,
      totalDistance,
      totalDuration,
      avgSpeed,
      todayTrips: todayTrips.length,
      weekTrips: weekTrips.length,
      longestTrip,
      dailyStats,
    };
  }, [trips]);

  const formatDistance = (meters) => {
    const km = meters / 1000;
    return km >= 1 ? `${km.toFixed(1)} km` : `${Math.round(meters)} m`;
  };

  const formatDuration = (ms) => {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes} min`;
  };

  const chartConfig = {
    backgroundColor: '#ffffff',
    backgroundGradientFrom: '#ffffff',
    backgroundGradientTo: '#ffffff',
    decimalPlaces: 1,
    color: (opacity = 1) => `rgba(99, 102, 241, ${opacity})`,
    labelColor: (opacity = 1) => `rgba(107, 114, 128, ${opacity})`,
    style: {
      borderRadius: 16,
    },
    propsForDots: {
      r: '6',
      strokeWidth: '2',
      stroke: '#6366f1',
    },
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={styles.title}>Analytics Dashboard</Text>
        <Text style={styles.subtitle}>Track your movement patterns</Text>
      </View>

      <View style={styles.statsGrid}>
        <View style={styles.statsRow}>
          <View style={{ flex: 1, marginRight: 6 }}>
            <StatsCard
              icon="car-outline"
              iconColor="#10b981"
              title="Total Trips"
              value={stats.totalTrips.toString()}
              subtitle={`${stats.todayTrips} today`}
            />
          </View>
          <View style={{ flex: 1, marginLeft: 6 }}>
            <StatsCard
              icon="navigate-outline"
              iconColor="#8b5cf6"
              title="Total Distance"
              value={formatDistance(stats.totalDistance)}
              subtitle="All time"
            />
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={{ flex: 1, marginRight: 6 }}>
            <StatsCard
              icon="time-outline"
              iconColor="#f59e0b"
              title="Total Time"
              value={formatDuration(stats.totalDuration)}
              subtitle="In motion"
            />
          </View>
          <View style={{ flex: 1, marginLeft: 6 }}>
            <StatsCard
              icon="speedometer-outline"
              iconColor="#ef4444"
              title="Avg Speed"
              value={`${stats.avgSpeed.toFixed(1)} km/h`}
              subtitle="Overall average"
            />
          </View>
        </View>
      </View>

      {stats.dailyStats.length > 0 && (
        <View style={styles.chartContainer}>
          <Text style={styles.chartTitle}>Distance Last 7 Days</Text>
          <LineChart
            data={{
              labels: stats.dailyStats.map(d => d.day),
              datasets: [{
                data: stats.dailyStats.map(d => d.distance),
              }],
            }}
            width={screenWidth - 32}
            height={200}
            yAxisSuffix=" km"
            chartConfig={chartConfig}
            bezier
            style={styles.chart}
          />
        </View>
      )}

      {stats.dailyStats.length > 0 && (
        <View style={styles.chartContainer}>
          <Text style={styles.chartTitle}>Trips Per Day</Text>
          <BarChart
            data={{
              labels: stats.dailyStats.map(d => d.day),
              datasets: [{
                data: stats.dailyStats.map(d => d.trips),
              }],
            }}
            width={screenWidth - 32}
            height={180}
            chartConfig={{
              ...chartConfig,
              color: (opacity = 1) => `rgba(139, 92, 246, ${opacity})`,
            }}
            style={styles.chart}
            showValuesOnTopOfBars
          />
        </View>
      )}

      <View style={styles.insightsContainer}>
        <Text style={styles.insightsTitle}>Quick Insights</Text>
        <View style={styles.insightCard}>
          <Ionicons name="trending-up" size={20} color="#10b981" />
          <Text style={styles.insightText}>
            You've recorded {locations.length} location points
          </Text>
        </View>
        {stats.longestTrip && (
          <View style={styles.insightCard}>
            <Ionicons name="trophy" size={20} color="#f59e0b" />
            <Text style={styles.insightText}>
              Longest trip: {formatDistance(stats.longestTrip.distanceMeters)}
            </Text>
          </View>
        )}
        <View style={styles.insightCard}>
          <Ionicons name="calendar" size={20} color="#6366f1" />
          <Text style={styles.insightText}>
            {stats.weekTrips} trips in the last 7 days
          </Text>
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
  statsGrid: {
    paddingHorizontal: 16,
  },
  statsRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  chartContainer: {
    marginHorizontal: 16,
    marginVertical: 12,
    padding: 16,
    backgroundColor: 'white',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  chart: {
    marginVertical: 8,
    borderRadius: 16,
  },
  insightsContainer: {
    margin: 16,
    padding: 16,
    backgroundColor: 'white',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  insightsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  insightCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    marginBottom: 8,
    gap: 12,
  },
  insightText: {
    flex: 1,
    fontSize: 14,
    color: '#374151',
  },
});

export default Dashboard;
