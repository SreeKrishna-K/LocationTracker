import React from 'react';
import { StyleSheet } from 'react-native';
import { MapView, Camera, ShapeSource, LineLayer, CircleLayer, RasterSource, RasterLayer } from '@maplibre/maplibre-react-native';
import { INITIAL_ZOOM, TILE_SIZE, RENDER_WORLD_COPIES } from '../config/constants';

export default function TrackMap({ region, tileUrls, savedLocations, location }) {
  return (
    <MapView
      style={StyleSheet.absoluteFillObject}
      compassEnabled={false}
      logoEnabled={false}
      attributionEnabled={false}
      renderWorldCopies={RENDER_WORLD_COPIES}
      styleJSON={JSON.stringify({ version: 8, sources: {}, layers: [{ id: 'bg', type: 'background' }] })}
    >
      <Camera centerCoordinate={[region.longitude, region.latitude]} zoomLevel={INITIAL_ZOOM} />

      <RasterSource id="osm" tileUrlTemplates={tileUrls} tileSize={TILE_SIZE}>
        <RasterLayer id="osmLayer" sourceID="osm" />
      </RasterSource>

      {savedLocations?.length >= 2 && (
        <ShapeSource
          id="route"
          shape={{
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: savedLocations.map((p) => [p.longitude, p.latitude]),
            },
          }}
        >
          <LineLayer id="routeLine" style={{ lineColor: '#2563eb', lineWidth: 4 }} />
        </ShapeSource>
      )}

      {location && (
        <ShapeSource
          id="me"
          shape={{ type: 'Feature', geometry: { type: 'Point', coordinates: [location.longitude, location.latitude] } }}
        >
          <CircleLayer id="meDot" style={{ circleColor: '#2563eb', circleRadius: 6, circleStrokeWidth: 2, circleStrokeColor: '#ffffff' }} />
        </ShapeSource>
      )}
    </MapView>
  );
}
