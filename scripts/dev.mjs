import { spawn } from "node:child_process";
import net from "node:net";

const isWindows = process.platform === "win32";
const apiPort = await findFreePort(Number(process.env.PORT || 4000));
const frontendPort = await findFreePort(Number(process.env.VITE_PORT || 5173));
const apiUrl = `http://127.0.0.1:${apiPort}`;
const basePath = process.env.VITE_BASE_PATH || (process.env.VERCEL ? "/" : "/Missionary-trips/");
const frontendUrl = `http://127.0.0.1:${frontendPort}${basePath}`;
const processes = [];
let isShuttingDown = false;

console.log(`API: ${apiUrl}`);
console.log(`Frontend: ${frontendUrl}`);

startProcess("api", process.execPath, ["--watch", "server/index.js"], {
  ...process.env,
  PORT: String(apiPort),
});

startProcess("frontend", "npm", ["run", "dev:frontend", "--", "--port", String(frontendPort)], {
  ...process.env,
  VITE_API_URL: apiUrl,
});

process.on("SIGINT", () => {
  shutdown();
  process.exit(0);
});

process.on("SIGTERM", () => {
  shutdown();
  process.exit(0);
});

function startProcess(name, command, args, env) {
  const childProcess = spawn(command, args, {
    env,
    shell: isWindows && command === "npm",
    stdio: "inherit",
  });

  processes.push(childProcess);

  childProcess.on("exit", (code) => {
    if (isShuttingDown) {
      return;
    }

    console.error(`${name} exited with code ${code ?? 0}`);
    shutdown();
    process.exit(code || 0);
  });
}

function shutdown() {
  isShuttingDown = true;

  for (const childProcess of processes) {
    if (!childProcess.killed) {
      childProcess.kill();
    }
  }
}

async function findFreePort(startPort) {
  let port = startPort;

  while (!(await isPortFree(port))) {
    port += 1;
  }

  return port;
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once("error", () => {
      resolve(false);
    });

    server.once("listening", () => {
      server.close(() => {
        resolve(true);
      });
    });

    server.listen(port);
  });
}
