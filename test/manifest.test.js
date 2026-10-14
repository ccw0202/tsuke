const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('the committed manifest keeps advanced services, scopes, and web app access', () => {
  const manifest = JSON.parse(fs.readFileSync('appsscript.json', 'utf8'));
  const services = manifest.dependencies.enabledAdvancedServices;
  const symbols = services.map((service) => service.userSymbol).sort();
  assert.deepEqual(symbols, ['Calendar', 'Sheets']);
  assert.equal(services.find((service) => service.userSymbol === 'Sheets').serviceId, 'sheets');
  assert.equal(services.find((service) => service.userSymbol === 'Sheets').version, 'v4');
  assert.equal(services.find((service) => service.userSymbol === 'Calendar').serviceId, 'calendar');
  assert.equal(services.find((service) => service.userSymbol === 'Calendar').version, 'v3');
  assert.equal(manifest.timeZone, 'Asia/Taipei');
  assert.equal(manifest.webapp.executeAs, 'USER_DEPLOYING');
  assert.equal(manifest.webapp.access, 'MYSELF');
  assert.deepEqual(manifest.oauthScopes, [
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/calendar.app.created',
    'https://www.googleapis.com/auth/calendar.addons.execute'
  ]);
});

test('deploy docs create the script outside the repo and restore an overwritten manifest', () => {
  const readme = fs.readFileSync('README.md', 'utf8');
  assert.equal(readme.includes('--rootDir /tmp/tsuke-clasp-create'), true);
  assert.equal(readme.includes('git checkout -- appsscript.json'), true);
  assert.equal(readme.includes('clasp create --title "Tsuke" --type standalone --rootDir .'), false);
  const runtime = fs.readFileSync('src/Runtime.js', 'utf8');
  assert.match(runtime, /typeof Sheets === 'undefined'/);
  assert.match(runtime, /typeof Calendar === 'undefined'/);
  assert.match(runtime, /git checkout -- appsscript\.json/);
  const setup = fs.readFileSync('src/Setup.js', 'utf8');
  assert.equal(setup.includes('requireAdvancedServices_()'), true);
  const ledger = fs.readFileSync('src/Ledger.js', 'utf8');
  assert.equal(ledger.includes('requireAdvancedServices_()'), true);
});
