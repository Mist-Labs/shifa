'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bell,
  Database,
  Download,
  FileJson,
  MapPinned,
  RadioTower,
  RefreshCw,
  ShieldAlert,
  Stethoscope,
  Users,
} from 'lucide-react';
import { format } from 'date-fns';
import OperationsMap from '../components/OperationsMap';
import { acknowledgeOutbreak, fetchDashboardData } from '../lib/api';
import { deriveChwActivity, deriveFacilityStatus, formatLastSeen } from '../lib/derive';
import { downloadExport } from '../lib/export';
import { useDashboardStore } from '../lib/store';
import type { Country, DashboardData, OutbreakAlert } from '../lib/types';

const COUNTRIES: Array<'all' | Country> = ['all', 'sudan', 'drc', 'somalia', 'nigeria', 'rwanda'];

export default function DashboardPage() {
  const { data, setData, selectedCountry, setSelectedCountry } = useDashboardStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try {
      const next = await fetchDashboardData();
      setData(next);
      setLastRefresh(new Date().toISOString());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const filtered = useMemo(() => filterData(data, selectedCountry), [data, selectedCountry]);
  const chwActivity = useMemo(() => deriveChwActivity(filtered), [filtered]);
  const facilities = useMemo(() => deriveFacilityStatus(filtered.cases), [filtered.cases]);
  const urgentCases = filtered.cases.filter((record) => record.decision.decision === 'REFER_URGENT').length;
  const criticalThreats = filtered.threats.filter((record) => record.urgency === 'CRITICAL').length;
  const activeOutbreaks = filtered.outbreaks.filter((record) => !record.acknowledged).length;

  const acknowledge = async (alert: OutbreakAlert) => {
    const updated = await acknowledgeOutbreak(alert.id);
    setData({
      ...data,
      outbreaks: data.outbreaks.map((item) => (item.id === alert.id ? updated : item)),
    });
  };

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Coordinator operations</p>
          <h1>SHIFA Field Surveillance</h1>
          <p className="subtle">Synced clinical cases, threat events, outbreak alerts, CHW activity, facility pressure, and WHO-compatible exports.</p>
        </div>
        <div className="topbar-actions">
          <button className="icon-button" onClick={() => void load()} aria-label="Refresh dashboard">
            <RefreshCw size={18} />
          </button>
          <button className="command" onClick={() => downloadExport(filtered, 'csv')}>
            <Download size={16} /> CSV
          </button>
          <button className="command" onClick={() => downloadExport(filtered, 'json')}>
            <FileJson size={16} /> JSON
          </button>
          <button className="command primary" onClick={() => downloadExport(filtered, 'dhis2')}>
            <Database size={16} /> DHIS2
          </button>
        </div>
      </header>

      <section className="control-row">
        <div className="segmented" aria-label="Country filter">
          {COUNTRIES.map((country) => (
            <button
              key={country}
              className={selectedCountry === country ? 'active' : ''}
              onClick={() => setSelectedCountry(country)}
            >
              {country === 'all' ? 'All regions' : country.toUpperCase()}
            </button>
          ))}
        </div>
        <div className={data.ready?.status === 'ready' ? 'status-pill ok' : 'status-pill warn'}>
          <RadioTower size={15} />
          {data.ready?.status ?? 'backend unavailable'}
        </div>
        {lastRefresh && <span className="refresh-note">Updated {format(new Date(lastRefresh), 'HH:mm:ss')}</span>}
      </section>

      {error && (
        <section className="banner error">
          <AlertTriangle size={18} />
          <span>{error}</span>
        </section>
      )}

      <section className="metric-grid" aria-busy={loading}>
        <Metric icon={<Stethoscope />} label="Synced cases" value={filtered.cases.length} tone="blue" />
        <Metric icon={<Bell />} label="Active outbreaks" value={activeOutbreaks} tone="red" />
        <Metric icon={<ShieldAlert />} label="Critical threats" value={criticalThreats} tone="orange" />
        <Metric icon={<Activity />} label="Urgent referrals" value={urgentCases} tone="green" />
        <Metric icon={<Users />} label="Reporting CHWs" value={chwActivity.length} tone="violet" />
      </section>

      <section className="dashboard-grid">
        <div className="panel map-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Combined field layer</p>
              <h2><MapPinned size={18} /> Case and threat map</h2>
            </div>
          </div>
          <OperationsMap data={filtered} selectedCountry={selectedCountry} token={process.env.NEXT_PUBLIC_MAPBOX_TOKEN} />
        </div>

        <div className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">DBSCAN surveillance</p>
              <h2><Bell size={18} /> Outbreak alerts</h2>
            </div>
          </div>
          <div className="list">
            {filtered.outbreaks.length === 0 ? (
              <Empty text="No outbreak alert has crossed threshold." />
            ) : filtered.outbreaks.map((alert) => (
              <article key={alert.id} className={`alert-item ${alert.acknowledged ? 'muted' : ''}`}>
                <div>
                  <strong>{alert.condition}</strong>
                  <p>{alert.caseCount} cases · {alert.country.toUpperCase()} · radius {alert.radiusKm ?? 0}km</p>
                  <span>{format(new Date(alert.alertFiredAt), 'MMM d, HH:mm')}</span>
                </div>
                <button className="small-command" onClick={() => void acknowledge(alert)} disabled={alert.acknowledged}>
                  {alert.acknowledged ? 'Acknowledged' : 'Acknowledge'}
                </button>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="dashboard-grid lower">
        <div className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Active alert feed</p>
              <h2><ShieldAlert size={18} /> Threat timeline</h2>
            </div>
          </div>
          <div className="table">
            <div className="table-head threat">
              <span>Type</span><span>Urgency</span><span>SMS</span><span>Time</span>
            </div>
            {filtered.threats.length === 0 ? <Empty text="No threat events synced." /> : filtered.threats.map((event) => (
              <div className="table-row threat" key={event.id}>
                <span>{event.threatType.replace(/_/g, ' ')}</span>
                <strong className={`urgency ${event.urgency.toLowerCase()}`}>{event.urgency}</strong>
                <span>{event.smsDispatched ? 'sent' : 'not sent'}</span>
                <span>{format(new Date(event.createdAt), 'MMM d HH:mm')}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">CHW monitoring</p>
              <h2><Users size={18} /> Activity</h2>
            </div>
          </div>
          <div className="table">
            <div className="table-head chw">
              <span>CHW</span><span>Status</span><span>Cases</span><span>Last seen</span>
            </div>
            {chwActivity.length === 0 ? <Empty text="No CHW sync records yet." /> : chwActivity.map((chw) => (
              <div className="table-row chw" key={chw.chwId}>
                <span>{chw.chwId}</span>
                <strong className={`status-text ${chw.status}`}>{chw.status}</strong>
                <span>{chw.casesToday}</span>
                <span>{formatLastSeen(chw.lastSeen)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Referral network</p>
            <h2><Activity size={18} /> Facility status</h2>
          </div>
        </div>
        <div className="facility-grid">
          {facilities.map((facility) => (
            <article key={facility.id} className="facility">
              <div>
                <strong>{facility.name}</strong>
                <p>{facility.country.toUpperCase()} · {facility.services.join(', ')}</p>
              </div>
              <span className={facility.urgentReferrals > 0 ? 'load high' : 'load'}>{facility.urgentReferrals} urgent</span>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function Metric({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: string }) {
  return (
    <article className={`metric ${tone}`}>
      <div>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="empty-state">{text}</div>;
}

function filterData(data: DashboardData, country: 'all' | Country): DashboardData {
  if (country === 'all') return data;
  return {
    ready: data.ready,
    cases: data.cases.filter((record) => record.country === country),
    outbreaks: data.outbreaks.filter((record) => record.country === country),
    threats: data.threats,
  };
}
