const { spawnSync } = require('child_process');
const path = require('path');

function runStep(command, args, options = {}) {
  const label = [command, ...args].join(' ');
  console.log(`\n==> ${label}`);
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options,
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

const root = path.resolve(__dirname, '..');

runStep('node', ['--check', 'src/index.js'], { cwd: root });
runStep('npm', ['--prefix', 'dashboard', 'run', 'build'], { cwd: root });

console.log('\nDeploy checks passed. Ready to deploy.');
