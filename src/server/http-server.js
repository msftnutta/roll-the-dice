import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GameEngine, GameError } from './game-engine.js';

const distDirectory = fileURLToPath(new URL('../../dist/', import.meta.url));
const indexPath = resolve(distDirectory, 'index.html');
const MAX_BODY_BYTES = 8 * 1024;
const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

function sendJson(response, statusCode, data) {
  const body = Buffer.from(JSON.stringify(data));
  response.writeHead(statusCode, {
    'Cache-Control': 'no-store',
    'Content-Length': body.length,
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(body);
}

async function readJson(request) {
  if (!request.headers['content-type']?.toLowerCase().startsWith('application/json')) {
    throw new GameError('Content-Type must be application/json.', 415);
  }

  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > MAX_BODY_BYTES) {
      throw new GameError('Request body is too large.', 413);
    }
    chunks.push(chunk);
  }

  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      throw new Error('JSON body must be an object.');
    }
    return body;
  } catch {
    throw new GameError('Request body must contain a valid JSON object.');
  }
}

function sendMethodNotAllowed(response, allow) {
  response.writeHead(405, {
    Allow: allow,
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify({ error: 'Method not allowed.' }));
}

async function handleApi(request, response, pathname, game) {
  if (pathname === '/api/balance') {
    if (request.method !== 'GET') {
      sendMethodNotAllowed(response, 'GET');
      return;
    }
    sendJson(response, 200, game.getSnapshot());
    return;
  }

  if (pathname === '/api/bet') {
    if (request.method !== 'POST') {
      sendMethodNotAllowed(response, 'POST');
      return;
    }
    const bet = await readJson(request);
    sendJson(response, 201, game.placeBet(bet));
    return;
  }

  if (pathname === '/api/roll') {
    if (request.method !== 'POST') {
      sendMethodNotAllowed(response, 'POST');
      return;
    }
    sendJson(response, 200, game.roll());
    return;
  }

  sendJson(response, 404, { error: 'API endpoint not found.' });
}

export function createGameApiMiddleware({ game = new GameEngine() } = {}) {
  return (request, response, next) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    } catch {
      sendJson(response, 400, { error: 'The request URL is invalid.' });
      return;
    }

    if (!pathname.startsWith('/api/')) {
      next();
      return;
    }

    handleApi(request, response, pathname, game).catch((error) => {
      if (error instanceof GameError) {
        sendJson(response, error.statusCode, { error: error.message });
        return;
      }
      console.error('The dice-game API request failed.', error);
      if (!response.headersSent) {
        sendJson(response, 500, { error: 'The game could not be loaded.' });
      } else {
        response.destroy(error);
      }
    });
  };
}

function sendStaticError(response, statusCode, message) {
  response.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(message);
}

async function handleStatic(request, response, pathname) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    sendMethodNotAllowed(response, 'GET, HEAD');
    return;
  }

  const requestedPath = resolve(distDirectory, `.${pathname}`);
  const relativePath = relative(distDirectory, requestedPath);
  if (relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
    sendStaticError(response, 403, 'Forbidden');
    return;
  }

  let filePath = requestedPath === distDirectory ? indexPath : requestedPath;
  let contents;
  try {
    contents = await readFile(filePath);
  } catch (error) {
    if (!['ENOENT', 'EISDIR'].includes(error.code) || extname(pathname)) {
      sendStaticError(response, error.code === 'ENOENT' ? 404 : 500, error.code === 'ENOENT' ? 'Not found' : 'Unable to read the requested file');
      if (error.code !== 'ENOENT') console.error('Unable to read a built game file.', error);
      return;
    }

    filePath = indexPath;
    contents = await readFile(indexPath);
  }

  const cacheControl = filePath === indexPath ? 'no-cache' : 'public, max-age=31536000, immutable';
  response.writeHead(200, {
    'Cache-Control': cacheControl,
    'Content-Length': contents.length,
    'Content-Type': mimeTypes[extname(filePath)] ?? 'application/octet-stream',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  });
  response.end(request.method === 'HEAD' ? undefined : contents);
}

export function createGameServer({ game = new GameEngine(), serveStatic = true } = {}) {
  if (serveStatic && !existsSync(indexPath)) {
    throw new Error('The production build was not found. Run "npm run build" before starting the server.');
  }

  return createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      if (pathname.startsWith('/api/')) {
        await handleApi(request, response, pathname, game);
        return;
      }
      if (!serveStatic) {
        sendStaticError(response, 404, 'Not found');
        return;
      }
      await handleStatic(request, response, pathname);
    } catch (error) {
      if (error instanceof GameError) {
        sendJson(response, error.statusCode, { error: error.message });
        return;
      }
      console.error('The dice-game request could not be served.', error);
      if (!response.headersSent) {
        sendJson(response, 500, { error: 'The game could not be loaded.' });
      } else {
        response.destroy(error);
      }
    }
  });
}
