'use client';

import { useEffect, useMemo, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import type { DashboardData } from '../lib/types';

interface OperationsMapProps {
  data: DashboardData;
  token?: string;
}

export default function OperationsMap({ data, token }: OperationsMapProps) {
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const points = useMemo(() => {
    const casePoints = data.cases
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

    const threatPoints = data.threats
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

    const outbreakPoints = data.outbreaks
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
    if (!mapRef.current) return;
    const markers: mapboxgl.Marker[] = points.map((point) => {
      const el = document.createElement('div');
      el.className = 'map-marker';
      el.style.background = point.color;
      const marker = new mapboxgl.Marker(el)
        .setLngLat([point.longitude, point.latitude])
        .setPopup(new mapboxgl.Popup({ offset: 16 }).setHTML(`<strong>${point.label}</strong><br/>${point.type}`))
        .addTo(mapRef.current!);
      return marker;
    });

    if (points.length > 0) {
      const bounds = new mapboxgl.LngLatBounds();
      points.forEach((point) => bounds.extend([point.longitude, point.latitude]));
      mapRef.current.fitBounds(bounds, { padding: 64, maxZoom: 8, duration: 0 });
    }

    return () => markers.forEach((marker) => marker.remove());
  }, [points]);

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

  return <div ref={mapEl} className="operations-map" />;
}
