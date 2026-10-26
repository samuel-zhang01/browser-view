# Validation — Browser View 0.3.0

Validated on **2026-10-26**, using synthetic pages on an Ubuntu 24.04 x64 host.
Both editor modes installed the distributable VSIX into a fresh extension
folder. The tests assert that the runtime comes from that installed package.
State, profiles, ports and X displays are separate from the live user browser.

## Results

| Check | Result |
| --- | --- |
| code-server 4.138.0 / Code 1.138.0 | **28 end-to-end checks passed** |
| Native Linux VS Code 1.143.1 | **26 end-to-end checks passed** |
| JavaScript unit/regression tests | **11 passed** |
| Python runtime unit tests | **6 passed** |
| Isolated Linux runtime integration checks | **6 passed** |
| Full locked dependency audit | **0 known vulnerabilities** |
| Production dependency audit | **0 known vulnerabilities** |
| Unhandled workbench page errors | **0 in both successful E2E runs** |
| VSIX contents | No profiles, logs, session state, credentials or development dependency tree |

Runtime versions: Node.js 22.22.2; Python 3.13.17 for the supervisor and Python
3.12.3 for distro websockify; Chrome for Testing 153.0.8010.12. Native VS Code ran
under an isolated Xvfb display. Both test browser hosts deliberately opted out of
the sandbox because this test VM runs as root. A separate check confirms root
startup is rejected without that explicit exception.

Each editor run sampled ten agent DOM changes through to rendered panel pixels.
The native editor's sample median was 50 ms (33–50 ms). These small local-VM
samples include test polling and are not network or cross-machine performance
claims. Raw timings are included in the evidence files below.

## User-facing checks

Both suites exercise opening through the real Command Palette, binary display
rendering, navigation, mouse clicks, typing, agent/shared state, view-only input
blocking, reconnect, hide/show, close/reopen, frame updates, external viewers,
hostile-origin rejection, private listeners, actual-size scrolling, keyboard
escape and modifier release, invalid navigation recovery, webview reload, link
navigation, scrolling, Chromium close/reopen, stop and profile-retaining restart.

The code-server suite additionally tests **Open in browser** through its actual
port proxy and **two simultaneous editor windows** sharing one runtime with
independent viewer preferences. Both suites connect two additional standalone
viewers of different sizes.

| Screen scenario | Exercised |
| --- | --- |
| 800×600 editor window | Fit layout and correctly mapped pointer input |
| 1280×720 editor window | Fit layout and pointer input |
| 1920×1080 editor window | Fit layout and pointer input |
| 2560×1440 editor window | Fit layout and pointer input |
| Narrow editor splits | Wrapping controls; actual-size scrollbars |
| 375×667 standalone viewer, DPR 2 and touch context | Layout, controls, simultaneous viewing, fit and actual-size modes |
| 1920×1080 second standalone viewer | Simultaneous rendering; independent view-only mode |
| 1920×1080 remote desktop configuration | Runtime startup/restart and stable configured dimensions |

Screenshots were visually inspected alongside geometry assertions. Desktop and
code-server runs exercised their default dark and light themes respectively.
The mobile test uses Chromium emulation, not a physical iOS/Android device.

The runtime checks cover four concurrent starts reusing one owner, explicit root
sandbox opt-in, invalid dimensions, occupied-port failure without touching the
existing listener, profile retention and configured restart.

## Evidence and reproduction

- [code-server results](docs/evidence/code-server-results.json)
- [Native VS Code results](docs/evidence/desktop-results.json)
- [code-server frame timings](docs/evidence/code-server-frame-latency.json)
- [Native VS Code frame timings](docs/evidence/desktop-frame-latency.json)
- [code-server screenshot](docs/screenshots/code-server.png)
- [VS Code desktop screenshot](docs/screenshots/vscode-desktop.png)
- [Mobile fit](docs/screenshots/mobile-fit.png) and [actual size](docs/screenshots/mobile-actual-size.png)

```bash
npm ci
npm test
npm run package
python3 tests/runtime-integration.py
npm run test:e2e
BROWSER_VIEW_VSCODE=/path/to/VSCode-linux-x64/code \
  xvfb-run -a -s '-screen 0 2560x1600x24 -nolisten tcp' npm run test:e2e
npm audit
```

Run editor modes sequentially because they share fixed test ports. Set
`BROWSER_VIEW_CODE_SERVER` to the standalone server executable if needed. The
public CI workflow uses a standard hosted Linux runner, never the owner's shared
local machine, and retains successful package/test artifacts for seven days.

## Coverage limits

This verifies Linux desktop VS Code and code-server with Chromium, not native
macOS/Windows hosting. Physical monitors, mixed hardware DPI, WSL, Remote SSH
client forwarding, authenticated production HTTPS proxies, Safari/iOS, ARM64 and
screen-reader behavior of remote page content were not end-to-end tested. No
Marketplace or Open VSX upload was performed. The VSIX is distributed through
GitHub Releases. See [the audit](docs/AUDIT.md) for remaining product limits and
upstream issue references.
