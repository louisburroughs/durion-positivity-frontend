import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express, { type Request } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { join } from 'node:path';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
app.set('trust proxy', 1);
const angularApp = new AngularNodeAppEngine();

/**
 * Proxy gateway-backed application APIs to the backend API gateway.
 * API_GATEWAY_URL defaults to the Docker Compose service name for local development.
 */
const API_GATEWAY_URL = process.env['API_GATEWAY_URL'] ?? 'http://pos-api-gateway:8080';

app.use(
  '/api',
  createProxyMiddleware({
    target: API_GATEWAY_URL,
    changeOrigin: true,
  }),
);

app.use(
  '/mcp-server',
  createProxyMiddleware({
    target: API_GATEWAY_URL,
    changeOrigin: true,
    // Express strips the mount path from req.url, but the gateway route
    // contract requires the /mcp-server prefix to remain intact.
    pathRewrite: (path, req) =>
      (req as Request).originalUrl ?? `/mcp-server${path}`,
  }),
);

/**
 * Translation assets are not fingerprinted, so they must not be long-cached.
 * Otherwise browsers can keep an older locale JSON after a deployment while
 * the app code expects newer keys, resulting in raw translation keys in the UI.
 */
app.use(
  '/assets/i18n',
  express.static(join(browserDistFolder, 'assets/i18n'), {
    etag: true,
    lastModified: true,
    maxAge: 0,
    redirect: false,
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'no-cache');
    },
  }),
);

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

/**
 * Fallback: serve the client-side rendered shell for any request that
 * AngularNodeAppEngine did not handle (e.g. host-check rejection).
 * All routes use RenderMode.Client, so this is functionally equivalent.
 */
app.use((req, res) => {
  res.sendFile(join(browserDistFolder, 'index.csr.html'));
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
