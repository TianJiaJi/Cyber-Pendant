import { createApp } from './api.js';

const { server, config } = createApp();

server.listen(config.port, () => {
  console.log(`Cyber-Pendant API running at http://localhost:${config.port}`);
  console.log(`SQLite database: ${config.databasePath}`);
  console.log(`Default frontend base URL: ${config.frontendBaseUrl}`);
  if (config.usingEphemeralTokenSecret) {
    console.log('TOKEN_SECRET is not set; using an ephemeral local secret for this process.');
  }
});
