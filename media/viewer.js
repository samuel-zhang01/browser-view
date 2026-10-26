import RFB from '@novnc/novnc';
const api = acquireVsCodeApi();
const client = crypto.randomUUID();
const post = message => api.postMessage({ ...message, client });
const status = document.getElementById('status');
const saved = api.getState() || {};
let channel, rfb, generation = 0, visible = true, initialized = false, connected = false, connecting = false, timeout;
let viewOnly = saved.viewOnly === true, actualSize = saved.actualSize === true;
let quality = 6, compression = 2;
// noVNC releases held keys on window blur, but toolbar focus stays in this window.
const releaseKeys = () => window.dispatchEvent(new Event('blur'));
document.getElementById('screen').addEventListener('focusout', releaseKeys);
const save = () => api.setState({ viewOnly, actualSize }); // Never persist entered URLs or page contents.
function renderStatus() {
  status.textContent = !visible ? 'Paused while hidden' : connecting ? 'Connecting…' : !connected ? 'Disconnected · Reconnect to resume' : viewOnly ? 'Connected · View only · Agent can still interact' : 'Connected · Shared mouse and keyboard';
  document.body.dataset.connected = String(connected);
}
function controls() {
  document.getElementById('view-only').setAttribute('aria-pressed', String(viewOnly));
  document.getElementById('scale').setAttribute('aria-pressed', String(actualSize));
  if (rfb) { rfb.viewOnly = viewOnly; rfb.scaleViewport = !actualSize; rfb.clipViewport = false; }
}
function connect() {
  if (!visible || !initialized) return;
  const id = ++generation; // Invalidate handlers before disconnecting the old viewer.
  clearTimeout(timeout);
  rfb?.disconnect();
  document.getElementById('screen').replaceChildren();
  connected = false; connecting = true;
  channel = {
    binaryType: 'arraybuffer', protocol: '', readyState: 0, onopen: null, onmessage: null, onerror: null, onclose: null,
    send(data) { const bytes = new Uint8Array(data.buffer || data, data.byteOffset || 0, data.byteLength); post({ type: 'data', id, data: bytes.slice().buffer }); },
    close() { this.readyState = 3; post({ type: 'disconnect', id }); },
  };
  rfb = new RFB(document.getElementById('screen'), channel, { shared: true });
  rfb.resizeSession = false; // Viewers on other monitors must not resize the shared desktop.
  rfb.qualityLevel = quality; rfb.compressionLevel = compression; controls();
  rfb.addEventListener('connect', () => {
    if (id !== generation) return;
    clearTimeout(timeout); connected = true; connecting = false; renderStatus();
    const canvas = document.querySelector('canvas');
    canvas?.setAttribute('aria-label', 'Shared browser input. Press Shift+Escape to return to the toolbar.');
  });
  rfb.addEventListener('disconnect', () => { if (id !== generation) return; clearTimeout(timeout); connected = false; connecting = false; renderStatus(); });
  renderStatus();
  timeout = setTimeout(() => { if (id !== generation || connected) return; rfb.disconnect(); status.textContent = 'Connection timed out · Reconnect or run Browser View: Diagnostics'; }, 20000);
  post({ type: 'connect', id });
}
window.addEventListener('message', event => {
  const message = event.data;
  if (!message || typeof message !== 'object') return;
  if (message.client && message.client !== client) return;
  if (message.type === 'init') { initialized = true; visible = message.visible; connect(); return; }
  if (message.type === 'resume') { visible = true; if (!connected && !connecting) connect(); return; }
  if (message.type === 'visibility') {
    const changed = visible !== message.visible;
    visible = message.visible;
    if (visible && changed) connect();
    else if (!visible) { clearTimeout(timeout); rfb?.disconnect(); connected = false; connecting = false; renderStatus(); }
    return;
  }
  if (message.type === 'config') { quality = message.quality; compression = message.compression; if (rfb) {rfb.qualityLevel = quality; rfb.compressionLevel = compression;} return; }
  if (message.type === 'notice') { status.textContent = message.message; return; }
  if (message.type === 'navigating') { document.getElementById('go').disabled = true; status.textContent = 'Opening page…'; return; }
  if (message.type === 'navigated') { renderStatus(); return; }
  if (message.type === 'navigationDone') { document.getElementById('go').disabled = false; return; }
  if (message.id !== generation) return;
  if (message.type === 'open') { channel.readyState = 1; channel.onopen?.(); }
  else if (message.type === 'data') {
    try { channel.onmessage?.({ data: message.data }); post({ type: 'ack', id: generation, seq: message.seq }); }
    catch { rfb?.disconnect(); status.textContent = 'Display decoding failed. Reconnect to resume.'; }
  } else if (message.type === 'close') { channel.readyState = 3; channel.onclose?.({ code: 1000, reason: 'Closed' }); }
  else if (message.type === 'error') { rfb?.disconnect(); status.textContent = message.message; }
});
document.getElementById('reconnect').onclick = connect;
document.getElementById('external').onclick = () => post({ type: 'external' });
document.getElementById('view-only').onclick = () => { releaseKeys(); viewOnly = !viewOnly; controls(); save(); renderStatus(); };
document.getElementById('scale').onclick = () => { actualSize = !actualSize; controls(); save(); };
document.getElementById('navigate').onsubmit = event => { event.preventDefault(); post({ type: 'navigate', url: document.getElementById('url').value }); };
window.addEventListener('keydown', event => {
  if (event.key === 'Escape' && event.shiftKey) { event.preventDefault(); event.stopImmediatePropagation(); releaseKeys(); rfb?.blur(); document.getElementById('url').focus(); }
}, true);
controls();
post({ type: 'ready' });
