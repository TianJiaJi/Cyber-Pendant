import { createApp } from './api.js';
import { ensureAdminBuild } from './prepare-admin.js';

ensureAdminBuild();
const { server, config } = createApp();

server.listen(config.port, () => {
  console.log(`Cyber-Pendant API running at http://localhost:${config.port}`);
  console.log(`SQLite database: ${config.databasePath}`);
  console.log(`Default frontend base URL: ${config.frontendBaseUrl}`);
  console.log(`Admin console path: ${config.adminBasePath}`);
  if (config.usingEphemeralTokenSecret) {
    console.log('TOKEN_SECRET is not set; using an ephemeral local secret for this process.');
  }
});
