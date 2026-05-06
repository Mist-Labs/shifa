import { FastifyInstance } from 'fastify';

export async function setupWebSocket(app: FastifyInstance) {
  // simple example websocket route
  app.get('/ws', { websocket: true }, (connection, req) => {
    connection.socket.on('message', (message: string) => {
      connection.socket.send(`echo: ${message}`);
    });
  });
}

export default setupWebSocket;
