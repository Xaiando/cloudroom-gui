"""Exercise the Windows launcher, original UI, and scheduled script work without model calls."""
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
from urllib.request import urlopen

GUI = Path(__file__).resolve().parents[3]


def port():
    with socket.socket() as listener:
        listener.bind(('127.0.0.1', 0))
        return listener.getsockname()[1]


def until(check, timeout=60):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        value = check()
        if value:
            return value
        time.sleep(.25)
    raise AssertionError('Windows desktop smoke test timed out')


def get(url):
    try:
        with urlopen(url, timeout=2) as response:
            return json.load(response)
    except OSError:
        return None


def main():
    assert sys.platform == 'win32'
    powershell = Path(os.environ['SystemRoot']) / 'System32/WindowsPowerShell/v1.0/powershell.exe'
    with tempfile.TemporaryDirectory(prefix='cloudroom-windows-smoke-') as folder:
        root = Path(folder).resolve()
        assert root.parent == Path(tempfile.gettempdir()).resolve()
        data = root / 'Windows desktop Æ'
        server, daemon, debug = port(), port(), port()
        origin = f'http://127.0.0.1:{server}'
        debugging = f'http://127.0.0.1:{debug}'
        env = dict(os.environ, CLOUDROOM_WEBSITE_URL='http://127.0.0.1:9')
        log = root / 'launcher.log'
        with log.open('w') as stream:
            result = subprocess.run([str(powershell), '-NoProfile', '-ExecutionPolicy', 'Bypass',
                                     '-File', str(GUI / 'install/windows.ps1'), '-Action', 'Gui',
                                     '-DataDirectory', str(data), '-Port', str(server), '-DaemonPort', str(daemon),
                                     '-DebugPort', str(debug), '-HideForTest'], env=env, cwd=os.environ['SystemRoot'],
                                    stdin=subprocess.DEVNULL, stdout=stream, stderr=stream, timeout=30)
        assert result.returncode == 0, log.read_text(errors='replace')
        try:
            until(lambda: get(origin + '/health'))
            until(lambda: get(debugging + '/json/list'))
            subprocess.run(['node', str(Path(__file__).with_name('smoke-windows-ui.mjs')), str(debug)],
                           env=env, check=True, timeout=90)
            env.update(ROOM_DATA_DIR=str(data), ROOM_SERVER_URL=origin, ROOM_HOST_DAEMON_PORT=str(daemon))
            env.pop('ROOM_CLI', None)

            def cli(*args):
                process = subprocess.run(['node', str(GUI / 'packages/bb-app/dist/room-cli.js'), 'automation',
                                          *args, '--project', 'proj_personal', '--json'], env=env, cwd=GUI,
                                         capture_output=True, text=True, encoding='utf-8', timeout=30)
                assert process.returncode == 0, process.stderr
                return json.loads(process.stdout)

            automation = cli('create', '--name', 'Windows scheduled fixture', '--script',
                             'console.log("WINDOWS_SCHEDULED_OK")', '--interpreter', 'node', '--in', '2s')
            try:
                def completed():
                    runs = cli('runs', automation['id'])['runs']
                    return runs[0] if runs and runs[0]['status'] != 'running' else None
                run = until(completed, timeout=30)
                assert run['status'] == 'succeeded', run
                assert run['exitCode'] == 0 and 'WINDOWS_SCHEDULED_OK' in run['output'], run
                assert run['trigger'] == 'schedule', run
            finally:
                cli('delete', automation['id'], '--yes')
            print('PASS: native PowerShell launcher, Unicode path, scheduled Node automation, run history, and deletion')
        finally:
            for target in get(debugging + '/json/list') or []:
                if target['type'] == 'page':
                    try:
                        with urlopen(debugging + '/json/close/' + target['id'], timeout=2):
                            pass
                    except OSError:
                        pass
            until(lambda: not get(origin + '/health'), timeout=15)


if __name__ == '__main__':
    main()
