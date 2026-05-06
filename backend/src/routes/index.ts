import { FastifyInstance } from 'fastify';
import registerClinicRoutes from './api/clinic.js';
import registerThreatRoutes from './api/threat.js';
import registerSyncRoutes from './api/sync.js';
import registerCasesRoutes from './api/cases.js';
import registerOutbreaksRoutes from './api/outbreaks.js';
import { getHealthMetrics } from '../services/healthMetrics.js';
import { checkPostgres } from '../services/postgres.js';

export async function registerRoutes(app: FastifyInstance) {
  app.get('/health', async () => ({
    status: 'ok',
    service: 'shifa-backend',
    version: '1.0.0',
    ...getHealthMetrics(),
  }));

  app.get('/ready', async (request, reply) => {
    const postgres = await checkPostgres();
    const ready = postgres !== 'error';
    return reply.code(ready ? 200 : 503).send({
      status: ready ? 'ready' : 'degraded',
      dependencies: {
        api: 'ok',
        postgres,
      },
    });
  });

  // API root
  app.register(async function (instance) {
    instance.get('/', async () => ({ message: 'SHIFA backend API v1.0' }));
  }, { prefix: '/api' });

  // Register modular API routes
  await app.register(registerClinicRoutes, { prefix: '/api/clinic' });
  await app.register(registerThreatRoutes, { prefix: '/api/threat' });
  await app.register(registerSyncRoutes, { prefix: '/api' });
  await app.register(registerCasesRoutes, { prefix: '/api/cases' });
  await app.register(registerOutbreaksRoutes, { prefix: '/api/outbreaks' });
}

export default registerRoutes;
