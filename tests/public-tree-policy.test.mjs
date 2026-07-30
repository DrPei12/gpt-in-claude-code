import assert from 'node:assert/strict';
import { inspectPublicContent, inspectPublicPath } from '../scripts/public-tree-policy.mjs';

const slash = String.fromCharCode(92);
const windowsUserPath = ['C:', 'Users', 'example-user', 'auth.json'].join(slash);
const windowsToolPath = ['D:', 'Tools', 'private-bridge', 'config.yaml'].join(slash);
const posixUserPath = ['', 'home', 'example-user', '.config', 'service', 'auth.json'].join('/');

function inspect(text, environment = {}) {
  return inspectPublicContent(Buffer.from(text, 'utf8'), environment);
}

assert(inspect(windowsUserPath).includes('detected local Windows user path'));
assert(inspect(windowsToolPath).includes('detected local Windows workspace path'));
assert(inspect(`config=${posixUserPath}`).includes('detected local POSIX user path'));
assert(inspect(`path=${windowsUserPath}`, { USERPROFILE: windowsUserPath })
  .includes('detected current machine identifier'));
assert(inspect('build-host-47', { COMPUTERNAME: 'BUILD-HOST-47' })
  .includes('detected current machine identifier'));

assert.deepEqual(inspectPublicPath(['nested', '.codex', 'auth.json'].join('/')), [
  'private runtime file must not be published',
  'private runtime directory must not be published',
]);
assert.deepEqual(inspectPublicPath('env.example'), []);

const providerKey = `sk-${'a'.repeat(32)}`;
assert(inspect(providerKey).includes('detected OpenAI secret key'));
const providerToken = ['provider', 'production', 'token', 'value'].join('-');
assert(inspect(JSON.stringify({ access_token: providerToken }))
  .includes('detected embedded provider token'));
assert.deepEqual(inspect('{"access_token":"test-access-token"}'), []);

const privateKey = ['-----BEGIN ', 'PRIVATE KEY-----', 'sensitive-material'].join('');
assert(inspect(privateKey).includes('detected private key material'));

assert.deepEqual(inspect('C:' + slash + 'managed' + slash + 'proxy.yaml'), []);
assert.deepEqual(inspect('https://github.com/example/project'), []);

console.log('public tree policy tests passed');
