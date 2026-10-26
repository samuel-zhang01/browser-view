"""Loopback web viewer with explicit WebSocket Origin allowlist."""
import os
from pathlib import Path
import sys
from urllib.parse import urlparse
from websockify.websocketproxy import WebSocketProxy, ProxyRequestHandler

port=int(sys.argv[1]);sock=sys.argv[2]
origins={f'http://127.0.0.1:{port}',f'http://localhost:{port}'}
public=os.environ.get('VSCODE_PROXY_URI','').replace('{{port}}',str(port))
parsed=urlparse(public)
if parsed.scheme in ('https','http') and parsed.netloc: origins.add(f'{parsed.scheme}://{parsed.netloc}')
class Handler(ProxyRequestHandler):
    def list_directory(self, path):
        self.send_error(404)
        return None
    def validate_connection(self):
        if self.headers.get('Origin') not in origins:
            self.send_error(403,'Origin is not allowed')
            raise self.CClose(1008,'Origin is not allowed')
        super().validate_connection()
WebSocketProxy(RequestHandlerClass=Handler,listen_host='127.0.0.1',listen_port=port,unix_target=sock,
               web=str(Path(__file__).resolve().parent/'web'),heartbeat=30).start_server()
