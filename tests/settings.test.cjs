const test = require('node:test');
const assert = require('node:assert/strict');
const { runtimeEnvironment, navigationUrl } = require('../src/settings.cjs');
const config = values => ({ get: (key, fallback) => values[key] ?? fallback });
test('runtime settings preserve explicit isolated environment and require sandbox opt-in', () => {
  const env = runtimeEnvironment(config({ desktopWidth: 1920, allowNoSandbox: false }), { BROWSER_VIEW_WEB_PORT: '6200', BROWSER_VIEW_ALLOW_NO_SANDBOX: '1' });
  assert.equal(env.BROWSER_VIEW_WIDTH, '1920'); assert.equal(env.BROWSER_VIEW_WEB_PORT, '6200'); assert.equal(env.BROWSER_VIEW_ALLOW_NO_SANDBOX, '0');
});
test('state directory is absolute and user home expansion is supported', () => {
  assert.throws(() => runtimeEnvironment(config({ stateDirectory: './local' }), {}), /absolute/);
  assert.match(runtimeEnvironment(config({ stateDirectory: '~/browser' }), {}).BROWSER_VIEW_STATE, /^\//);
});
test('navigation handles local shorthand without allowing dangerous protocols or credentials', () => {
  assert.equal(navigationUrl(' localhost:5173/test '), 'http://localhost:5173/test');
  assert.equal(navigationUrl('[::1]:5173'), 'http://[::1]:5173/');
  for (const value of ['file:///etc/passwd', 'javascript:alert(1)', 'http://user:pass@example.com', '--no-sandbox', 'not a url']) assert.throws(() => navigationUrl(value));
});
