# Browser View audit — 2026-10-26

Scope: the existing 0.2.1 source/runtime, extension configuration, public package,
agent CLI, desktop transport, lifecycle, concurrent viewers and screen sizes.
All automated UI work uses synthetic pages and separate session state. The live
user browser is not a test fixture.

## Findings addressed in 0.3.0

| Finding | Change | Verification |
| --- | --- | --- |
| Desktop dimensions and runtime endpoints were hard-coded | Bounded machine settings and CLI/environment equivalents | Configuration tests and isolated runtime checks |
| Small panels made text unreadable | Per-viewer actual-size mode with scrollbars | Narrow and large screen E2E matrix |
| Inherited VS Code padding clipped controls and canvas | Reset padding and use border-box sizing; responsive controls | Geometry assertions and screenshots |
| Modifier keys could remain held when focus moved to the toolbar | Release held keys before blur and view-only changes | Lowercase typing after Shift+Escape and normal link navigation |
| Canvas captured editor shortcuts with no obvious exit | Shift+Escape focuses the toolbar; on-screen hint | Real keyboard test |
| View-only could display “Connected” when disconnected | Derive status from connection state and input mode | Lifecycle tests |
| Reconnect lost viewer preferences | Persist only scale and view-only settings in webview state | Reconnect/reload tests |
| Navigation gave little feedback and could expose command/URL error details | Busy state, HTTP(S) validation and bounded generic runtime errors | Valid and invalid navigation tests |
| Stale viewer messages could collide after document recreation | Per-document random identity plus connection generations | Lifecycle and message-isolation checks |
| Concurrent windows/CLI starts could race | Separate operation and supervisor locks | Concurrent-start runtime test |
| Runtime readiness could inherit HTTP proxy routing | Disable proxies for loopback health probes | Code inspection and runtime tests |
| Startup dependency failures appeared late | Explicit browser executable, Node version, Python websockify and geometry checks | Prerequisite tests |
| User x11vnc rc files could override runtime behavior | Launch with `-norc` | Packaged runtime E2E |
| Standalone viewer lacked controls and mobile metadata | Reconnect, view-only, actual-size controls, viewport and CSP | Two simultaneous external viewers |
| Install/build scripts hard-coded one version/editor | Read the manifest version; explicit editor selection | Clean VSIX installations |
| Toolchain dependencies had known advisories | Refresh lockfile; override development MSAL Node to patched 7.1.0 | Full and production npm audits |

The MSAL override applies to packaging tooling, not the shipped runtime. Packaging
is tested; Azure/Marketplace interactive authentication is not. Remove the
override once upstream Azure Identity selects a patched version itself. Advisory:
[GHSA-xcx6-jx8p-x3h5](https://github.com/advisories/GHSA-xcx6-jx8p-x3h5).

## Related upstream reports and design guidance

These reports were reviewed for relevant failure modes; they are not claimed as
bugs fixed in code-server by this extension.

- [code-server #7962](https://github.com/coder/code-server/issues/7962) requests
  integrated-browser support. Browser View supplies its own Linux desktop and
  transport; it does not enable the editor's native integrated-browser feature.
- [code-server #8051](https://github.com/coder/code-server/issues/8051) reports
  renderer/extension-host startup issues. The test harness waits for contributed
  commands to appear; the troubleshooting guide includes editor reload checks.
- [code-server discussion #7457](https://github.com/coder/code-server/discussions/7457)
  reports webview service-worker/CSP failures behind a proxy. The panel avoids
  an embedded remote page, but still needs the editor's webview infrastructure.
- [VS Code remote extension guidance](https://code.visualstudio.com/api/advanced-topics/remote-extensions)
  describes local webviews with remote extension hosts. Browser View uses
  `asWebviewUri` resources and the extension message channel.
- [VS Code URI API](https://code.visualstudio.com/api/references/vscode-api#env.openExternal)
  states that `openExternal` resolves remote URIs automatically. The extension
  leaves forwarding to the editor when no code-server proxy template is present.
- [noVNC public API](https://github.com/novnc/noVNC/blob/master/docs/API.md)
  distinguishes viewport scaling from remote-session resizing. Browser View
  keeps session resizing off so differently sized viewers do not compete.

## Remaining limits

One virtual desktop is shared by all viewers; this is not a multi-monitor X
session. Input is cooperative, and view-only is local to a viewer. Runtime stop
interrupts every viewer. The agent CLI and editor settings are separate and must
match for custom sessions. The navigation box targets the first tab.

The browser canvas is not a screen-reader-accessible representation of the page.
Physical multi-monitor hardware, macOS/Windows clients, WSL, Remote SSH tunnels,
Safari/iOS, production HTTPS proxies, and marketplace installation need separate
environment-specific verification. See the exact measured results in
[VALIDATION.md](../VALIDATION.md).
