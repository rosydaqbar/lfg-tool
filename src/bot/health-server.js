const http = require('http');

function createHealthServer({ port, host = '0.0.0.0' } = {}) {
  let server = null;

  function handleRequest(req, res) {
    const userAgent = req.headers["user-agent"] || "";
    const remoteAddress = req.socket?.remoteAddress || "unknown";
    console.log(
      `Health check ${req.method} ${req.url} from ${remoteAddress} ${userAgent}`
    );

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
