import { spawn } from "node:child_process";
process.env.GOMAXPROCS ||= "2";
const child = spawn(
  process.execPath,
  [
    "node_modules/concurrently/dist/bin/concurrently.js",
    "-k",
    "tsx watch server/index.ts",
    "vite --host 127.0.0.1",
  ],
  { stdio: "inherit", env: process.env },
);
child.on("exit", (code) => process.exit(code ?? 1));
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
