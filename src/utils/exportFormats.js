// Convert locations to GPX format
export const createGPX = (locations, trips) => {
  const gpxHeader = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="LocationTracker" 
  xmlns="http://www.topografix.com/GPX/1/1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>Location Export</name>
    <time>${new Date().toISOString()}</time>
  </metadata>`;

  let gpxContent = '';

  // Add waypoints for significant locations
  trips.forEach((trip, tripIndex) => {
    if (trip.length > 0) {
      // Add start point as waypoint
      const start = trip[0];
      gpxContent += `
  <wpt lat="${start.lat}" lon="${start.lng}">
    <time>${new Date(start.timestamp).toISOString()}</time>
    <name>Trip ${tripIndex + 1} Start</name>
    <desc>Activity: ${start.activityType || 'UNKNOWN'}</desc>
  </wpt>`;
      
      // Add end point as waypoint
      const end = trip[trip.length - 1];
      gpxContent += `
  <wpt lat="${end.lat}" lon="${end.lng}">
    <time>${new Date(end.timestamp).toISOString()}</time>
    <name>Trip ${tripIndex + 1} End</name>
    <desc>Activity: ${end.activityType || 'UNKNOWN'}</desc>
  </wpt>`;
    }
  });

  // Add tracks for each trip
  trips.forEach((trip, tripIndex) => {
    if (trip.length > 0) {
      gpxContent += `
  <trk>
    <name>Trip ${tripIndex + 1}</name>
    <trkseg>`;
      
      trip.forEach(point => {
        gpxContent += `
      <trkpt lat="${point.lat}" lon="${point.lng}">
        <time>${new Date(point.timestamp).toISOString()}</time>`;
        
        if (point.altitude) {
          gpxContent += `
        <ele>${point.altitude}</ele>`;
        }
        
        if (point.speed) {
          gpxContent += `
        <speed>${point.speed}</speed>`;
        }
        
        if (point.heading) {
          gpxContent += `
        <course>${point.heading}</course>`;
        }
        
        gpxContent += `
        <extensions>
          <accuracy>${point.accuracy || 0}</accuracy>
          <activity>${point.activityType || 'UNKNOWN'}</activity>
        </extensions>
      </trkpt>`;
      });
      
      gpxContent += `
    </trkseg>
  </trk>`;
    }
  });

  const gpxFooter = `
</gpx>`;

  return gpxHeader + gpxContent + gpxFooter;
};

// Convert locations to CSV format
export const createCSV = (locations) => {
  // CSV header
  let csv = 'Timestamp,Date,Time,Latitude,Longitude,Speed (m/s),Speed (km/h),Accuracy (m),Altitude (m),Heading (°),Activity Type\n';
  
  // Add data rows
  locations.forEach(loc => {
    const date = new Date(loc.timestamp);
    const dateStr = date.toLocaleDateString();
    const timeStr = date.toLocaleTimeString();
    const speedKmh = loc.speed ? (loc.speed * 3.6).toFixed(2) : '0';
    
    csv += `${loc.timestamp},${dateStr},${timeStr},${loc.lat},${loc.lng},`;
    csv += `${loc.speed || 0},${speedKmh},${loc.accuracy || ''},`;
    csv += `${loc.altitude || ''},${loc.heading || ''},${loc.activityType || 'UNKNOWN'}\n`;
  });
  
  return csv;
};

// Create KML format for Google Earth
export const createKML = (locations, trips) => {
  const kmlHeader = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Location Tracking Export</name>
    <description>Exported on ${new Date().toISOString()}</description>
    
    <!-- Style definitions -->
    <Style id="vehicleStyle">
      <LineStyle>
        <color>ff0000ff</color>
        <width>4</width>
      </LineStyle>
    </Style>
    <Style id="walkingStyle">
      <LineStyle>
        <color>ff00ff00</color>
        <width>3</width>
      </LineStyle>
    </Style>
    <Style id="idleStyle">
      <LineStyle>
        <color>ff808080</color>
        <width>2</width>
      </LineStyle>
    </Style>`;

  let kmlContent = '';

  // Add placemarks for each trip
  trips.forEach((trip, tripIndex) => {
    if (trip.length > 0) {
      // Determine dominant activity for styling
      const activities = trip.map(p => p.activityType).filter(a => a);
      const dominantActivity = activities.length > 0 
        ? activities.sort((a, b) => 
            activities.filter(v => v === a).length - activities.filter(v => v === b).length
          ).pop()
        : 'UNKNOWN';
      
      const styleRef = dominantActivity === 'VEHICLE' ? 'vehicleStyle' 
        : dominantActivity === 'WALKING' ? 'walkingStyle' 
        : 'idleStyle';
      
      kmlContent += `
    <Placemark>
      <name>Trip ${tripIndex + 1}</name>
      <description>
        Start: ${new Date(trip[0].timestamp).toLocaleString()}
        End: ${new Date(trip[trip.length - 1].timestamp).toLocaleString()}
        Points: ${trip.length}
        Activity: ${dominantActivity}
      </description>
      <styleUrl>#${styleRef}</styleUrl>
      <LineString>
        <coordinates>`;
      
      trip.forEach(point => {
        kmlContent += `
          ${point.lng},${point.lat},${point.altitude || 0}`;
      });
      
      kmlContent += `
        </coordinates>
      </LineString>
    </Placemark>`;
    }
  });

  const kmlFooter = `
  </Document>
</kml>`;

  return kmlHeader + kmlContent + kmlFooter;
};

// Format bytes to human readable
export const formatBytes = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};
