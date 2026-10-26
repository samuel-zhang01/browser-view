# Changelog

## 0.3.0

First public source and VSIX release.

- Add actual-size viewing with scrollbars alongside fit-to-panel viewing.
- Make controls usable in narrow panels and on touch screens; remove inherited
  webview padding that clipped the right edge.
- Add Shift+Escape to leave browser input and focus the toolbar; release held
  modifiers when focus moves to prevent accidental Shift-click navigation.
- Keep view-only and scale preferences through reconnects and webview reloads.
- Correct connection status, navigation progress, timeout and error handling.
- Allow desktop dimensions, ports, display, state directory and Chromium path to
  be configured without editing runtime files.
- Serialize concurrent start/stop operations across windows and CLI clients.
- Add prerequisite checks and prevent proxy variables from redirecting local
  readiness requests.
- Give the external viewer reconnect, view-only and actual-size controls.
- Make packaging and setup use the manifest version and support explicit editor
  selection.
- Refresh vulnerable packaging dependencies; pin MSAL Node 7.1.0 in the development
  dependency tree until Azure Identity declares a patched version itself.

## 0.2.1

Local distribution with a bundled Linux runtime, bounded binary webview bridge,
private VNC socket, shared agent CLI and retained browser profiles.
