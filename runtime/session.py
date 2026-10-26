#!/usr/bin/env python3
"""Own only this user's isolated browser session. No shell commands or public listeners."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import secrets
import shutil
import signal
import socket
import subprocess
import sys
import time
import urllib.request
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
STATE = Path(os.environ.get('BROWSER_VIEW_STATE', str(Path.home()/'.local/share/browser-view'))).resolve()
WEB = int(os.environ.get('BROWSER_VIEW_WEB_PORT', '6080'))
CDP = int(os.environ.get('BROWSER_VIEW_CDP_PORT', '9222'))
DISPLAY = ':' + os.environ.get('BROWSER_VIEW_DISPLAY', '98').lstrip(':')
WIDTH = int(os.environ.get('BROWSER_VIEW_WIDTH', '1440'))
HEIGHT = int(os.environ.get('BROWSER_VIEW_HEIGHT', '1000'))
ALLOW_UNSANDBOXED = os.environ.get('BROWSER_VIEW_ALLOW_NO_SANDBOX') == '1'

def read_state():
    try:
        data=json.loads((STATE/'session.json').read_text())
        pid=data['pid']
        if Path(f'/proc/{pid}').stat().st_uid != os.getuid(): return None
        args=Path(f'/proc/{pid}/cmdline').read_bytes().split(b'\0')
        ticks=Path(f'/proc/{pid}/stat').read_text().split(') ',1)[1].split()[19]
        if b'--serve' not in args or data['ticks'] != ticks: return None
        # The per-start nonce prevents signalling a different supervisor after PID reuse.
        if data['nonce'].encode() not in args: return None
        return data
    except (OSError,ValueError,KeyError,IndexError): return None

def ready(data):
    if not data or not Path(data['socket']).exists(): return False
    try:
        for url in (data['cdp']+'/json/version',data['viewer']):
            with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(url,timeout=1) as response:
                if response.status != 200: return False
        return True
    except OSError: return False

def browser_path():
    override=os.environ.get('BROWSER_VIEW_CHROMIUM')
    if override:
        resolved = shutil.which(override)
        if not resolved: raise RuntimeError('BROWSER_VIEW_CHROMIUM does not name an executable browser.')
        return resolved
    for name in ('chromium','chromium-browser','google-chrome'):
        if shutil.which(name): return shutil.which(name)
    cached=list((Path.home()/'.cache/ms-playwright').glob('chromium-*/chrome-linux*/chrome'))
    if cached: return str(max(cached,key=lambda p:int(p.parts[-3].split('-')[-1])))
    raise RuntimeError('Chromium is missing. Run the distribution setup script.')

def validate_url(url):
    parsed=urlparse(url)
    if parsed.scheme not in ('http','https') or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError('Use an http:// or https:// URL without embedded credentials.')
    return url

def preflight():
    if sys.platform != 'linux': raise RuntimeError('Use a Linux extension host (Remote SSH, WSL, or code-server).')
    missing=[name for name in ('Xvfb','xauth','x11vnc','websockify') if not shutil.which(name)]
    if missing: raise RuntimeError('Missing '+', '.join(missing)+'. Run setup.sh on the Linux host.')
    if os.geteuid()==0 and not ALLOW_UNSANDBOXED:
        raise RuntimeError('Chromium cannot sandbox as root. Prefer a non-root host. For an isolated root VM, explicitly enable browserView.allowNoSandbox.')
    if not (1<=WEB<=65535 and 1<=CDP<=65535) or WEB==CDP: raise ValueError('Invalid or conflicting ports.')
    if not DISPLAY[1:].isdigit(): raise ValueError('Display must be a number.')
    if not (640 <= WIDTH <= 3840 and 480 <= HEIGHT <= 2160): raise ValueError('Desktop size must be 640–3840 pixels wide and 480–2160 pixels high.')
    if not shutil.which('node'): raise RuntimeError('Node.js 22 or newer is missing on the extension host.')
    version = subprocess.run(['node', '-p', 'process.versions.node.split(".")[0]'], capture_output=True, text=True, check=True)
    if int(version.stdout) < 22: raise RuntimeError('Node.js 22 or newer is required.')
    result = subprocess.run(['/usr/bin/python3', '-c', 'import websockify'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if result.returncode: raise RuntimeError('Install python3-websockify for /usr/bin/python3 (sudo apt-get install websockify).')
    if any(not (ROOT/'web'/name).is_file() for name in ('index.html', 'viewer.js', 'viewer.css', 'demo.html')):
        raise RuntimeError('Viewer assets are missing. From source, run npm run build. For a VSIX installation, reinstall the extension.')
    return browser_path()


def tcp_listeners(pid):
    inodes=set()
    for fd in Path(f'/proc/{pid}/fd').iterdir():
        try:
            value=os.readlink(fd)
            if value.startswith('socket:['): inodes.add(value[8:-1])
        except OSError: pass
    listeners=[]
    for family in ('tcp','tcp6'):
        for line in Path('/proc/net/'+family).read_text().splitlines()[1:]:
            fields=line.split()
            if fields[3]=='0A' and fields[9] in inodes: listeners.append(fields[1])
    return listeners

def serve(url,nonce):
    lock=(STATE/'session.lock').open('w')
    fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    chrome=preflight()
    for port in (WEB,CDP):
        with socket.socket() as probe:
            probe.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1)
            probe.bind(('127.0.0.1',port))
    xsocket=Path('/tmp/.X11-unix/X'+DISPLAY[1:])
    if xsocket.exists(): raise RuntimeError(f'Display {DISPLAY} is occupied. No existing desktop was changed.')
    auth=STATE/'Xauthority';auth.touch(mode=0o600,exist_ok=True)
    subprocess.run(['xauth','-f',str(auth),'add',DISPLAY,'.',secrets.token_hex(16)],check=True,stdout=subprocess.DEVNULL)
    children=[];logs=[]
    env={**os.environ,'DISPLAY':DISPLAY,'XAUTHORITY':str(auth)}
    def launch(name,args):
        logfile=STATE/(name+'.log')
        if logfile.exists() and logfile.stat().st_size>2*1024*1024: logfile.replace(STATE/(name+'.previous.log'))
        log=logfile.open('a');logs.append(log)
        child=subprocess.Popen(args,env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
        children.append(child);return child
    def stop(*_): raise KeyboardInterrupt
    signal.signal(signal.SIGTERM,stop);signal.signal(signal.SIGINT,stop)
    sock=STATE/'desktop.sock'
    sock.unlink(missing_ok=True)
    data={'pid':os.getpid(),'nonce':nonce,'ticks':Path(f'/proc/{os.getpid()}/stat').read_text().split(') ',1)[1].split()[19],
          'socket':str(sock),'cdp':f'http://127.0.0.1:{CDP}','viewer':f'http://127.0.0.1:{WEB}/',
          'display':DISPLAY,'width':WIDTH,'height':HEIGHT,'sandbox':not ALLOW_UNSANDBOXED,'runtime':str(ROOT),'state':str(STATE)}
    temp=STATE/'session.tmp';temp.write_text(json.dumps(data));temp.replace(STATE/'session.json')
    try:
        launch('display',['Xvfb',DISPLAY,'-screen','0',f'{WIDTH}x{HEIGHT}x24','-nolisten','tcp','-auth',str(auth)])
        for _ in range(100):
            if xsocket.exists(): break
            if children[0].poll() is not None: raise RuntimeError('Xvfb failed; see display.log')
            time.sleep(.05)
        vnc=launch('vnc',['x11vnc','-norc','-input_eagerly','-no6','-safer','-nocmds','-display',DISPLAY,'-auth',str(auth),'-unixsock',str(sock),'-rfbport','0','-rfbportv6','0','-listen','127.0.0.1','-listenv6','::1','-forever','-shared','-nopw','-noxdamage','-repeat','-quiet'])
        for _ in range(100):
            if vnc.poll() is not None: raise RuntimeError('VNC failed; see vnc.log')
            try:
                with socket.socket(socket.AF_UNIX) as probe:
                    probe.settimeout(.5);probe.connect(str(sock))
                    if probe.recv(12).startswith(b'RFB '): break
            except OSError: pass
            time.sleep(.05)
        else: raise RuntimeError('VNC socket did not become ready.')
        if tcp_listeners(vnc.pid): raise RuntimeError('VNC unexpectedly opened a TCP listener; refusing to start Chromium.')
        launch('viewer',['/usr/bin/python3',str(ROOT/'viewer_server.py'),str(WEB),str(sock)])
        args=[chrome,'--disable-dev-shm-usage','--no-first-run','--no-default-browser-check','--password-store=basic',
              '--disable-session-crashed-bubble','--remote-debugging-address=127.0.0.1',f'--remote-debugging-port={CDP}',
              f'--user-data-dir={STATE / "profile"}','--window-position=0,0',f'--window-size={WIDTH},{HEIGHT}',url]
        if ALLOW_UNSANDBOXED: args.insert(1,'--no-sandbox')
        launch('chromium',args)
        while all(child.poll() is None for child in children): time.sleep(.25)
    except KeyboardInterrupt: pass
    finally:
        for child in reversed(children):
            if child.poll() is None:
                try: os.killpg(child.pid,signal.SIGTERM)
                except ProcessLookupError: pass
        for child in reversed(children):
            try: child.wait(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(child.pid,signal.SIGKILL);child.wait()
        (STATE/'session.json').unlink(missing_ok=True);sock.unlink(missing_ok=True)
        for log in logs: log.close()

def main():
    os.umask(0o077)
    STATE.mkdir(parents=True,exist_ok=True,mode=0o700)
    if STATE.stat().st_uid != os.getuid(): raise RuntimeError('State directory must belong to the current user.')
    STATE.chmod(0o700)
    parser=argparse.ArgumentParser()
    parser.add_argument('action',choices=['start','stop','status','doctor'])
    parser.add_argument('url',nargs='?')
    parser.add_argument('--serve',dest='nonce')
    args=parser.parse_args()
    url=validate_url(args.url or f'http://127.0.0.1:{WEB}/demo.html')
    if args.nonce: return serve(url,args.nonce)
    if args.action=='doctor':
        chrome=preflight();print(json.dumps({'chromium':chrome,'state':str(STATE),'sandbox':not ALLOW_UNSANDBOXED}));return
    # Serialize start/stop callers across extension windows and CLI clients.
    # The supervisor holds a separate lifetime lock; never inherit this lock.
    action_lock = (STATE/'action.lock').open('a')
    if args.action in ('start', 'stop'):
        deadline = time.monotonic() + 30
        while True:
            try:
                fcntl.flock(action_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                if time.monotonic() > deadline: raise RuntimeError('Another browser operation is still running. Try again shortly.')
                time.sleep(.05)
    data=read_state()
    if args.action=='stop':
        if data:
            os.kill(data['pid'],signal.SIGTERM)
            for _ in range(480):
                if not read_state(): break
                time.sleep(.05)
            else: raise RuntimeError('Stop timed out; inspect logs. No unrelated process was killed.')
        print(json.dumps({'running':False,'state':str(STATE)}));return
    if args.action=='start':
        # Closing Chromium ends its supervisor shortly afterwards. Allow that
        # owned shutdown to finish before deciding whether to reuse or restart.
        for _ in range(30):
            if not data or ready(data): break
            time.sleep(.1)
            data=read_state()
        if not data:
            preflight()
            with (STATE/'supervisor.log').open('a') as log:
                child=subprocess.Popen([sys.executable,str(Path(__file__).resolve()),'start',url,'--serve',secrets.token_hex(16)],
                    stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
            for _ in range(150):
                data=read_state()
                if ready(data): break
                if child.poll() is not None: raise RuntimeError(f'Start failed; read {STATE}/supervisor.log and chromium.log')
                time.sleep(.1)
            else:
                if data: os.kill(data['pid'],signal.SIGTERM)
                raise RuntimeError('Startup timed out; see logs.')
        elif not ready(data): raise RuntimeError('Session exists but is unhealthy. Inspect logs, stop it, and restart.')
        if args.url:
            subprocess.run(['node',str(ROOT/'browser.cjs'),'goto',url],check=True,env={**os.environ,'BROWSER_VIEW_CDP':data['cdp']},stdout=subprocess.DEVNULL)
    print(json.dumps({**(data or {}),'running':bool(data),'ready':ready(data),'state':str(STATE)}))

if __name__=='__main__':
    try: main()
    except Exception as error: sys.exit(str(error))
