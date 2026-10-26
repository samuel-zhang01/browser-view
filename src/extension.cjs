const vscode = require('vscode');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { Bridge } = require('./bridge.cjs');
const { runtimeEnvironment, navigationUrl } = require('./settings.cjs');
const { viewerHtml } = require('./viewer-html.cjs');
const run = promisify(execFile);
let panel, opening, stopping;
function activate(context) {
  const output = vscode.window.createOutputChannel('Browser View');
  context.subscriptions.push(output);
  output.appendLine(`Browser View ${context.extension.packageJSON.version} loaded from ${context.extensionPath}`);
  const runtime = path.join(context.extensionPath, 'runtime');
  function env() {
    const config = vscode.workspace.getConfiguration('browserView');
    return runtimeEnvironment(config);
  }
  async function session(action) {
    if (!vscode.workspace.isTrusted) throw Error('Trust the workspace before starting Browser View.');
    if (process.platform !== 'linux') throw Error('Browser View needs a Linux extension host. Connect with Remote SSH or WSL.');
    let result;
    try { result = await run('python3', [path.join(runtime, 'session.py'), action], { env: env(), timeout: 60000, maxBuffer: 1024 * 1024 }); }
    catch (error) { throw Error(error.code === 'ENOENT' ? 'Python 3 is missing on the Linux extension host.' : (error.stderr?.trim() || 'Browser runtime command failed. Run Browser View: Diagnostics.')); }
    return JSON.parse(result.stdout);
  }
  async function open() {
    if (stopping) await stopping;
    if (opening) return opening;
    opening = (async () => {
      const state = await session('start');
      if (panel) { panel.reveal(panel.viewColumn); await panel.webview.postMessage({type: 'resume'}); return; }
      const media = vscode.Uri.joinPath(context.extensionUri, 'media');
      const current = vscode.window.createWebviewPanel('browserView', 'Browser View', vscode.ViewColumn.Beside, {
        enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [media], enableCommandUris: false,
      });
      panel = current;
      let client;
      const bridge = new Bridge({ postMessage: message => current.webview.postMessage({ ...message, client }) }, state.socket);
      let disposed = false, navigating = false, wasVisible = current.visible;
      const send = message => { if (!disposed) Promise.resolve(current.webview.postMessage({ ...message, client })).catch(() => {}); };
      current.onDidDispose(() => { disposed = true; bridge.disconnect(); if (panel === current) panel = undefined; output.appendLine(JSON.stringify({ event: 'viewer-closed', ...bridge.stats })); });
      current.onDidChangeViewState(event => {
        if (event.webviewPanel.visible === wasVisible) return;
        wasVisible = event.webviewPanel.visible;
        if (!event.webviewPanel.visible) bridge.disconnect();
        send({ type: 'visibility', visible: event.webviewPanel.visible });
      });
      current.webview.onDidReceiveMessage(async message => {
        if (disposed || !message || typeof message !== 'object') return;
        if (message.type === 'ready' && typeof message.client === 'string' && /^[a-f0-9-]{36}$/.test(message.client)) {
          client = message.client; bridge.disconnect(); bridge.id = 0;
          send({ type: 'init', visible: current.visible });
        } else if (message.client !== client) return;
        else if (message.type === 'connect' && Number.isSafeInteger(message.id) && message.id > 0) {
          if (!current.visible || message.id <= (bridge.id || 0)) return;
          const config = vscode.workspace.getConfiguration('browserView');
          send({ type: 'config', quality: config.get('quality', 6), compression: config.get('compression', 2) });
          bridge.connect(message.id);
        } else if (message.type === 'ack' || message.type === 'data') bridge.receive(message);
        else if (message.type === 'disconnect' && message.id === bridge.id) bridge.disconnect();
        else if (message.type === 'external') {
          const template = process.env.VSCODE_PROXY_URI;
          const port = new URL(state.viewer).port;
          const url = template ? template.replace('{{port}}', port) : state.viewer;
          try {
            const parsed = new URL(url);
            if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.href.includes('{{')) throw Error('Invalid viewer proxy URL.');
            if (!await vscode.env.openExternal(vscode.Uri.parse(parsed.href))) throw Error('Browser could not be opened.');
          } catch { send({ type: 'notice', message: 'Could not open the viewer. Check VSCODE_PROXY_URI or forward the viewer port privately.' }); }
        } else if (message.type === 'navigate' && !navigating && typeof message.url === 'string' && message.url.length <= 8192) {
          try {
            const url = navigationUrl(message.url);
            navigating = true;
            send({ type: 'navigating' });
            try { await run('node', [path.join(runtime, 'browser.cjs'), 'goto', url], { env: { ...env(), BROWSER_VIEW_CDP: state.cdp }, timeout: 35000, maxBuffer: 1024 * 1024 }); }
            catch { throw Error('Navigation failed or timed out. Check the address and that the app is running on the extension host.'); }
            send({ type: 'navigated' });
          } catch (error) { send({ type: 'notice', message: error.message }); }
          finally { navigating = false; send({ type: 'navigationDone' }); }
        }
      });
      const nonce = crypto.randomBytes(18).toString('base64');
      const script = current.webview.asWebviewUri(vscode.Uri.joinPath(media, 'viewer.bundle.js'));
      const css = current.webview.asWebviewUri(vscode.Uri.joinPath(media, 'viewer.css'));
      current.webview.html = viewerHtml({ nonce, script, css, cspSource: current.webview.cspSource });
    })().catch(error => { output.appendLine(error.message); vscode.window.showErrorMessage(error.message); }).finally(() => { opening = undefined; });
    return opening;
  }
  for (const command of ['browserView.open', 'sharedBrowser.open']) context.subscriptions.push(vscode.commands.registerCommand(command, open));
  context.subscriptions.push(vscode.commands.registerCommand('browserView.stop', async () => {
    if (stopping) return stopping;
    stopping = (async () => {
      if (opening) await opening;
      if (panel) panel.dispose();
      await session('stop');
      vscode.window.showInformationMessage('Browser View stopped. Its profile is retained.');
    })().catch(error => vscode.window.showErrorMessage(error.message)).finally(() => { stopping = undefined; });
    return stopping;
  }));
  context.subscriptions.push(vscode.commands.registerCommand('browserView.diagnostics', async () => {
    try { output.appendLine(JSON.stringify(await session('status'), null, 2)); output.show(true); }
    catch (error) { output.appendLine(error.message); output.show(true); }
  }));
}
exports.activate = activate;
exports.deactivate = () => panel?.dispose();
