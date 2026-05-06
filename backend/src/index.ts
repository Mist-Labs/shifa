import 'dotenv/config';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';

async function main() {
  const config = loadConfig();
  const app = await buildApp(config);
  await app.listen({ port: config.port, host: config.host });
  app.log.info(`SHIFA backend running on port ${config.port}`);

  const shutdown = async (signal: NodeJS.Signals) => {
    app.log.info({ signal }, 'shutting down SHIFA backend');
    await app.close();
    process.exit(0);
  };

  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
