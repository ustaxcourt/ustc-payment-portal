const { spawn } = require('node:child_process');

const commands = [
  { name: 'pay-gov', command: 'node', args: ['scripts/start-pay-gov-test-server.js'] },
  { name: 'docker', command: 'npm', args: ['run', 'docker'] },
  { name: 'portal', command: 'node', args: ['node_modules/ts-node/dist/bin.js', 'src/devServer.ts'] },
];

const children = [];
let shuttingDown = false;
let exitCode = 0;

function stopChildren(signal = 'SIGTERM') {
  for (const child of children) {
    if (!child.killed) {
      child.kill(signal);
    }
  }
}

function shutdown(code = 0, signal = 'SIGTERM') {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  exitCode = code;
  stopChildren(signal);
}

for (const item of commands) {
  const child = spawn(item.command, item.args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  });

  child.on('exit', (code, signal) => {
    if (shuttingDown) {
      return;
    }

    if (signal) {
      shutdown(0, 'SIGTERM');
      return;
    }

    if (code && code !== 0) {
      shutdown(code, 'SIGTERM');
    }
  });

  child.on('error', error => {
    console.error(`[start:server] Failed to start ${item.name}:`, error);
    shutdown(1, 'SIGTERM');
  });

  children.push(child);
}

process.on('SIGINT', () => shutdown(130, 'SIGINT'));
process.on('SIGTERM', () => shutdown(143, 'SIGTERM'));

let closedChildren = 0;
for (const child of children) {
  child.on('close', () => {
    closedChildren += 1;
    if (closedChildren === children.length) {
      process.exit(exitCode);
    }
  });
}
