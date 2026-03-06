#!/usr/bin/env node

import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import readline from "node:readline/promises";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const REGISTRY_PATH =
  process.env.PROGRAM_HUB_REGISTRY ?? path.resolve(REPO_ROOT, "registry", "programs.json");
const STATE_DIR = process.env.PROGRAM_HUB_STATE_DIR ?? "/tmp/program-hub";

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function stateFilePath(programName) {
  return path.join(STATE_DIR, `${slugify(programName)}.json`);
}

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function expandTemplate(template, values) {
  return template.replace(/\$\{([A-Z_]+)\}/g, (_, key) => values[key] ?? "");
}

function parsePort(text) {
  const match = text.match(/\b([1-9][0-9]{1,4})\b/);
  if (match === null) {
    throw new Error(`Unable to parse port from: ${text.trim()}`);
  }
  const port = Number.parseInt(match[1], 10);
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    throw new Error(`Parsed invalid port: ${match[1]}`);
  }
  return String(port);
}

async function runCommand(cmd, args, options = {}) {
  const { cwd = process.cwd(), allowFailure = false } = options;
  return await new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0 || allowFailure) {
        resolve({ code: code ?? 1, stdout, stderr });
        return;
      }
      reject(
        new Error(
          `${cmd} ${args.join(" ")} failed with code ${code}\n${stderr || stdout || "(no output)"}`
        )
      );
    });
  });
}

async function ensureStateDir() {
  await fs.mkdir(STATE_DIR, { recursive: true });
}

async function readRegistry() {
  const raw = await fs.readFile(REGISTRY_PATH, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed.programs)) {
    throw new Error(`Invalid registry at ${REGISTRY_PATH}: missing "programs" array`);
  }

  return parsed.programs.map((program) => {
    if (typeof program.name !== "string" || program.name.trim() === "") {
      throw new Error(`Invalid registry entry: each program needs a non-empty "name"`);
    }
    if (typeof program.startCommand !== "string" || program.startCommand.trim() === "") {
      throw new Error(`Invalid registry entry "${program.name}": missing "startCommand"`);
    }
    return {
      name: program.name.trim(),
      cwd:
        typeof program.cwd === "string" && program.cwd.trim() !== ""
          ? program.cwd.trim()
          : ".",
      serviceName:
        typeof program.serviceName === "string" && program.serviceName.trim() !== ""
          ? program.serviceName.trim()
          : program.name.trim(),
      host:
        typeof program.host === "string" && program.host.trim() !== ""
          ? program.host.trim()
          : "0.0.0.0",
      startCommand: program.startCommand
    };
  });
}

function resolveProgramCwd(program) {
  if (path.isAbsolute(program.cwd)) {
    return program.cwd;
  }
  return path.resolve(REPO_ROOT, program.cwd);
}

async function readState(programName) {
  const file = stateFilePath(programName);
  try {
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw);
    return {
      file,
      pid: typeof parsed.pid === "number" ? parsed.pid : null,
      port: typeof parsed.port === "string" ? parsed.port : null,
      startedAt: typeof parsed.startedAt === "string" ? parsed.startedAt : null,
      command: typeof parsed.command === "string" ? parsed.command : null
    };
  } catch {
    return {
      file,
      pid: null,
      port: null,
      startedAt: null,
      command: null
    };
  }
}

async function writeState(programName, state) {
  const file = stateFilePath(programName);
  await fs.writeFile(file, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

async function clearState(programName) {
  const file = stateFilePath(programName);
  await fs.rm(file, { force: true });
}

async function getOrAllocPort(serviceName) {
  const existing = await runCommand("portbroker", ["get", "--name", serviceName], {
    allowFailure: true
  });
  if (existing.code === 0 && existing.stdout.trim() !== "") {
    return parsePort(existing.stdout);
  }

  const allocated = await runCommand("portbroker", ["alloc", "--name", serviceName], {
    allowFailure: false
  });
  return parsePort(allocated.stdout);
}

async function getProgramStatus(program) {
  const state = await readState(program.name);
  const running = state.pid !== null && isProcessAlive(state.pid);
  if (!running && state.pid !== null) {
    await clearState(program.name);
  }
  return {
    program,
    running,
    pid: running ? state.pid : null,
    port: running ? state.port : null,
    startedAt: running ? state.startedAt : null
  };
}

function printStatuses(statuses) {
  const rows = statuses.map((status) => ({
    name: status.program.name,
    status: status.running ? "running" : "stopped",
    port: status.port ?? "-",
    pid: status.pid === null ? "-" : String(status.pid),
    cwd: resolveProgramCwd(status.program)
  }));

  const nameWidth = Math.max(4, ...rows.map((row) => row.name.length));
  const stateWidth = Math.max(6, ...rows.map((row) => row.status.length));
  const portWidth = Math.max(4, ...rows.map((row) => row.port.length));
  const pidWidth = Math.max(3, ...rows.map((row) => row.pid.length));
  console.log(
    `${"name".padEnd(nameWidth)}  ${"state".padEnd(stateWidth)}  ${"port".padEnd(portWidth)}  ${"pid".padEnd(pidWidth)}  cwd`
  );
  for (const row of rows) {
    console.log(
      `${row.name.padEnd(nameWidth)}  ${row.status.padEnd(stateWidth)}  ${row.port.padEnd(portWidth)}  ${row.pid.padEnd(pidWidth)}  ${row.cwd}`
    );
  }
}

async function startProgram(program) {
  const status = await getProgramStatus(program);
  if (status.running) {
    console.log(
      `${program.name} is already running on port ${status.port ?? "unknown"} (pid ${status.pid}).`
    );
    return;
  }

  const port = await getOrAllocPort(program.serviceName);
  const host = program.host || "0.0.0.0";
  const resolvedCwd = resolveProgramCwd(program);
  const command = expandTemplate(program.startCommand, {
    PORT: port,
    HOST: host,
    SERVICE: program.serviceName
  });

  const child = spawn(command, {
    cwd: resolvedCwd,
    shell: true,
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      PORT: port,
      HOST: host
    }
  });
  child.unref();

  await writeState(program.name, {
    name: program.name,
    serviceName: program.serviceName,
    pid: child.pid,
    port,
    host,
    command,
    cwd: resolvedCwd,
    startedAt: new Date().toISOString()
  });

  console.log(
    `Started ${program.name} on ${host}:${port} (pid ${child.pid}).`
  );
  console.log(`Local URL: http://127.0.0.1:${port}`);
}

async function stopProgram(program) {
  const status = await getProgramStatus(program);
  if (!status.running || status.pid === null) {
    await clearState(program.name);
    console.log(`${program.name} is not running.`);
    return;
  }

  const pid = status.pid;
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    await clearState(program.name);
    console.log(`${program.name} was not running (stale state removed).`);
    return;
  }

  const deadline = Date.now() + 2000;
  while (Date.now() < deadline && isProcessAlive(pid)) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  if (isProcessAlive(pid)) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // ignore
    }
  }

  await clearState(program.name);
  console.log(`Stopped ${program.name} (pid ${pid}).`);
}

function findProgram(programs, name) {
  return (
    programs.find((program) => program.name === name) ??
    programs.find((program) => slugify(program.name) === slugify(name))
  );
}

function printHelp() {
  console.log(`program-hub

Usage:
  node scripts/program-hub.mjs list
  node scripts/program-hub.mjs start <name>
  node scripts/program-hub.mjs stop <name>
  node scripts/program-hub.mjs menu

Notes:
  - Ports are always resolved through portbroker (get/alloc).
  - Registry path: ${REGISTRY_PATH}
  - State dir: ${STATE_DIR}
`);
}

async function runMenu(programs) {
  const statuses = await Promise.all(programs.map((program) => getProgramStatus(program)));
  const startable = statuses.filter((status) => !status.running);

  if (startable.length === 0) {
    console.log("No stopped programs in registry.");
    printStatuses(statuses);
    return;
  }

  console.log("Stopped programs:");
  for (let i = 0; i < startable.length; i += 1) {
    const item = startable[i];
    console.log(`${String(i + 1).padStart(2, " ")}. ${item.program.name}`);
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  const answer = (await rl.question("Start which program? (number/name, q to cancel): ")).trim();
  rl.close();

  if (answer === "" || answer.toLowerCase() === "q") {
    console.log("Canceled.");
    return;
  }

  const numeric = Number.parseInt(answer, 10);
  if (Number.isFinite(numeric) && numeric >= 1 && numeric <= startable.length) {
    await startProgram(startable[numeric - 1].program);
    return;
  }

  const program = findProgram(
    startable.map((status) => status.program),
    answer
  );
  if (program === undefined) {
    console.error(`Unknown selection: ${answer}`);
    process.exitCode = 1;
    return;
  }

  await startProgram(program);
}

async function main() {
  await ensureStateDir();
  const programs = await readRegistry();
  const command = (process.argv[2] ?? "list").toLowerCase();
  const arg = process.argv[3];

  if (command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (command === "list" || command === "status") {
    const statuses = await Promise.all(programs.map((program) => getProgramStatus(program)));
    printStatuses(statuses);
    return;
  }

  if (command === "menu") {
    await runMenu(programs);
    return;
  }

  if (command === "start") {
    if (arg === undefined || arg.trim() === "") {
      throw new Error("Missing program name for start.");
    }
    const program = findProgram(programs, arg);
    if (program === undefined) {
      throw new Error(`Unknown program: ${arg}`);
    }
    await startProgram(program);
    return;
  }

  if (command === "stop") {
    if (arg === undefined || arg.trim() === "") {
      throw new Error("Missing program name for stop.");
    }
    const program = findProgram(programs, arg);
    if (program === undefined) {
      throw new Error(`Unknown program: ${arg}`);
    }
    await stopProgram(program);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(`[program-hub] ${error.message}`);
  process.exit(1);
});
