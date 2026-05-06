import { FastifyInstance } from 'fastify';
import client from 'prom-client';

const startedAt = Date.now();
client.collectDefaultMetrics({ prefix: 'shifa_' });

export interface HealthMetrics {
  uptimeSeconds: number;
  memoryRssBytes: number;
  memoryHeapUsedBytes: number;
  nodeVersion: string;
}

export function getHealthMetrics(): HealthMetrics {
  const memory = process.memoryUsage();
  return {
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    memoryRssBytes: memory.rss,
    memoryHeapUsedBytes: memory.heapUsed,
    nodeVersion: process.version,
  };
}

export function startHealthMetrics(app?: FastifyInstance) {
  app?.decorate('getHealthMetrics', getHealthMetrics);
  app?.get('/metrics', async (_request, reply) => {
    reply.header('Content-Type', client.register.contentType);
    return client.register.metrics();
  });
  return getHealthMetrics;
}

export default startHealthMetrics;
