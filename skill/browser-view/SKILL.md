---
name: browser-view
description: Open a persistent browser that the user and agent can view and control together inside VS Code or code-server. Use for shared browser sessions, local web-app inspection, screenshots, UI debugging, and end-to-end browser workflows on Linux hosts.
---

# Browser View

Use the installed Browser View extension and its existing Chromium session. This is shared browser automation through Playwright/CDP, not a native Computer Use tool.

## Open the shared session

Run `scripts/browser-view start [URL]` from this skill directory, or the installed `browser-view` command. Without a URL, reuse the current page; a new session opens the welcome page. An explicitly supplied URL navigates the first existing page.

Tell the user to run **Browser View: Open Shared Browser** from VS Code's Command Palette. It starts the runtime when needed and displays the same browser the agent controls. **Shared Browser: Open** is a compatibility alias. Do not use Simple Browser as the default: its iframe can block the authenticated viewer. The dedicated panel avoids that authentication path.

For a separate browser tab, use the `viewer` URL returned by `browser-view status`. In code-server, substitute its port into `VSCODE_PROXY_URI`; do not hard-code this machine's public domain. For Remote SSH, use private port forwarding. Keep CDP private.

## Inspect and interact

```bash
browser-view tabs
browser-view goto http://127.0.0.1:5173
browser-view screenshot /tmp/browser-view.png
browser-view snapshot
browser-view click 350 240
browser-view button 'Save'
browser-view type 'Example text'
browser-view key Tab
```

View screenshots with `view_image` before choosing coordinates or making visual judgments. CDP screenshots contain page content; screenshots of the panel also include scaled browser chrome. Keep those coordinate systems distinct.

List tabs before choosing a target when multiple pages exist. Set `BROWSER_VIEW_TAB_URL` to an exact existing URL for a specific tab. Do not create a separate browser/context when shared control is intended. For richer automation, `browser-view --root` locates the installed extension. Require its `node_modules/playwright-core` and attach with `chromium.connectOverCDP` to the status result's CDP URL. Disconnect afterwards; do not close the user's page/context.

Tell the user before a sequence that changes the shared page. Both sides can remain connected, but take turns typing. Yield input when the user takes over. Keyboard shortcuts can be captured by the browser canvas; press Shift+Escape to focus the toolbar before invoking VS Code commands. Actual size switches this viewer from scaled-to-fit to readable full-size text with scrollbars. It never changes the shared desktop resolution. Do not resize, navigate, or reset a shared page unexpectedly. A hidden panel pauses its stream, while Chromium and agent automation continue; showing the panel reconnects. View-only mode blocks panel input, not agent input.

Start app servers separately using the repository's documented command. Preserve real data and honor branch/no-commit instructions. Temporary UI tests do not authorize production data mutations.

## Lifecycle, setup, and testing

`browser-view status` reports the current runtime. `browser-view stop` stops only its owned processes and retains the profile. The extension and skill persist; opening the panel starts the runtime after a reboot. State is normally `~/.local/share/browser-view/`, not the project directory.

The distributable VSIX includes the runtime and Playwright Core; it does not require this skill. The Linux host needs Python 3.10+, Node.js 22+, Chromium, Xvfb, xauth, x11vnc and websockify. The source distribution's setup script installs the VSIX and this skill and can download Chromium. Native Windows/macOS hosting is not provided; use a Linux VM, Remote SSH or WSL.

Chromium's sandbox is enabled by default. Do not silently add `--no-sandbox`. An isolated root VM needs an explicitly configured exception (`browserView.allowNoSandbox` for the extension and the installer's `--allow-no-sandbox` option for the CLI). This is a trusted single-user host tool, not isolation from other local users. VNC uses a private Unix socket, Xvfb uses an authority cookie, and the standalone viewer/CDP bind to loopback. Never expose those controls publicly or weaken code-server authentication to make an iframe work.

On failure, use **Browser View: Diagnostics** and the state directory's logs. A display/port conflict must not trigger broad process killing. Validate full workflows in a separate test session (`BROWSER_VIEW_STATE`, `BROWSER_VIEW_WEB_PORT`, `BROWSER_VIEW_CDP_PORT`, `BROWSER_VIEW_DISPLAY`) so the user's live browser remains intact. Report observed E2E results and any untested user-facing path separately.

## Reopening after closing or upgrading

If an error mentions `~/.codex/skills/shared-browser/scripts/session.py` or `~/.local/share/codex-shared-browser`, it comes from the retired 0.1 launcher. Installing a new VSIX does not replace JavaScript already loaded in an existing extension host. Run **Developer: Reload Window** in the affected VS Code window, then **Browser View: Open Shared Browser**. Repeat in other open windows that still use the old host.

Check `browser-view status` first: if the current browser is healthy, keep it running. Do not recreate the old skill, start a second desktop, or kill Chromium to fix a stale extension host. **Browser View: Diagnostics** now records the loaded extension version/path as well as the runtime state.

Closing the panel disconnects its viewer and leaves Chromium running. Reopening reconnects to that session. If Chromium itself was closed, opening Browser View starts it again once its owned supervisor has finished shutting down. Profiles are retained.

## Configuration and multiple screens

Version 0.3 adds machine settings for desktop dimensions, ports, display, state directory and Chromium path. Stop the current session before changing state directory, display or ports, then reopen it. CLI settings use short names such as `desktopWidth` in `~/.config/browser-view/settings.json`; custom CLI settings must match the editor, or use the documented `BROWSER_VIEW_*` overrides. Two editor windows or external viewers share one fixed virtual desktop with independent fit/actual-size and view-only choices. Physical monitors are not separate remote displays.
