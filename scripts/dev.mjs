import { spawn } from "node:child_process";

const isWindows = process.platform === "win32";
const processes = [
  spawn(process.execPath, ["--watch", "server/index.js"], {
    stdio: "inherit",
  }),
  spawn("npm", ["run", "dev:frontend"], {
    shell: isWindows,
    stdio: "inherit",
  }),
];

let isShuttingDown = false;

for (const childProcess of processes) {
  childProcess.on("exit", (code) => {
    if (isShuttingDown) {
      return;
    }

    shutdown();
    process.exit(code || 0);
  });
}

process.on("SIGINT", () => {
  shutdown();
  process.exit(0);
});

process.on("SIGTERM", () => {
  shutdown();
  process.exit(0);
});

function shutdown() {
  isShuttingDown = true;

  for (const childProcess of processes) {
    if (!childProcess.killed) {
      childProcess.kill();
    }
  }
}
