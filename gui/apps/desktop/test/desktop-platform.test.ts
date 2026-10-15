import { describe, expect, it } from "vitest";
import { resolveBbDesktopPlatform } from "../src/desktop-platform.js";

describe("desktop platform", () => {
  it.each([
    ["darwin", "macos"],
    ["linux", "linux"],
    ["win32", "windows"],
  ] as const)("identifies %s as %s", (platform, expected) => {
    expect(resolveBbDesktopPlatform(platform)).toBe(expected);
  });

  it("rejects unsupported operating systems", () => {
    expect(() => resolveBbDesktopPlatform("freebsd")).toThrow(
      "Unsupported desktop platform",
    );
  });
});
