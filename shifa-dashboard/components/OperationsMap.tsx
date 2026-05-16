'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import type { Country, DashboardData } from '../lib/types';

interface OperationsMapProps {
  data: DashboardData;
  selectedCountry: 'all' | Country;
  token?: string;
}

type FieldPoint = {
  id: string;
  type: 'case' | 'threat' | 'outbreak';
  label: string;
  country: Country | 'field';
  color: string;
  latitude: number;
  longitude: number;
};

type RegionFeatureCollection = GeoJSON.FeatureCollection<GeoJSON.MultiPolygon | GeoJSON.Polygon, {
  country: Country;
  name: string;
  iso2: string;
  fillColor?: string;
  fillOpacity?: number;
  lineColor?: string;
  lineOpacity?: number;
  lineWidth?: number;
}>;

const REGION_SOURCE_ID = 'shifa-country-boundaries';
const REGION_FILL_LAYER_ID = 'shifa-country-boundary-fill';
const REGION_LINE_LAYER_ID = 'shifa-country-boundary-line';

const REGION_BOUNDS: Record<Country, [[number, number], [number, number]]> = {
  sudan: [[21.8, 8.7], [38.6, 22.2]],
  drc: [[12.0, -13.5], [31.3, 5.4]],
  somalia: [[40.9, -1.7], [51.5, 12.2]],
  nigeria: [[2.6, 4.2], [14.7, 13.9]],
  rwanda: [[28.8, -2.9], [30.9, -1.0]],
};

export default function OperationsMap({ data, selectedCountry, token }: OperationsMapProps) {
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [regionBoundaries, setRegionBoundaries] = useState<RegionFeatureCollection | null>(null);

  const activeOutbreakCountries = useMemo(
    () => new Set(data.outbreaks.filter((record) => !record.acknowledged).map((record) => record.country)),
    [data.outbreaks],
  );

  const styledRegionBoundaries = useMemo(() => {
    if (!regionBoundaries) return null;
    return styleRegionBoundaries(regionBoundaries, selectedCountry, activeOutbreakCountries);
  }, [activeOutbreakCountries, regionBoundaries, selectedCountry]);

  const points = useMemo<FieldPoint[]>(() => {
    const casePoints: FieldPoint[] = data.cases
      .filter((record) => record.latitude !== undefined && record.longitude !== undefined)
      .map((record) => ({
        id: record.id,
        type: 'case',
        label: record.decision.primaryDiagnosis,
        country: record.country,
        color: record.decision.decision === 'REFER_URGENT' ? '#ef4444' : '#38bdf8',
        latitude: record.latitude!,
        longitude: record.longitude!,
      }));

    const threatPoints: FieldPoint[] = data.threats
      .filter((record) => record.latitude !== undefined && record.longitude !== undefined)
      .map((record) => ({
        id: record.id,
        type: 'threat',
        label: record.threatType,
        country: 'field',
        color: record.urgency === 'CRITICAL' ? '#f97316' : '#f59e0b',
        latitude: record.latitude!,
        longitude: record.longitude!,
      }));

    const outbreakPoints: FieldPoint[] = data.outbreaks
      .filter((record) => record.latitude !== undefined && record.longitude !== undefined)
      .map((record) => ({
        id: record.id,
        type: 'outbreak',
        label: `${record.condition} cluster`,
        country: record.country,
        color: '#dc2626',
        latitude: record.latitude!,
        longitude: record.longitude!,
      }));

    return [...casePoints, ...threatPoints, ...outbreakPoints];
  }, [data]);

  useEffect(() => {
    if (!token || !mapEl.current || mapRef.current) return;
    mapboxgl.accessToken = token;
    mapRef.current = new mapboxgl.Map({
      container: mapEl.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [29.9, 2.5],
      zoom: 3,
    });
    mapRef.current.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [token]);

  useEffect(() => {
    let active = true;
    fetch('/geo/shifa-countries.geojson')
      .then((response) => response.json() as Promise<RegionFeatureCollection>)
      .then((geojson) => {
        if (active) setRegionBoundaries(geojson);
      })
      .catch(() => {
        if (active) setRegionBoundaries(null);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styledRegionBoundaries) return;

    const upsertBoundaries = () => {
      const source = map.getSource(REGION_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
      if (source) {
        source.setData(styledRegionBoundaries);
        return;
      }

      map.addSource(REGION_SOURCE_ID, {
        type: 'geojson',
        data: styledRegionBoundaries,
      });
      map.addLayer({
        id: REGION_FILL_LAYER_ID,
        type: 'fill',
        source: REGION_SOURCE_ID,
        paint: {
          'fill-color': ['get', 'fillColor'],
          'fill-opacity': ['get', 'fillOpacity'],
        },
      });
      map.addLayer({
        id: REGION_LINE_LAYER_ID,
        type: 'line',
        source: REGION_SOURCE_ID,
        paint: {
          'line-color': ['get', 'lineColor'],
          'line-opacity': ['get', 'lineOpacity'],
          'line-width': ['get', 'lineWidth'],
        },
      });
    };

    if (map.isStyleLoaded()) upsertBoundaries();
    else map.once('load', upsertBoundaries);
  }, [styledRegionBoundaries]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const markers: mapboxgl.Marker[] = points.map((point) => {
      const el = document.createElement('div');
      el.className = 'map-marker';
      el.style.background = point.color;
      return new mapboxgl.Marker(el)
        .setLngLat([point.longitude, point.latitude])
        .setPopup(new mapboxgl.Popup({ offset: 16 }).setHTML(`<strong>${point.label}</strong><br/>${point.type}`))
        .addTo(map);
    });

    return () => markers.forEach((marker) => marker.remove());
  }, [points]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (selectedCountry === 'all') {
      const bounds = new mapboxgl.LngLatBounds();
      Object.values(REGION_BOUNDS).forEach(([southWest, northEast]) => {
        bounds.extend(southWest);
        bounds.extend(northEast);
      });
      map.fitBounds(bounds, { padding: 42, maxZoom: 4.2, duration: 850 });
      return;
    }

    const [southWest, northEast] = REGION_BOUNDS[selectedCountry];
    map.fitBounds([southWest, northEast], { padding: 72, maxZoom: 6.6, duration: 850 });
  }, [selectedCountry, token]);

  if (!token) {
    return (
      <div className="coordinate-panel">
        {points.length === 0 ? (
          <div className="empty-state">No geotagged field records have synced yet.</div>
        ) : (
          points.map((point) => (
            <div key={`${point.type}-${point.id}`} className="coordinate-row">
              <span className="dot" style={{ background: point.color }} />
              <div>
                <strong>{point.label}</strong>
                <p>{point.latitude.toFixed(4)}, {point.longitude.toFixed(4)}</p>
              </div>
              <span>{point.type}</span>
            </div>
          ))
        )}
      </div>
    );
  }

  return (
    <div className="operations-map-shell">
      <div ref={mapEl} className="operations-map" />
      <div className="map-legend" aria-label="Map region legend">
        <span><i className="legend-boundary" /> Country boundary</span>
        <span><i className="legend-selected" /> Selected region</span>
        <span><i className="legend-outbreak" /> Active outbreak</span>
      </div>
    </div>
  );
}

function styleRegionBoundaries(
  boundaries: RegionFeatureCollection,
  selectedCountry: 'all' | Country,
  activeOutbreakCountries: Set<Country>,
): RegionFeatureCollection {
  return {
    ...boundaries,
    features: boundaries.features.map((feature) => {
      const country = feature.properties.country;
      const hasOutbreak = activeOutbreakCountries.has(country);
      const selected = selectedCountry === country;
      const deEmphasized = selectedCountry !== 'all' && !selected;

      return {
        ...feature,
        properties: {
          ...feature.properties,
          fillColor: hasOutbreak ? '#dc2626' : selected ? '#22c55e' : '#94a3b8',
          fillOpacity: hasOutbreak ? 0.24 : selected ? 0.14 : deEmphasized ? 0.015 : 0.045,
          lineColor: hasOutbreak ? '#fecaca' : selected ? '#bbf7d0' : '#cbd5e1',
          lineOpacity: hasOutbreak ? 0.88 : selected ? 0.82 : deEmphasized ? 0.2 : 0.48,
          lineWidth: hasOutbreak || selected ? 2.1 : 1.05,
        },
      };
    }),
  };
}
