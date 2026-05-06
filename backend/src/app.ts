import fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import websocket from '@fastify/websocket';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { registerRoutes } from './routes/index.js';
import { errorHandler } from './middleware/errorHandler.js';
import { setupWebSocket } from './services/websocket.js';
import { startHealthMetrics } from './services/healthMetrics.js';
import { AppConfig, loadConfig } from './config.js';
import { closePostgres } from './services/postgres.js';
import { registerHmacAuth } from './middleware/hmacAuth.js';

export async function buildApp(config: AppConfig = loadConfig()): Promise<FastifyInstance> {
  const app = fastify({
    logger: config.env === 'test' ? false : true,
    ajv: {
      customOptions: {
        removeAdditional: 'all',
        coerceTypes: true,
        useDefaults: true,
      },
    },
  });

  await app.register(helmet);
  await app.register(cors, { origin: config.corsOrigins });
  await app.register(rateLimit, {
    max: config.env === 'test' ? 10000 : 300,
    timeWindow: '1 minute',
  });
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'SHIFA Coordinator API',
        version: '1.0.0',
      },
    },
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });
  await app.register(websocket);
  await app.register(multipart, { limits: { fileSize: config.maxUploadBytes } });
  await app.register(jwt, { secret: config.jwtSecret });
  registerHmacAuth(app, config);

  app.setErrorHandler(errorHandler);
  await registerRoutes(app);
  await setupWebSocket(app);
  startHealthMetrics(app);
  app.addHook('onClose', async () => {
    await closePostgres();
  });

  return app;
}
