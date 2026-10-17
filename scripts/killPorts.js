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

function getListeningPidsWin() {
  const out = run('netstat -ano');
  const portMap = new Map();

  for (const line of out.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (!trimmed.toUpperCase().startsWith('TCP')) continue;
    if (!trimmed.toUpperCase().includes('LISTENING')) continue;

    const parts = trimmed.split(/\s+/);
    if (parts.length < 5) continue;

    const localAddr = parts[1];
    const pid = Number(parts[parts.length - 1]);

    if (!localAddr || !Number.isInteger(pid) || pid <= 0) continue;

    const lastColonIdx = localAddr.lastIndexOf(':');
    if (lastColonIdx === -1) continue;

    const portStr = localAddr.slice(lastColonIdx + 1);
    const port = Number(portStr);

    if (Number.isInteger(port)) {
      if (!portMap.has(port)) portMap.set(port, []);
      portMap.get(port).push(pid);
    }
  }
  return portMap;
}

function getUnixPidsForPort(port) {
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
    run(`taskkill /PID ${pid} /F /T`);
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
  let pidsToKill = [];

  if (isWindows) {
    const listening = getListeningPidsWin();
    for (const port of ports) {
      if (listening.has(port)) {
        pidsToKill.push(...listening.get(port));
      }
    }
  } else {
    for (const port of ports) {
      pidsToKill.push(...getUnixPidsForPort(port));
    }
  }

  const uniquePids = uniq(pidsToKill);

  if (uniquePids.length === 0) {
    console.log(`killPorts: ports already free (${ports.join(', ')})`);
    process.exit(0);
  }

  console.log(`killPorts: killing PID(s) [${uniquePids.join(', ')}]`);
  for (const pid of uniquePids) {
    const ok = isWindows ? killWindowsPid(pid) : killUnixPid(pid);
    if (!ok) console.log(`killPorts: failed to kill ${pid} (may already be stopped)`);
  }

  process.exit(0);
}

main();
