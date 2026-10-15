# Original Cloudroom desktop on Windows (preview)

This fork ports the original React/Electron app, plugins, server, host daemon, and agent CLI to native Windows. It preserves the original interface rather than rebuilding it in a separate Windows UI. The upstream macOS and Linux sources and licenses remain intact.

## Build and launch

Requires Windows 10/11 x64, Git, Node.js 22.19 or newer (Node 24 is tested), and an installed, signed-in agent CLI for agent work. No WSL or administrator session is required.

From the repository root in Windows PowerShell:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\gui\install\windows.ps1 -Action Setup
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\gui\install\windows.ps1 -Action Build
.\Start-Cloudroom-Windows.cmd
```

The launcher uses `%LOCALAPPDATA%\CloudroomDesktopPreview`, port 38490 for the server and 38491 for the host daemon. It protects a newly created data directory for your Windows account and SYSTEM. Set `-DataDirectory`, `-Port`, and `-DaemonPort` when you need a separate instance. Existing data directories must already have private Windows permissions.

Choose **Continue locally** in setup to use local features without a Cloudroom account. Cloud services still require their own sign-in and infrastructure. Do not treat a local folder or process group as an isolated VM.

This profile is separate from the earlier WPF client's `%LOCALAPPDATA%\CloudroomCore` data. The preview does not migrate or overwrite that history. It is a source build; a standalone Windows installer and automatic updates are not available yet.

## Verified so far

- Full original app, server, desktop, and runtime build/typecheck: 55 tasks passed on Windows.
- Original desktop preload reports `windows`; Plugins and Automations panels load.
- Bundled agent CLI starts on Windows and preserves spaces, quotes, and Unicode arguments.
- A local Node script automation can be created, run manually or on a timer, inspected, and deleted, recording output and exit code.
- Local onboarding can be dismissed without sign-in and reopened later.
- Windows connection-file checks validate ownership and ACLs instead of Unix permission bits; a file readable by Everyone is rejected.
- Plugin path containment accepts Windows paths and still rejects traversal and junction escapes.

Agent harnesses, attachments, terminals, child-thread orchestration, worktrees, and remote workflows still need their complete Windows acceptance checks. The presence of their upstream UI is not a claim that every platform integration is supported.

## Checks

Run through the pinned pnpm version from `gui/`:

```powershell
npx --yes pnpm@9.15.0 exec turbo run build typecheck --filter=@cloudroom/app --filter=@cloudroom/server --filter=@cloudroom/desktop --filter=bb-app --concurrency=2
npx --yes pnpm@9.15.0 exec turbo run test --filter=@cloudroom/config --concurrency=2
npx --yes pnpm@9.15.0 exec turbo run test --filter=@cloudroom/app -- Onboarding.local.test.tsx
npx --yes pnpm@9.15.0 exec turbo run test --filter=@cloudroom/secret-storage -- private-path.test.ts
python apps/desktop/scripts/smoke-windows.py
```

The desktop smoke test requires Python 3.11+. It opens a hidden original desktop with a disposable private profile, checks local onboarding across reload, opens Automations, executes a scheduled Node script, reads its run history, deletes the fixture, and closes the test runtime. It does not submit prompts to a model. Script runs still warn that the standalone `room-cli` executable cannot be injected into their Windows PATH; Windows script/agent CLI integration beyond the bundled launcher remains unfinished.

The broader upstream scripts suite still reports a provider-literal baseline mismatch: its exported source already exceeds its committed migration baseline. Keep that check visible; do not raise the baseline to hide it. CI-script tests whose files were omitted from the upstream source export are skipped when those files are absent. Windows-specific tests use native filesystem paths and junctions without requiring Developer Mode.
