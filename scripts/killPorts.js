/* eslint-disable no-console */

const { execSync } = require('node:child_process');

function uniq(arr) {
  return Array.from(new Set(arr));
}

function parsePorts(argv) {
  const ports = argv
    .map((x) => Number(String(x).trim()))
    .filter((n) => Number.isInteger(n) && n > 0 && n < 65536);
  return uniq(ports);
}

function run(cmd) {
  return execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
}

function getWindowsPidsForPort(port) {
  // netstat output contains lines like:
  //   TCP    0.0.0.0:3001     0.0.0.0:0      LISTENING       1234
  const out = run('netstat -ano -p tcp');
  const pids = [];

  for (const line of out.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (!trimmed.toUpperCase().startsWith('TCP')) continue;
    if (!trimmed.toUpperCase().includes('LISTENING')) continue;

    const parts = trimmed.split(/\s+/);
    if (parts.length < 5) continue;

    const local = parts[1] || '';
    const pid = Number(parts[4]);

    if (!Number.isInteger(pid) || pid <= 0) continue;
    if (local.endsWith(':' + String(port))) pids.push(pid);
  }

  return uniq(pids);
}

function getUnixPidsForPort(port) {
  // Best effort; if lsof isn't installed, we just return none.
  try {
    const out = run(`lsof -ti tcp:${port}`);
    return uniq(
      out
        .split(/\r?\n/)
        .map((x) => Number(x.trim()))
        .filter((n) => Number.isInteger(n) && n > 0)
    );
  } catch {
    return [];
  }
}

function killWindowsPid(pid) {
  try {
    run(`taskkill /PID ${pid} /F`);
    return true;
  } catch {
    return false;
  }
}

function killUnixPid(pid) {
  try {
    process.kill(pid, 'SIGKILL');
    return true;
  } catch {
    return false;
  }
}

function main() {
  const ports = parsePorts(process.argv.slice(2));
  if (ports.length === 0) {
    console.log('killPorts: no valid ports provided');
    process.exit(0);
  }

  const isWindows = process.platform === 'win32';
  const pidByPort = new Map();

  for (const port of ports) {
    const pids = isWindows ? getWindowsPidsForPort(port) : getUnixPidsForPort(port);
    pidByPort.set(port, pids);
  }

  const allPids = uniq(Array.from(pidByPort.values()).flat());
  if (allPids.length === 0) {
    console.log(`killPorts: ports already free (${ports.join(', ')})`);
    process.exit(0);
  }

  console.log(`killPorts: killing PID(s) [${allPids.join(', ')}] for port(s) [${ports.join(', ')}]`);
  for (const pid of allPids) {
    const ok = isWindows ? killWindowsPid(pid) : killUnixPid(pid);
    if (!ok) console.log(`killPorts: failed to kill ${pid} (may already be stopped)`);
  }

  process.exit(0);
}

main();
