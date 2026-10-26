# Troubleshooting

## Start here

Run **Browser View: Diagnostics**. Check the loaded extension version/path and
whether the runtime is `running` and `ready`. If the runtime is healthy, use
**Reconnect** or close and reopen the panel. Do not delete your profile to fix a
viewer problem.

After an upgrade, run **Developer: Reload Window** in every open editor window.
VSIX installation updates files; an existing extension host keeps its loaded
JavaScript until the window reloads. Errors mentioning the retired
`shared-browser/scripts/session.py` launcher indicate an old loaded host.

## Installation and startup

| Symptom | Action |
| --- | --- |
| Commands absent | Install the VSIX into the Linux remote host, trust the workspace, reload the window and reopen the Command Palette after extensions finish loading. |
| Linux extension host required | Connect desktop VS Code through Remote SSH or WSL. Browser-only vscode.dev cannot run this runtime. |
| Missing Python or Node | Install Python 3.10+ and Node.js 22+ on the extension host and make them available to the editor service's PATH. |
| Missing Xvfb/xauth/x11vnc/websockify | On Debian/Ubuntu install `xvfb xauth x11vnc websockify`. The runtime uses `/usr/bin/python3` for the distro websockify package. |
| Chromium missing | Install Chromium/Chrome or run the source setup script to download Playwright Chromium. A custom executable can be selected with `browserView.chromiumPath`. |
| Chromium cannot sandbox as root | Prefer a non-root host. For an isolated root container, explicitly enable `browserView.allowNoSandbox`; the CLI has its separate `--allow-no-sandbox` setup option. |
| Port or display occupied | Stop only Browser View's own session. Choose unused web/CDP ports and an X display in machine settings; do not kill unrelated browsers or delete another X socket. |
| Changed state/ports but old session remains | Restore the previous settings, stop that session, then apply the new settings and reopen. Match agent CLI settings to the editor settings. |
| Another browser operation is running | A start/stop from another window holds the operation lock. Let it finish, then retry. |

## Display and input

The panel defaults to fitting a stable desktop into its available space. A tiny
split pane makes text small: choose **Actual size**, enlarge the editor group,
use **View: Move Editor into New Window**, or open the external viewer on another
screen. Actual-size mode has scrollbars. It does not resize the shared page.

If input does nothing, turn off **View only**, click the canvas and check that no
other viewer is currently typing. Press **Shift+Escape** to return focus to the
toolbar before using VS Code keyboard shortcuts. Reconnect refreshes a stalled
stream without restarting Chromium. If Chromium itself was closed, run **Open
Shared Browser** to start it again.

The remote canvas is a picture of a browser; local screen readers cannot inspect
the page DOM through it. A coding agent can use `browser-view snapshot` for the
page's accessible text. File uploads/downloads, browser chrome, keyboard layout
and login sessions belong to Chromium on the Linux host. There is no automatic
local clipboard or audio bridge.

## Navigation

Use a full HTTP(S) URL, or `localhost:port`. `file:`, `javascript:`, embedded URL
credentials and shell flags are rejected. Start your app on the Linux host first.
If navigation fails, verify the address and port from that host. The panel's
navigation box is a launcher, not a synchronized Chromium address bar; it opens
the first normal tab. Use Chromium's own tab strip or address bar for other tabs.

For agent operations, run `browser-view tabs`; set `BROWSER_VIEW_TAB_URL` to the
exact desired URL if several tabs are open. Do not close the shared browser from
Playwright automation. Disconnect your CDP client after the operation.

## code-server, proxies and separate browser windows

Use authenticated HTTPS for code-server. Service workers required by VS Code
webviews need a secure context; localhost is also considered secure. Configure
reverse proxies to support WebSockets and code-server's webview resources.

The integrated panel uses extension messaging and does not need direct access to
the VNC or CDP ports. If the panel works but **Open in browser** does not, check
`VSCODE_PROXY_URI` and whether the code-server port proxy is enabled. The template
must contain `{{port}}`, preserve a trailing path slash, and point through your
existing authenticated service. Restart the Browser View runtime after changing
that environment variable so its allowed WebSocket origin is refreshed.

For Remote SSH, use the Ports panel to privately forward **6080** (or your custom
viewer port). Prefer the same local port number because the viewer checks its
WebSocket origin. If a local collision requires a different port, change the
viewer port on the host as well, or keep using the integrated panel. Do not
forward **9222/CDP** publicly. Do not disable login, TLS checks or origin checks
to work around proxy problems.

## Safe bug reports

Include versions, editor type, host OS, window dimensions/scaling, reproduction
steps and the short error. Include `running`/`ready` status, but remove private
URLs, usernames and paths. Never attach browser profiles, session directories,
Xauthority files, cookies, tokens or unsanitized logs. Screenshots should use a
synthetic test page rather than your authenticated applications.
