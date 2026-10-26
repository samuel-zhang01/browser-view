function viewerHtml({ nonce, script, css, cspSource }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Browser View</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src ${cspSource} 'unsafe-inline'; img-src data: blob:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none';">
<meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="${css}"></head><body>
<header aria-label="Browser controls"><form id="navigate"><input id="url" aria-label="Page URL" placeholder="http://127.0.0.1:5173" autocomplete="off" autocapitalize="off" spellcheck="false" required><button id="go">Go</button></form>
<div class="controls"><button id="reconnect" title="Reconnect this viewer without restarting Chromium">Reconnect</button><button id="view-only" aria-pressed="false" title="Block input from this viewer; the agent and other viewers can still interact">View only</button><button id="scale" aria-pressed="false" title="Show the desktop at its actual size with scrollbars">Actual size</button><button id="external">Open in browser</button></div></header>
<div id="status" role="status" aria-live="polite">Connecting…</div><div id="screen" role="region" aria-label="Shared browser desktop" aria-describedby="input-help"></div>
<footer id="input-help">Shared mouse and keyboard · Shift+Escape returns focus to the toolbar</footer>
<script type="module" nonce="${nonce}" src="${script}"></script></body></html>`;
}
module.exports = { viewerHtml };
