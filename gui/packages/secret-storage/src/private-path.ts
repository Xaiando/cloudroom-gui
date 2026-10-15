import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const pendingChecks = new Map<string, Promise<void>>();
const windowsCheck = `
$ErrorActionPreference = 'Stop'
$path = $env:CLOUDROOM_PRIVATE_PATH
$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$type = [System.Security.Principal.SecurityIdentifier]
$acl = if ([System.IO.Directory]::Exists($path)) { [System.IO.Directory]::GetAccessControl($path) } else { [System.IO.File]::GetAccessControl($path) }
if ($acl.GetOwner($type).Value -ne $identity) { throw 'The private path has a different owner.' }
$trusted = @($identity, 'S-1-5-18', 'S-1-5-32-544', 'S-1-3-0')
foreach ($rule in $acl.GetAccessRules($true, $true, $type)) {
  if ($rule.AccessControlType -eq 'Allow' -and $rule.IdentityReference.Value -notin $trusted) { throw 'The private path grants access to another account.' }
}
`;

export async function assertPrivatePath(path: string): Promise<void> {
  const existing = pendingChecks.get(path);
  if (existing) return existing;
  const pending = checkPrivatePath(path);
  pendingChecks.set(path, pending);
  try {
    await pending;
  } finally {
    pendingChecks.delete(path);
  }
}

async function checkPrivatePath(path: string): Promise<void> {
  const info = await stat(path);
  if (process.platform !== "win32") {
    if ((info.mode & 0o077) !== 0)
      throw new Error("The private path grants access to another account.");
    return;
  }
  try {
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
        Buffer.from(windowsCheck, "utf16le").toString("base64"),
      ],
      {
        env: { ...process.env, CLOUDROOM_PRIVATE_PATH: path },
        windowsHide: true,
        timeout: 5_000,
      },
    );
  } catch {
    throw new Error(
      "Windows private paths must be owned by the current user and must not grant access to other ordinary accounts.",
    );
  }
}
