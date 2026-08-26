import serverless from 'serverless-http';
import app from '../../server/app.js';

// Serve the existing Express app as a Netlify Function.
// Requests to /api/* are proxied here by netlify.toml ([[redirects]]).
export const handler = serverless(app, {
  request(req, event) {
    // Log incoming requests so the Netlify function logs show what is received.
    console.log(`[api] ${req.method} ${req.url}`);
    // Netlify can deliver the path after the function base (e.g. /settings)
    // instead of the full path. Express routes are mounted at /api/..., so
    // re-add the prefix when it is missing.
    if (!req.url.startsWith('/api')) {
      req.url = `/api${req.url}`;
    }
    // Netlify passes the request body as a string (or base64) in event.body.
    // Parse it here because express.json() reads the request stream, which is
    // empty in the serverless runtime. app.js skips express.json() when
    // req.body is already a parsed object.
    if (event && event.body && typeof event.body === 'string') {
      const raw = event.isBase64Encoded
        ? Buffer.from(event.body, 'base64').toString('utf8')
        : event.body;
      try {
        req.body = raw ? JSON.parse(raw) : undefined;
      } catch {
        // Not valid JSON — leave the body as-is so normal error handling applies.
      }
    }
  },
});
