import { FastifyPluginAsync } from 'fastify';
import { reportThreat } from '../../threat/guardService.js';
import { getThreatEvent, listThreatEvents, saveThreatEvent } from '../../services/memoryStore.js';
import { idParamsSchema, threatEventSchema } from '../schemas.js';

const registerThreatRoutes: FastifyPluginAsync = async (instance) => {
  instance.post('/events', { schema: { body: threatEventSchema } }, async (request, reply) => {
    const body = request.body as any;
    const result = await reportThreat(body);
    saveThreatEvent(result.event);
    return reply.code(201).send(result);
  });

  instance.get('/events', async () => ({
    events: listThreatEvents(),
    total: listThreatEvents().length,
  }));

  instance.get('/events/:id', { schema: { params: idParamsSchema } }, async (request, reply) => {
    const { id } = request.params as any;
    const found = getThreatEvent(id);
    if (!found) return reply.code(404).send({ id, message: 'threat event not found' });
    return found;
  });
};

export default registerThreatRoutes;
