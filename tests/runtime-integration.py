#!/usr/bin/env python3
"""Isolated Linux runtime lifecycle checks; never inspect a user's browser profile."""
import concurrent.futures
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]

def free_port():
    with socket.socket() as probe:
        probe.bind(('127.0.0.1', 0))
        return probe.getsockname()[1]

with tempfile.TemporaryDirectory(prefix='browser-view-runtime-test-') as directory:
    display = next(str(n) for n in range(110, 200) if not Path(f'/tmp/.X11-unix/X{n}').exists())
    env = {**os.environ, 'BROWSER_VIEW_STATE': directory, 'BROWSER_VIEW_WEB_PORT': str(free_port()),
           'BROWSER_VIEW_CDP_PORT': str(free_port()), 'BROWSER_VIEW_DISPLAY': display,
           'BROWSER_VIEW_ALLOW_NO_SANDBOX': '1', 'BROWSER_VIEW_WIDTH': '1920', 'BROWSER_VIEW_HEIGHT': '1080'}
    def command(action, overrides=None):
        return subprocess.run(['python3', str(ROOT/'runtime/session.py'), action], env={**env, **(overrides or {})},
                              capture_output=True, text=True, timeout=60)
    def successful(result):
        assert result.returncode == 0, result.stderr
        return json.loads(result.stdout)
    try:
        if os.geteuid() == 0:
            result = command('doctor', {'BROWSER_VIEW_ALLOW_NO_SANDBOX': '0'})
            assert result.returncode != 0 and 'sandbox' in result.stderr
            print('PASS root sandbox exception must be explicit')
        result = command('doctor', {'BROWSER_VIEW_WIDTH': '5000'})
        assert result.returncode != 0 and 'Desktop size' in result.stderr
        print('PASS invalid geometry rejected before starting processes')
        with socket.socket() as occupied:
            occupied.bind(('127.0.0.1', int(env['BROWSER_VIEW_WEB_PORT']))); occupied.listen()
            result = command('start')
            assert result.returncode != 0
            assert not successful(command('status'))['running']
            print('PASS occupied port rejected without changing its listener')
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            states = list(pool.map(lambda _: successful(command('start')), range(4)))
        assert all(s['ready'] and s['width'] == 1920 and s['height'] == 1080 for s in states)
        assert len({s['pid'] for s in states}) == 1
        print('PASS four simultaneous starts reuse one 1920x1080 session')
        assert (Path(directory)/'profile').is_dir()
        successful(command('stop'))
        assert not successful(command('status'))['running']
        assert (Path(directory)/'profile').is_dir()
        print('PASS stop retains profile and removes owned runtime')
        state = successful(command('start'))
        assert state['ready'] and state['pid'] != states[0]['pid']
        print('PASS configured session restarts with a new owner')
    finally:
        command('stop')
