import importlib.util
from pathlib import Path
import tempfile
import socket
import os
import unittest
spec=importlib.util.spec_from_file_location('session',Path(__file__).parents[1]/'runtime/session.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class RuntimeTests(unittest.TestCase):
    def test_url_schemes_and_credentials(self):
        for url in ['file:///etc/passwd','javascript:alert(1)','http://user:pass@example.com','--no-sandbox','data:text/html,test']:
            with self.assertRaises(ValueError): module.validate_url(url)
        self.assertEqual(module.validate_url('http://127.0.0.1:5173/'),'http://127.0.0.1:5173/')
    def test_listener_check_finds_ipv4_and_ipv6(self):
        for family,address in [(socket.AF_INET,('127.0.0.1',0)),(socket.AF_INET6,('::1',0))]:
            before=set(module.tcp_listeners(os.getpid()))
            with socket.socket(family) as listener:
                listener.bind(address);listener.listen()
                self.assertTrue(set(module.tcp_listeners(os.getpid()))-before)
            self.assertEqual(set(module.tcp_listeners(os.getpid())),before)
    def test_stale_or_forged_owner_is_not_signalled(self):
        original=module.STATE
        with tempfile.TemporaryDirectory() as directory:
            module.STATE=Path(directory)
            (module.STATE/'session.json').write_text('{"pid":1,"ticks":"0","nonce":"fake"}')
            self.assertIsNone(module.read_state())
        module.STATE=original

class ConfigurationTests(unittest.TestCase):
    def test_invalid_browser_override(self):
        from unittest.mock import patch
        with patch.dict(os.environ, {'BROWSER_VIEW_CHROMIUM': '/nonexistent/browser'}):
            with self.assertRaisesRegex(RuntimeError, 'executable'): module.browser_path()

    def test_invalid_dimensions_and_ports(self):
        from unittest.mock import patch
        with patch.object(module, 'ALLOW_UNSANDBOXED', True):
            for width, height in [(639, 1000), (3841, 1000), (1440, 479), (1440, 2161)]:
                with patch.object(module, 'WIDTH', width), patch.object(module, 'HEIGHT', height):
                    with self.assertRaisesRegex(ValueError, 'Desktop size'): module.preflight()
            with patch.object(module, 'WEB', 9222), patch.object(module, 'CDP', 9222):
                with self.assertRaisesRegex(ValueError, 'ports'): module.preflight()

if __name__=='__main__':unittest.main()
