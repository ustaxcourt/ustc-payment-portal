"use strict";

/**
 * Forwards SIGINT/SIGTERM to a spawned child process and re-raises the signal
 * on exit so parent processes see the correct termination cause.
 */
function wireChild(child) {
  const forward = (signal) => () => {
    if (!child.killed) {
      child.kill(signal);
    }
  };
  process.on("SIGINT", forward("SIGINT"));
  process.on("SIGTERM", forward("SIGTERM"));

  child.on("exit", (code, signal) => {
    process.removeAllListeners("SIGINT");
    process.removeAllListeners("SIGTERM");
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });
}

module.exports = { wireChild };
