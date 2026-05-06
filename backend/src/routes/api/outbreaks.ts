/**
 * Outbreaks API Routes
 * Outbreak alert management
 */

import { FastifyPluginAsync } from 'fastify';
import { acknowledgeOutbreakAlert, listOutbreakAlerts } from '../../services/memoryStore.js';
import { idParamsSchema } from '../schemas.js';

const registerOutbreaksRoutes: FastifyPluginAsync = async (instance) => {
  // GET /api/outbreaks - list outbreak alerts
  instance.get('/list', async () => ({
    alerts: listOutbreakAlerts(),
    total: listOutbreakAlerts().length,
  }));

  // GET /api/outbreaks/:id - get specific outbreak
  instance.get<{ Params: { id: string } }>('/:id', { schema: { params: idParamsSchema } }, async (request, reply) => {
    const { id } = request.params;
    const found = listOutbreakAlerts().find((alert) => alert.id === id);
    if (found) return found;
    return reply.code(404).send({ id, message: 'outbreak alert not found' });
  });

  // POST /api/outbreaks/:id/acknowledge - mark outbreak as reviewed
  instance.post<{ Params: { id: string } }>('/:id/acknowledge', { schema: { params: idParamsSchema } }, async (request, reply) => {
    const { id } = request.params;
    const updated = acknowledgeOutbreakAlert(id);
    if (!updated) return reply.code(404).send({ id, message: 'outbreak alert not found' });
    return reply.code(200).send({ ...updated, acknowledgedAt: new Date().toISOString() });
  });
};

export default registerOutbreaksRoutes;
