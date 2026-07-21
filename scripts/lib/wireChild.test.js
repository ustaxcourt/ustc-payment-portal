

const { EventEmitter } = require("node:events");
const { wireChild } = require("./wireChild");

function makeChild({ killed = false } = {}) {
  const child = new EventEmitter();
  child.killed = killed;
  child.kill = jest.fn();
  return child;
}

// Returns the most-recently registered listener for a process signal — the one
// wireChild just added — without emitting the real signal.
function lastListener(event) {
  const listeners = process.rawListeners(event);
  return listeners[listeners.length - 1];
}

describe("wireChild", () => {
  let exitSpy;
  let killSpy;

  beforeEach(() => {
    exitSpy = jest.spyOn(process, "exit").mockImplementation(() => {});
    killSpy = jest.spyOn(process, "kill").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.removeAllListeners("SIGINT");
    process.removeAllListeners("SIGTERM");
  });

  it("forwards SIGINT to the child", () => {
    const child = makeChild();
    wireChild(child);

    lastListener("SIGINT")();

    expect(child.kill).toHaveBeenCalledWith("SIGINT");
  });

  it("forwards SIGTERM to the child", () => {
    const child = makeChild();
    wireChild(child);

    lastListener("SIGTERM")();

    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("skips forwarding if the child is already killed", () => {
    const child = makeChild({ killed: true });
    wireChild(child);

    lastListener("SIGINT")();

    expect(child.kill).not.toHaveBeenCalled();
  });

  it("re-raises the signal when the child exits due to a signal", () => {
    const child = makeChild();
    wireChild(child);

    child.emit("exit", null, "SIGTERM");

    expect(killSpy).toHaveBeenCalledWith(process.pid, "SIGTERM");
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("passes the child's exit code to process.exit", () => {
    const child = makeChild();
    wireChild(child);

    child.emit("exit", 2, null);

    expect(exitSpy).toHaveBeenCalledWith(2);
    expect(killSpy).not.toHaveBeenCalled();
  });

  it("falls back to exit code 1 when child exits with a null code and no signal", () => {
    const child = makeChild();
    wireChild(child);

    child.emit("exit", null, null);

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("removes SIGINT and SIGTERM listeners before exiting so a re-raised signal cannot re-trigger them", () => {
    const child = makeChild();
    wireChild(child);

    const removeAllSpy = jest.spyOn(process, "removeAllListeners");
    child.emit("exit", 0, null);

    expect(removeAllSpy).toHaveBeenCalledWith("SIGINT");
    expect(removeAllSpy).toHaveBeenCalledWith("SIGTERM");
  });
});
