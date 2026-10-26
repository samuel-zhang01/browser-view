const path = require('node:path');
const os = require('node:os');
function runtimeEnvironment(config, inherited = process.env) {
  const env = { ...inherited };
  const settings = {
    BROWSER_VIEW_WEB_PORT: ['webPort', 6080], BROWSER_VIEW_CDP_PORT: ['cdpPort', 9222],
    BROWSER_VIEW_DISPLAY: ['display', 98], BROWSER_VIEW_WIDTH: ['desktopWidth', 1440], BROWSER_VIEW_HEIGHT: ['desktopHeight', 1000],
  };
  for (const [key, [name, fallback]] of Object.entries(settings)) env[key] ??= String(config.get(name, fallback));
  const state = config.get('stateDirectory', '');
  if (state && !env.BROWSER_VIEW_STATE) {
    env.BROWSER_VIEW_STATE = state.startsWith('~/') ? path.join(os.homedir(), state.slice(2)) : state;
    if (!path.isAbsolute(env.BROWSER_VIEW_STATE)) throw Error('Browser View: State Directory must be an absolute path or start with ~/.');
  }
  const chromium = config.get('chromiumPath', '');
  if (chromium) env.BROWSER_VIEW_CHROMIUM ??= chromium;
  env.BROWSER_VIEW_ALLOW_NO_SANDBOX = config.get('allowNoSandbox', false) ? '1' : '0';
  return env;
}
function navigationUrl(value) {
  let text = value.trim();
  if (/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(text)) text = 'http://' + text;
  let url;
  try { url = new URL(text); } catch { throw Error('Enter a full http:// or https:// URL, or localhost:port.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw Error('Use an HTTP(S) URL without embedded credentials.');
  return url.href;
}
module.exports = { runtimeEnvironment, navigationUrl };
