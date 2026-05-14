import { randomUUID } from 'node:crypto';
/**
 * Outbreak Detection System
 * Uses DBSCAN spatial-temporal clustering to detect disease clusters
 * Feeds into the coordinator dashboard alert system
 */

import { Consultation, OutbreakAlert } from '../types/index.js';

export interface OutbreakRule {
  condition: string;
  aliases: string[];
  minCases: number;
  radiusKm: number;
  windowHours: number;
}

const OUTBREAK_RULES: Record<string, OutbreakRule> = {
  cholera: {
    condition: 'Cholera',
    aliases: ['cholera', 'acute watery diarrhea', 'acute watery diarrhoea', 'awd', 'watery diarrhea', 'watery diarrhoea'],
    minCases: 5,
    radiusKm: 3,
    windowHours: 48,
  },
  malnutrition_emergency: {
    condition: 'Severe Acute Malnutrition',
    aliases: ['severe acute malnutrition', 'sam', 'muac', 'malnutrition'],
    minCases: 10,
    radiusKm: 5,
    windowHours: 168, // 7 days
  },
  measles: {
    condition: 'Measles',
    aliases: ['measles'],
    minCases: 3,
    radiusKm: 10,
    windowHours: 336, // 14 days
  },
  mpox: {
    condition: 'Mpox',
    aliases: ['mpox', 'monkeypox'],
    minCases: 2,
    radiusKm: 5,
    windowHours: 336,
  },
  meningitis: {
    condition: 'Meningitis',
    aliases: ['meningitis', 'meningococcal', 'neck stiffness', 'bulging fontanelle'],
    minCases: 2,
    radiusKm: 5,
    windowHours: 168,
  },
};

function hasCoordinates(c: Consultation): c is Consultation & { latitude: number; longitude: number } {
  return c.latitude !== undefined && c.longitude !== undefined;
}

export class OutbreakDetector {
  detectOutbreaks(cases: Consultation[]): OutbreakAlert[] {
    const alerts: OutbreakAlert[] = [];

    for (const [conditionKey, rule] of Object.entries(OUTBREAK_RULES)) {
      // Filter cases matching the condition
      const matchingCases = cases.filter((c) => this.matchesRule(c, rule));

      if (matchingCases.length < rule.minCases) continue;

      const clusters = this.spatialCluster(matchingCases, rule.radiusKm, rule.windowHours, rule.minCases);

      for (const cluster of clusters) {
        if (cluster.cases.length >= rule.minCases) {
          const alert = this.buildAlert(cluster, rule, conditionKey);
          alerts.push(alert);
        }
      }
    }

    return alerts;
  }

  private spatialCluster(
    cases: Consultation[],
    radiusKm: number,
    windowHours: number,
    minCases: number
  ): Array<{ cases: Consultation[]; center: [number, number] }> {
    const clusters: Array<{ cases: Consultation[]; center: [number, number] }> = [];
    const visited = new Set<string>();
    const assigned = new Set<string>();
    const geoCases = cases.filter((c) => hasCoordinates(c));
    const minPoints = Math.max(1, minCases);

    for (const seed of geoCases) {
      if (visited.has(seed.id)) continue;
      visited.add(seed.id);

      const neighbors = this.regionQuery(seed, geoCases, radiusKm, windowHours);
      if (neighbors.length < minPoints) continue;

      const cluster = this.expandCluster(seed, neighbors, geoCases, visited, assigned, radiusKm, windowHours, minPoints);
      const boundedCluster = this.largestWindow(cluster, windowHours);

      if (boundedCluster.length > 0) {
        const center = this.clusterCenter(boundedCluster);
        clusters.push({ cases: boundedCluster, center });
      }
    }

    return clusters;
  }

  private expandCluster(
    seed: Consultation,
    neighbors: Consultation[],
    cases: Consultation[],
    visited: Set<string>,
    assigned: Set<string>,
    radiusKm: number,
    windowHours: number,
    minPoints: number
  ): Consultation[] {
    const cluster: Consultation[] = [];
    const queue = [...neighbors];

    this.addToCluster(seed, cluster, assigned);

    for (let index = 0; index < queue.length; index += 1) {
      const candidate = queue[index];
      if (!visited.has(candidate.id)) {
        visited.add(candidate.id);
        const candidateNeighbors = this.regionQuery(candidate, cases, radiusKm, windowHours);
        if (candidateNeighbors.length >= minPoints) {
          for (const next of candidateNeighbors) {
            if (!queue.some((item) => item.id === next.id)) queue.push(next);
          }
        }
      }
      this.addToCluster(candidate, cluster, assigned);
    }

    return cluster;
  }

  private regionQuery(
    seed: Consultation,
    cases: Consultation[],
    radiusKm: number,
    windowHours: number
  ): Consultation[] {
    return cases.filter((candidate) => this.isSpatioTemporalNeighbor(seed, candidate, radiusKm, windowHours));
  }

  private isSpatioTemporalNeighbor(
    a: Consultation,
    b: Consultation,
    radiusKm: number,
    windowHours: number
  ): boolean {
    if (!hasCoordinates(a) || !hasCoordinates(b)) return false;
    const distanceKm = this.haversineDistance(a.latitude, a.longitude, b.latitude, b.longitude);
    const timeDiffHours = Math.abs(
      (new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) / 3600000
    );
    return distanceKm <= radiusKm && timeDiffHours <= windowHours;
  }

  private addToCluster(candidate: Consultation, cluster: Consultation[], assigned: Set<string>): void {
    if (assigned.has(candidate.id)) return;
    assigned.add(candidate.id);
    cluster.push(candidate);
  }

  private largestWindow(cases: Consultation[], windowHours: number): Consultation[] {
    const sorted = [...cases].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    let best: Consultation[] = [];
    let start = 0;
    for (let end = 0; end < sorted.length; end += 1) {
      while (
        start <= end &&
        (new Date(sorted[end].createdAt).getTime() - new Date(sorted[start].createdAt).getTime()) / 3600000 > windowHours
      ) {
        start += 1;
      }
      const current = sorted.slice(start, end + 1);
      if (current.length > best.length) best = current;
    }
    return best;
  }

  private matchesRule(c: Consultation, rule: OutbreakRule): boolean {
    const text = [
      c.decision.primaryDiagnosis,
      ...c.decision.differentialDiagnoses,
      c.symptomText,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    const explicitDiagnosis = rule.aliases.some((alias) => text.includes(alias));
    const malnutritionByMeasurement =
      rule.condition === 'Severe Acute Malnutrition' &&
      ((c.patient.muacCm !== undefined && c.patient.muacCm < 11.5) || c.patient.bilateralEdema === true);

    return explicitDiagnosis || malnutritionByMeasurement;
  }

  private haversineDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371; // Earth radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private clusterCenter(cases: Consultation[]): [number, number] {
    let sumLat = 0,
      sumLon = 0,
      count = 0;
    for (const c of cases) {
      if (c.latitude && c.longitude) {
        sumLat += c.latitude;
        sumLon += c.longitude;
        count++;
      }
    }
    return [sumLat / (count || 1), sumLon / (count || 1)];
  }

  private buildAlert(
    cluster: { cases: Consultation[]; center: [number, number] },
    rule: OutbreakRule,
    conditionKey: string
  ): OutbreakAlert {
    const casesByDate = cluster.cases.sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    return {
      id: randomUUID(),
      alertType: this.severityLevel(cluster.cases.length, rule.minCases),
      condition: rule.condition,
      country: cluster.cases[0]?.country || 'sudan',
      caseCount: cluster.cases.length,
      latitude: cluster.center[0],
      longitude: cluster.center[1],
      radiusKm: rule.radiusKm,
      firstCaseAt: casesByDate[0]?.createdAt || new Date().toISOString(),
      alertFiredAt: new Date().toISOString(),
      acknowledged: false,
    };
  }

  private severityLevel(caseCount: number, minCases: number): string {
    if (caseCount >= minCases * 3) return 'EPIDEMIC';
    if (caseCount >= minCases * 2) return 'OUTBREAK';
    return 'CLUSTER';
  }
}

export default OutbreakDetector;
