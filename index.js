import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const distDirectory = fileURLToPath(new URL('./dist/', import.meta.url));
const indexPath = resolve(distDirectory, 'index.html');
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

if (!existsSync(indexPath)) {
  console.error('The production build was not found. Run "npm run build" before starting the server.');
  process.exitCode = 1;
} else {
  const server = createServer(async (request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' });
      response.end('Method not allowed');
      return;
    }

    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const requestedPath = resolve(distDirectory, `.${pathname}`);
      const relativePath = relative(distDirectory, requestedPath);
      if (relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
        response.writeHead(403);
        response.end('Forbidden');
        return;
      }

      let filePath = requestedPath === distDirectory ? indexPath : requestedPath;
      let contents;
      try {
        contents = await readFile(filePath);
      } catch (error) {
        if (!['ENOENT', 'EISDIR'].includes(error.code) || extname(pathname)) {
          response.writeHead(error.code === 'ENOENT' ? 404 : 500);
          response.end(error.code === 'ENOENT' ? 'Not found' : 'Unable to read the requested file');
          if (error.code !== 'ENOENT') console.error('Unable to read a built game file.', error);
          return;
        }

        filePath = indexPath;
        contents = await readFile(indexPath);
      }

      const extension = extname(filePath);
      const cacheControl = filePath === indexPath ? 'no-cache' : 'public, max-age=31536000, immutable';
      response.writeHead(200, {
        'Cache-Control': cacheControl,
        'Content-Length': contents.length,
        'Content-Type': mimeTypes[extension] ?? 'application/octet-stream',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
      });
      response.end(request.method === 'HEAD' ? undefined : contents);
    } catch (error) {
      console.error('The dice-game request could not be served.', error);
      response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('The game could not be loaded.');
    }
  });

  const port = Number(process.env.PORT) || 3000;
  const host = process.env.HOST || '0.0.0.0';
  server.listen(port, host, () => {
    console.log(`Roll the Dice is ready at http://${host}:${port}`);
  });
}
