const { spawn, spawnSync } = require('node:child_process');
const readline = require('node:readline/promises');
const { stdin, stdout } = require('node:process');

const REQUIRED_PORTS = [3366, 8080, 5433];

const commands = [
  { name: 'pay-gov', command: 'node', args: ['scripts/start-pay-gov-test-server.js'] },
  { name: 'docker', command: 'npm', args: ['run', 'docker'] },
  { name: 'portal', command: 'node', args: ['node_modules/ts-node/dist/bin.js', 'src/devServer.ts'] },
];

const children = [];
let shuttingDown = false;
let exitCode = 0;

function getListeningPids(port) {
  const result = spawnSync('lsof', ['-nP', '-ti', `tcp:${port}`, '-sTCP:LISTEN'], {
    encoding: 'utf8',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0 && !result.stdout.trim()) {
    return [];
  }

  return result.stdout
    .split(/\r?\n/)
    .map(line => Number(line.trim()))
    .filter(Number.isInteger);
}

function listUsedPorts() {
  return REQUIRED_PORTS.map(port => ({
    port,
    pids: getListeningPids(port),
  })).filter(item => item.pids.length > 0);
}

function killPids(pids) {
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch (error) {
      if (error && error.code !== 'ESRCH') {
        throw error;
      }
    }
  }
}

async function ensurePortsAvailable() {
  const usedPorts = listUsedPorts();
  if (usedPorts.length === 0) {
    return true;
  }

  const details = usedPorts
    .map(item => `port ${item.port} -> pid(s): ${item.pids.join(', ')}`)
    .join('; ');

  const shouldAutoKill = ['1', 'true', 'yes', 'y'].includes(
    String(process.env.AUTO_KILL_PORTS || '').toLowerCase()
  );

  if (shouldAutoKill) {
    const pidsToKill = [...new Set(usedPorts.flatMap(item => item.pids))];
    console.log(`[start:server] AUTO_KILL_PORTS enabled. Stopping: ${details}`);
    killPids(pidsToKill);
    return true;
  }

  if (!stdin.isTTY) {
    console.error(`[start:server] Required ports are in use: ${details}`);
    console.error('[start:server] Re-run with AUTO_KILL_PORTS=true to auto-stop them.');
    return false;
  }

  const rl = readline.createInterface({ input: stdin, output: stdout });
  const answer = await rl.question(
    `[start:server] Required ports are in use (${details}). Kill these processes now? [y/N] `
  );
  rl.close();

  if (!['y', 'yes'].includes(answer.trim().toLowerCase())) {
    console.error('[start:server] Startup cancelled because required ports are occupied.');
    return false;
  }

  const pidsToKill = [...new Set(usedPorts.flatMap(item => item.pids))];
  killPids(pidsToKill);
  return true;
}

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

async function main() {
  const ready = await ensurePortsAvailable();
  if (!ready) {
    process.exit(1);
    return;
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
        if (item.name === 'pay-gov') {
          console.error(
            '[start:server] pay-gov exited unexpectedly. Existing /pay token links may now be invalid because local pay-gov state is in-memory.'
          );
        }
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
}

main().catch(error => {
  console.error('[start:server] Startup failed:', error);
  process.exit(1);
});
