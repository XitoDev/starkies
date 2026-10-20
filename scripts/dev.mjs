import { spawn } from 'node:child_process';

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const processes = [
  spawn(npx, ['vercel', 'dev', '--listen', '3000'], { stdio: 'inherit' }),
  spawn(npx, ['ng', 'serve', 'catalog', '--proxy-config', 'proxy.conf.json'], { stdio: 'inherit' }),
];

let stopping = false;
function stopAll(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of processes) {
    if (child.exitCode === null && !child.killed) child.kill('SIGTERM');
  }
  process.exitCode = exitCode;
}

for (const child of processes) {
  child.on('error', error => {
    console.error('Could not start local development service:', error.message);
    stopAll(1);
  });
  child.on('exit', (code, signal) => {
    if (!stopping) {
      console.error(`Local development service stopped (code: ${code}, signal: ${signal}).`);
      stopAll(code ?? 1);
    }
  });
}

process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));
