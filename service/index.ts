import './env.js';
import http from 'node:http';
import { host, port } from './config.js';
import { send } from './http-utils.js';
import { handleApiRequest } from './router.js';
import { bootstrapStorage } from './storage.js';

await bootstrapStorage();

const server = http.createServer((request, response) => {
  handleApiRequest(request, response).catch((error: unknown) => {
    console.error(error);
    send(response, 500, { message: error instanceof Error ? error.message : 'Internal server error' });
  });
});

server.listen(port, host, () => {
  console.log(`Frontend Agent Admin Service listening at http://${host}:${port}`);
});
