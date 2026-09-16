import { createServer } from './createServer.js';
import { PORT } from './config.js';

const { httpServer } = createServer();

httpServer.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
});
