const http = require('http');

function createHealthServer({ port = process.env.PORT, host = '0.0.0.0' } = {}) {
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
    const resolvedPort = Number(port);
    if (!resolvedPort || Number.isNaN(resolvedPort)) {
      console.log('Health server disabled: PORT not set.');
      return;
    }

    if (server) return;

    server = http.createServer(handleRequest);
    server.on('error', (error) => {
      console.error('Health server error:', error);
    });
    server.listen(resolvedPort, host, () => {
      console.log(`Health server listening on ${host}:${resolvedPort}`);
    });
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
