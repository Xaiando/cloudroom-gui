import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import { assertPrivatePath } from "../src/index.js";

const execFileAsync = promisify(execFile);

it.runIf(process.platform === "win32")(
  "accepts a private file and rejects a file readable by Everyone",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "cloudroom-private-path-"));
    const path = join(directory, "private settings.json");
    try {
      await writeFile(path, "{}", { mode: 0o600 });
      const powershell = join(
        process.env.SystemRoot ?? "C:\\Windows",
        "System32",
        "WindowsPowerShell",
        "v1.0",
        "powershell.exe",
      );
      const protect = `$p = $env:CLOUDROOM_PRIVATE_PATH; $owner = [System.Security.Principal.WindowsIdentity]::GetCurrent().User; $acl = [System.Security.AccessControl.FileSecurity]::new(); $acl.SetOwner($owner); $acl.SetAccessRuleProtection($true, $false); foreach ($sid in @($owner, [System.Security.Principal.SecurityIdentifier]::new('S-1-5-18'))) { $acl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($sid, 'FullControl', 'Allow')) }; [System.IO.File]::SetAccessControl($p, $acl)`;
      await execFileAsync(
        powershell,
        [
          "-NoProfile",
          "-NonInteractive",
          "-EncodedCommand",
          Buffer.from(protect, "utf16le").toString("base64"),
        ],
        {
          env: { ...process.env, CLOUDROOM_PRIVATE_PATH: path },
          windowsHide: true,
        },
      );
      await expect(assertPrivatePath(path)).resolves.toBeUndefined();
      const script = `$p = $env:CLOUDROOM_PRIVATE_PATH; $acl = [System.IO.File]::GetAccessControl($p); $sid = [System.Security.Principal.SecurityIdentifier]::new('S-1-1-0'); $rule = [System.Security.AccessControl.FileSystemAccessRule]::new($sid, 'Read', 'Allow'); $acl.AddAccessRule($rule); [System.IO.File]::SetAccessControl($p, $acl)`;
      await execFileAsync(
        join(
          process.env.SystemRoot ?? "C:\\Windows",
          "System32",
          "WindowsPowerShell",
          "v1.0",
          "powershell.exe",
        ),
        [
          "-NoProfile",
          "-NonInteractive",
          "-EncodedCommand",
          Buffer.from(script, "utf16le").toString("base64"),
        ],
        {
          env: { ...process.env, CLOUDROOM_PRIVATE_PATH: path },
          windowsHide: true,
        },
      );
      await expect(assertPrivatePath(path)).rejects.toThrow();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
