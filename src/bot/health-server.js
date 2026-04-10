const http = require('http');

function createHealthServer({ port, host = '0.0.0.0' } = {}) {
  let server = null;
  const shouldLogRequests = process.env.HEALTH_LOG_REQUESTS === 'true';
  const shouldLogKeepaliveRequests = process.env.HEALTH_LOG_KEEPALIVE !== 'false';

  function isGithubKeepalive(req) {
    const ua = String(req.headers['user-agent'] || '');
    const accept = String(req.headers.accept || '');
    const cacheControl = String(req.headers['cache-control'] || '');
    const pragma = String(req.headers.pragma || '');
    const method = String(req.method || '').toUpperCase();
    const url = String(req.url || '');

    return (
      (method === 'GET' || method === 'HEAD')
      && (url === '/' || url.startsWith('/?'))
      && ua.includes('Chrome/121.0.0.0')
      && accept.includes('application/json')
      && cacheControl.toLowerCase().includes('no-cache')
      && pragma.toLowerCase().includes('no-cache')
    );
  }

  function getClientIp(req) {
    const forwardedFor = String(req.headers['x-forwarded-for'] || '');
    if (forwardedFor) {
      return forwardedFor.split(',')[0].trim();
    }
    return req.socket?.remoteAddress || 'unknown';
  }

  function handleRequest(req, res) {
    const userAgent = req.headers['user-agent'] || '';
    const clientIp = getClientIp(req);
    if (shouldLogRequests) {
      console.log(
        `Health check ${req.method} ${req.url} from ${clientIp} ${userAgent}`
      );
    } else if (shouldLogKeepaliveRequests && isGithubKeepalive(req)) {
      const accept = req.headers.accept || '';
      console.log(
        `Keepalive ping detected ${req.method} ${req.url} from ${clientIp} accept=${accept} ua=${userAgent}`
      );
    }

    if (req.method === 'HEAD') {
      res.statusCode = 200;
      res.end();
      return;
    }

    const payload = JSON.stringify({
      status: 'ok',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    });

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.end(payload);
  }

  function start() {
    if (server) return;

    const explicitPort = port ?? process.env.PORT ?? process.env.HEALTH_PORT;
    const ports = [];
    if (explicitPort !== undefined && explicitPort !== null && `${explicitPort}`.length) {
      const resolvedPort = Number(explicitPort);
      if (!resolvedPort || Number.isNaN(resolvedPort)) {
        console.log('Health server disabled: invalid PORT.');
        return;
      }
      ports.push(resolvedPort);
    } else {
      ports.push(80, 8000);
    }

    const tryListen = (index) => {
      if (index >= ports.length) {
        console.log('Health server disabled: no available port.');
        return;
      }

      const targetPort = ports[index];
      const nextServer = http.createServer(handleRequest);

      nextServer.on('error', (error) => {
        if (
          ports.length > 1 &&
          (error.code === 'EACCES' || error.code === 'EADDRINUSE')
        ) {
          nextServer.close(() => {
            if (server === nextServer) server = null;
            tryListen(index + 1);
          });
          return;
        }
        console.error('Health server error:', error);
      });

      nextServer.listen(targetPort, host, () => {
        server = nextServer;
        console.log(`Health server listening on ${host}:${targetPort}`);
      });

      server = nextServer;
    };

    tryListen(0);
  }

  function stop() {
    if (!server) return;
    server.close(() => {
      server = null;
    });
  }

  return { start, stop };
}

module.exports = { createHealthServer };
