/**
 * Sync API Routes
 * Handles mobile app sync: uploads consultations/threats, receives outbreaks
 */

import { FastifyPluginAsync } from 'fastify';
import { SyncPayload, SyncResponse, Consultation, ThreatEvent } from '../../types/index.js';
import { OutbreakDetector } from '../../services/outbreakDetector.js';
import {
  listConsultations,
  saveConsultations,
  saveOutbreakAlerts,
  saveThreatEvents,
} from '../../services/memoryStore.js';
import { syncPayloadSchema } from '../schemas.js';

const registerSyncRoutes: FastifyPluginAsync = async (instance) => {
  const detector = new OutbreakDetector();

  // POST /api/sync - mobile app syncs cases and threats
  instance.post('/sync', { schema: { body: syncPayloadSchema } }, async (request, reply) => {
    const payload = request.body as SyncPayload;

    const allConsultations = payload.consultations || [];
    const allThreats = payload.threatEvents || [];
    await saveConsultations(allConsultations);
    await saveThreatEvents(allThreats);

    // Run outbreak detection
    const outbreakAlerts = detector.detectOutbreaks(await listConsultations());
    await saveOutbreakAlerts(outbreakAlerts);

    const response: SyncResponse = {
      success: true,
      syncedCount: allConsultations.length + allThreats.length,
      newSyncToken: `token-${Date.now()}`,
      outbreakAlerts,
    };

    return reply.code(200).send(response);
  });

  // GET /api/sync/status - check sync status
  instance.get('/sync/status', async () => ({
    status: 'ready',
    lastSync: new Date().toISOString(),
    message: 'Sync service operational',
  }));
};

export default registerSyncRoutes;
