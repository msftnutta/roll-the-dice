import { createGameServer } from './src/server/http-server.js';

const server = createGameServer();
const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || '0.0.0.0';

server.listen(port, host, () => {
  console.log(`Roll the Dice is ready at http://${host}:${port}`);
});
