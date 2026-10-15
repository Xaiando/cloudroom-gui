import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { describe, expect, it } from "vitest";
import {
  createNodeVerifiedProcessOps,
  stopVerifiedProcess,
} from "../src/verified-process-stop.js";

describe.runIf(process.platform === "win32")(
  "Windows process ownership",
  () => {
    it("refuses another identity and stops a verified launcher", async () => {
      const marker = `cloudroom-process-test-${randomUUID()}`;
      const startedAt = new Date().toISOString();
      const child = spawn(
        process.execPath,
        ["-e", "setInterval(() => {}, 1000)", marker],
        { stdio: "ignore" },
      );
      try {
        await once(child, "spawn");
        const pid = child.pid!;
        const ops = createNodeVerifiedProcessOps();
        expect(await ops.readCommand(pid)).toContain(marker);
        expect(await ops.readElapsedSeconds(pid)).toBeGreaterThanOrEqual(0);
        const args = {
          pid,
          startedAt,
          signal: "SIGTERM" as const,
          timeoutMs: 2_000,
          killTimeoutMs: 1_000,
        };
        expect(
          await stopVerifiedProcess({
            ...args,
            verifyTokens: ["another-launcher"],
          }),
        ).toMatchObject({ kind: "unverified", reason: "command" });
        expect(ops.isRunning(pid)).toBe(true);
        const exited = once(child, "exit");
        expect(
          await stopVerifiedProcess({ ...args, verifyTokens: [marker] }),
        ).toMatchObject({ kind: "stopped" });
        await exited;
        expect(ops.isRunning(pid)).toBe(false);
      } finally {
        if (child.exitCode === null && child.signalCode === null) child.kill();
      }
    }, 20_000);
  },
);
