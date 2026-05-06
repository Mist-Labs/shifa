import { FastifyPluginAsync } from 'fastify';
import { processConsultation } from '../../clinic/clinicService.js';
import { consultationRequestSchema, idParamsSchema } from '../schemas.js';

const registerClinicRoutes: FastifyPluginAsync = async (instance) => {
  instance.post('/consultations', { schema: { body: consultationRequestSchema } }, async (request, reply) => {
    const body = request.body as any;
    const result = await processConsultation(body);
    return reply.code(201).send(result);
  });

  instance.get('/consultations/:id', { schema: { params: idParamsSchema } }, async (request, reply) => {
    const { id } = request.params as any;
    return reply.code(404).send({ id, message: 'consultation lookup is available at /api/cases/:id' });
  });
};

export default registerClinicRoutes;
