const net = require('node:net');
const CHUNK = 64 * 1024;
const WINDOW = 4;
const LIMIT = CHUNK * WINDOW;

class Bridge {
  constructor(webview, socketPath, options = {}) {
    this.webview = webview;
    this.socketPath = socketPath;
    this.connectSocket = options.connect || (path => net.createConnection({ path, highWaterMark: CHUNK }));
    this.ackTimeout = options.ackTimeout || 15000;
    this.generation = 0;
    this.stats = { bytes: 0, frames: 0, maxInFlightBytes: 0 };
    this.pending = new Map();
  }
  post(message) {
    const generation = this.generation;
    Promise.resolve(this.webview.postMessage(message)).then(sent => {
      if (generation === this.generation && sent === false && this.socket) this.disconnect();
    }).catch(() => { if (generation === this.generation) this.disconnect(); });
  }
  connect(id) {
    this.disconnect();
    this.id = id;
    const generation = this.generation;
    const socket = this.connectSocket(this.socketPath);
    this.socket = socket;
    this.sequence = 0;
    const current = () => this.generation === generation && this.socket === socket;
    socket.on('connect', () => { if (current()) this.post({ type: 'open', id }); });
    socket.on('data', data => {
      if (!current()) return;
      // TCP is paused at the advertised window. Never retain an unbounded frame queue.
      if (data.length > CHUNK || this.pending.size >= WINDOW) return this.fail('Display buffer limit exceeded. Reconnect to resume.');
      const seq = ++this.sequence;
      this.pending.set(seq, { bytes: data.length, time: Date.now() });
      this.stats.bytes += data.length;
      this.stats.frames++;
      this.stats.maxInFlightBytes = Math.max(this.stats.maxInFlightBytes, this.inFlightBytes());
      const copy = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
      this.post({ type: 'data', id, seq, data: copy });
      if (this.pending.size >= WINDOW) socket.pause();
    });
    socket.on('error', error => { if (current()) this.fail(`Desktop connection failed: ${error.code || 'unknown error'}`); });
    socket.on('close', () => { if (current()) { this.disconnect(); this.post({ type: 'close', id }); } });
    this.timer = setInterval(() => {
      const first = this.pending.values().next().value;
      if (first && Date.now() - first.time > this.ackTimeout) this.fail('Viewer stopped responding. Reconnect to resume.');
    }, Math.min(1000, this.ackTimeout));
    this.timer.unref?.();
  }
  inFlightBytes() { return [...this.pending.values()].reduce((sum, item) => sum + item.bytes, 0); }
  receive(message) {
    if (!message || message.id !== this.id || !this.socket) return;
    if (message.type === 'ack' && Number.isSafeInteger(message.seq) && this.pending.delete(message.seq)) {
      if (this.pending.size < WINDOW) this.socket.resume();
    } else if (message.type === 'data') {
      if (!(message.data instanceof ArrayBuffer) || message.data.byteLength > CHUNK || !message.data.byteLength) return this.fail('Invalid input message.');
      if (this.socket.writableLength + message.data.byteLength > LIMIT) return this.fail('Desktop input buffer limit exceeded.');
      this.socket.write(Buffer.from(message.data));
    }
  }
  fail(message) {
    const id = this.id;
    this.disconnect();
    this.post({ type: 'error', id, message });
  }
  disconnect() {
    this.generation++;
    clearInterval(this.timer);
    this.pending.clear();
    if (this.socket) { const socket = this.socket; this.socket = undefined; socket.destroy(); }
  }
}
module.exports = { Bridge, CHUNK, WINDOW, LIMIT };
