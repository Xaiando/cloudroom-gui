[CmdletBinding()]
param(
    [ValidateSet('Setup', 'Build', 'Gui')][string]$Action = 'Gui',
    [string]$DataDirectory = (Join-Path $env:LOCALAPPDATA 'CloudroomDesktopPreview'),
    [string]$UserDataDirectory,
    [ValidateRange(1024, 65535)][int]$Port = 38490,
    [ValidateRange(1024, 65535)][int]$DaemonPort = 38491,
    [ValidateRange(0, 65535)][int]$DebugPort = 0,
    [switch]$HideForTest
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if ($env:OS -ne 'Windows_NT') { throw 'This launcher requires Windows.' }
$root = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node.exe -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
$version = [version]((& $node --version).Trim().TrimStart('v'))
if ($version -lt [version]'22.19.0') { throw 'Install Node.js 22.19 or newer before building the Windows preview.' }
Push-Location $root
try {
    if ($Action -ne 'Gui') {
        $npx = (Get-Command npx.cmd -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
        if ($Action -eq 'Setup') { & $npx --yes pnpm@9.15.0 install --frozen-lockfile }
        else { & $npx --yes pnpm@9.15.0 exec turbo run build typecheck --filter=@cloudroom/app --filter=@cloudroom/server --filter=@cloudroom/desktop --filter=bb-app --concurrency=2 }
        if ($LASTEXITCODE) { throw "Desktop $Action failed. See the output above." }
        return
    }
    foreach ($file in @('apps\desktop\dist\main.js', 'packages\bb-app\dist\bb-app.js')) {
        if (!(Test-Path -LiteralPath (Join-Path $root $file))) { throw 'Build the original desktop first: run this script with -Action Setup, then -Action Build.' }
    }
    if ($Port -eq $DaemonPort) { throw 'Server and host daemon ports must differ.' }
    $DataDirectory = [IO.Path]::GetFullPath($DataDirectory)
    $newDirectory = !(Test-Path -LiteralPath $DataDirectory)
    [void][IO.Directory]::CreateDirectory($DataDirectory)
    if ($newDirectory) {
        $identity = [Security.Principal.WindowsIdentity]::GetCurrent().User
        $acl = if ($PSVersionTable.PSEdition -eq 'Desktop') { [IO.Directory]::GetAccessControl($DataDirectory) }
            else { [IO.FileSystemAclExtensions]::GetAccessControl([IO.DirectoryInfo]::new($DataDirectory)) }
        if ($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $identity.Value) { throw 'The new data directory is not owned by the current user.' }
        $acl.SetAccessRuleProtection($true, $false)
        foreach ($sid in @($identity, [Security.Principal.SecurityIdentifier]::new('S-1-5-18'))) {
            [void]$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow'))
        }
        if ($PSVersionTable.PSEdition -eq 'Desktop') { [IO.Directory]::SetAccessControl($DataDirectory, $acl) }
        else { [IO.FileSystemAclExtensions]::SetAccessControl([IO.DirectoryInfo]::new($DataDirectory), $acl) }
    }
    $desktopRoot = Join-Path $root 'apps\desktop'
    Push-Location $desktopRoot
    try {
        $electron = & $node -p "require('electron')"
        if ($LASTEXITCODE) { throw 'Electron could not be resolved. Run -Action Setup again.' }
        $electron = $electron.Trim()
    } finally { Pop-Location }
    if (!(Test-Path -LiteralPath $electron)) { throw 'Electron is missing. Run -Action Setup again.' }
    $previous = @{}
    try {
        foreach ($entry in @(Get-ChildItem Env: | Where-Object { $_.Name -match '^(BB_|ROOM_)|^(ELECTRON_RUN_AS_NODE|NODE_ENV)$' })) {
            $previous[$entry.Name] = $entry.Value
            [Environment]::SetEnvironmentVariable($entry.Name, $null, 'Process')
        }
        $settings = @{
            BB_DATA_DIR = $DataDirectory
            BB_SERVER_PORT = "$Port"
            BB_SERVER_URL = "http://127.0.0.1:$Port"
            BB_SERVER_BIND_HOST = '127.0.0.1'
            BB_HOST_DAEMON_PORT = "$DaemonPort"
            BB_DESKTOP_NODE_EXEC_PATH = $node
            BB_DESKTOP_OPEN_DEVTOOLS = '0'
            BB_TELEMETRY = '0'
            NODE_ENV = 'production'
        }
        if ($HideForTest) { $settings['BB_DESKTOP_HIDE_WINDOWS'] = '1' }
        foreach ($name in $settings.Keys) {
            if (!$previous.ContainsKey($name)) { $previous[$name] = $null }
            [Environment]::SetEnvironmentVariable($name, $settings[$name], 'Process')
        }
        if (!$UserDataDirectory) { $UserDataDirectory = Join-Path $DataDirectory 'desktop' }
        $arguments = @(('"' + $desktopRoot + '"'), ('"--user-data-dir=' + [IO.Path]::GetFullPath($UserDataDirectory) + '"'))
        if ($DebugPort) { $arguments += "--remote-debugging-port=$DebugPort" }
        $launch = @{ FilePath = $electron; ArgumentList = $arguments; WorkingDirectory = $desktopRoot; PassThru = $true }
        if ($HideForTest) { $launch.WindowStyle = 'Hidden' }
        $child = Start-Process @launch
        Write-Output "Cloudroom original desktop preview launched (PID $($child.Id)). Data: $DataDirectory"
    } finally {
        foreach ($name in $previous.Keys) { [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process') }
    }
} finally { Pop-Location }
