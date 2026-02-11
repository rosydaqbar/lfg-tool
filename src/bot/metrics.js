const os = require('os');

function createMetricsReporter({ setProcessMetrics, intervalMs = 5000 }) {
  let lastCpuUsage = process.cpuUsage();
  let lastCpuTime = process.hrtime.bigint();
  let interval = null;

  function getCpuPercent() {
    const now = process.hrtime.bigint();
    const usage = process.cpuUsage(lastCpuUsage);
    const elapsedUs = Number(now - lastCpuTime) / 1000;

    lastCpuUsage = process.cpuUsage();
    lastCpuTime = now;

    if (elapsedUs <= 0) return 0;
    const totalCpuUs = usage.user + usage.system;
    const cores = os.cpus().length || 1;
    return (totalCpuUs / elapsedUs) * (100 / cores);
  }

  function update() {
    const memory = process.memoryUsage();
    return setProcessMetrics('bot', {
      pid: process.pid,
      cpuPercent: getCpuPercent(),
      memoryRss: memory.rss,
      memoryHeapUsed: memory.heapUsed,
      memoryHeapTotal: memory.heapTotal,
      uptimeSeconds: Math.floor(process.uptime()),
    });
  }

  function start() {
    update().catch((error) => {
      console.error('Failed to update bot metrics:', error);
    });
    if (interval) clearInterval(interval);
    interval = setInterval(() => {
      update().catch((error) => {
        console.error('Failed to update bot metrics:', error);
      });
    }, intervalMs);
  }

  function stop() {
    if (interval) clearInterval(interval);
    interval = null;
  }

  return { start, stop };
}

module.exports = { createMetricsReporter };
