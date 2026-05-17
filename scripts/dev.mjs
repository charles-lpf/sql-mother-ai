import { spawn } from "node:child_process";

const children = [];

const run = (name, command, args, extraEnv = {}) => {
  const child = spawn(command, args, {
    stdio: "inherit",
    env: {
      ...process.env,
      ...extraEnv,
    },
    shell: false,
  });
  children.push(child);

  child.on("exit", (code, signal) => {
    if (signal) {
      return;
    }
    if (code && code !== 0) {
      console.error(`[${name}] exited with code ${code}`);
      shutdown(code);
    }
  });
};

const shutdown = (code = 0) => {
  children.forEach((child) => {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  });
  process.exit(code);
};

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

run("quiz-server", process.execPath, ["server/quiz-sse-server.mjs"]);
run("vite", process.execPath, ["node_modules/vite/bin/vite.js"], {
  VITE_AI_QUIZ_MOCK: process.env.AI_QUIZ_MOCK === "1" ? "1" : "",
});
