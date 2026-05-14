/**
 * Cases API Routes
 * Clinical case management: list, retrieve, analyze
 */

import { FastifyPluginAsync } from 'fastify';
import { randomUUID } from 'node:crypto';
import { Consultation, ConsultationRequest } from '../../types/index.js';
import { ClinicalEngine } from '../../clinic/engine.js';
import { getConsultation, listConsultations, saveConsultations } from '../../services/memoryStore.js';
import { consultationRequestSchema, idParamsSchema } from '../schemas.js';

const registerCasesRoutes: FastifyPluginAsync = async (instance) => {
  const engine = new ClinicalEngine();

  // POST /api/cases/analyze - analyze a clinical presentation
  instance.post<{ Body: ConsultationRequest }>(
    '/analyze',
    { schema: { body: consultationRequestSchema } },
    async (request, reply) => {
    const body = request.body;
    const result = await engine.processConsultation(body);
    const consultation: Consultation = {
      id: randomUUID(),
      chwId: body.chwId,
      patient: body.patient,
      symptomText: body.symptomText,
      imagePath: body.imagePath,
      decision: result,
      country: body.country,
      language: body.language,
      createdAt: new Date().toISOString(),
      synced: false,
    };

    await saveConsultations([consultation]);

    return reply.code(200).send({ success: true, decision: result });
    }
  );

  // GET /api/cases - list cases
  instance.get('/list', async () => {
    const cases = await listConsultations();
    return {
      cases,
      total: cases.length,
    };
  });

  // GET /api/cases/:id - retrieve specific case
  instance.get<{ Params: { id: string } }>('/:id', { schema: { params: idParamsSchema } }, async (request, reply) => {
    const { id } = request.params;
    const found = await getConsultation(id);
    if (!found) return reply.code(404).send({ id, message: 'case not found' });
    return found;
  });
};

export default registerCasesRoutes;
