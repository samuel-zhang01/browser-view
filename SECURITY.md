# Security

Browser View is for a trusted, single-user Linux extension host. Chromium pages
run with that user's network and filesystem access. View only blocks input from
one viewer; other viewers and agents retain control. It is not an access-control
boundary.

- Keep Chromium's sandbox enabled. The root-container exception is explicit and
  disabled by default. Use a non-root account for regular browsing.
- Keep code-server authenticated and use trusted HTTPS. For Remote SSH, use
  private port forwarding. Never publish CDP, VNC or the standalone viewer as an
  unauthenticated internet service.
- Browser profiles contain cookies and storage. State stays in a private local
  directory; it is not included in source or release packages.
- The desktop uses an authenticated X display and a private Unix VNC socket.
  The viewer and CDP bind to loopback. Startup checks that VNC has no TCP listener.
- Workspaces must be trusted. Runtime commands use argument arrays, not shell
  interpolation. The panel has a restrictive CSP and bounded binary transport.
- Browser View does not enforce code-server's file-download policies inside
  Chromium and has no audio forwarding or automatic host clipboard sync.
- No extension telemetry is collected. Chromium and visited pages have their own
  network behavior.

For a sensitive report, use the repository's private vulnerability reporting
feature when available. Do not put exploit credentials or personal browser data
in a public issue. For nonsensitive defects, use the bug template.
