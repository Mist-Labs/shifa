import { FastifyReply, FastifyRequest } from 'fastify';

export function errorHandler(error: Error, request: FastifyRequest, reply: FastifyReply) {
  request.log?.error(error);
  const status = (error as any).statusCode || 500;
  const isServerError = status >= 500;
  const message =
    isServerError && process.env.NODE_ENV === 'production'
      ? 'Internal Server Error'
      : error.message || 'Internal Server Error';

  void reply.status(status).send({
    error: message,
    statusCode: status,
    requestId: request.id,
  });
}

export default errorHandler;
