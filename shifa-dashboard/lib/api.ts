import type { BackendReady, DashboardData, OutbreakAlert, ShifaCase, ThreatEvent } from './types';

const DEFAULT_API_BASE = 'http://localhost:3000';

export function getApiBase(): string {
  return (process.env.NEXT_PUBLIC_SHIFA_API_BASE || DEFAULT_API_BASE).replace(/\/$/, '');
}

function getBrowserApiBase(): string {
  if (typeof window === 'undefined') return getApiBase();
  return '';
}

export async function fetchDashboardData(): Promise<DashboardData> {
  const [cases, threats, outbreaks, ready] = await Promise.all([
    getJson<{ cases: ShifaCase[] }>(`${getBrowserApiBase()}/api/shifa/cases/list`).then((r) => r.cases),
    getJson<{ events: ThreatEvent[] }>(`${getBrowserApiBase()}/api/shifa/threat/events`).then((r) => r.events),
    getJson<{ alerts: OutbreakAlert[] }>(`${getBrowserApiBase()}/api/shifa/outbreaks/list`).then((r) => r.alerts),
    getJson<BackendReady>(`${getApiBase()}/ready`).catch(() => null),
  ]);

  return { cases, threats, outbreaks, ready };
}

export async function acknowledgeOutbreak(id: string): Promise<OutbreakAlert> {
  return getJson<OutbreakAlert>(`${getBrowserApiBase()}/api/shifa/outbreaks/${encodeURIComponent(id)}/acknowledge`, {
    method: 'POST',
  });
}

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.headers || {}),
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${url}`);
  }

  return response.json() as Promise<T>;
}
