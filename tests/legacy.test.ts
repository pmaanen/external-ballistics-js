import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

test('R10: legacy example recalculates zero sight height and identifies stale invalid inputs', () => {
  const status = { textContent: '' };
  function Vue() {} Vue.use = () => {};
  const c = vm.createContext({ Vue, Vuetify: {}, VueCharts: {}, document: { getElementById: () => status } });
  vm.runInContext(readFileSync(new URL('../src/external-ballistics.js', import.meta.url), 'utf8'), c);
  vm.runInContext(readFileSync(new URL('../example_app/js/example_app.js', import.meta.url), 'utf8'), c, { timeout: 2000 });
  vm.runInContext('externalBallisticsVariables.sightHeight = 0; calculateExternalBallistics(0);', c, { timeout: 2000 });
  assert.equal(vm.runInContext('externalBallisticsVariables.ballisticsDatasets[0].data[0]', c), '0.00');
  vm.runInContext('externalBallisticsVariables.bulletMass = ""; calculateExternalBallistics(1);', c);
  assert.match(status.textContent, /stale/);
});
