// Self-contained regression check for the static GitHub Pages dashboard.
// node tests/day-one-pages-check.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const STORAGE_KEY = 'TAKY_ERP_PROTOTYPE_STATE_V1';
const FLAG = 'TAKY_ERP_DAY_ONE_RESET_20261031';
const BACKUP = 'TAKY_ERP_BEFORE_DAY_ONE_20261031';

function launch(html, storage) {
  const scripts = [...html.matchAll(/<script\s*>([\s\S]*?)<\/script>/gi)];
  assert.equal(scripts.length, 1, 'Expected one inline application script');
  const ctx = vm.createContext({
    localStorage: {
      getItem: key => storage.has(key) ? storage.get(key) : null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key)
    },
    Date,
    Map,
    Number,
    Array,
    String,
    JSON,
    Math,
    console,
    window: { addEventListener: () => {}, confirm: () => true },
    document: { addEventListener: () => {}, getElementById: () => null }
  });
  vm.runInContext(scripts[0][1], ctx, { timeout: 3000 });
  return JSON.parse(vm.runInContext('JSON.stringify(state)', ctx, { timeout: 3000 }));
}

function verifyEmpty(state) {
  assert.equal(state.rooms.length, 15);
  assert.deepEqual(state.rooms.map(room => room.roomNumber), [
    '101', '102', '103', '104', '105',
    '201', '202', '203', '204', '205',
    '301', '302', '303', '304', '305'
  ]);
  for (const room of state.rooms) {
    assert.equal(room.status, 'AVAILABLE');
    assert.equal(room.prevWater, 0);
    assert.equal(room.currWater, 0);
    assert.equal(room.prevElec, 0);
    assert.equal(room.currElec, 0);
    assert.equal(room.depositSatang, 0);
    assert.equal(room.arrearsSatang, 0);
    assert.equal(room.tenantName, '');
  }
  for (const key of ['invoices', 'expenses', 'settlements']) {
    assert.equal(state[key].length, 0, key);
  }
  assert.equal(state.settings.electricityRateSatang > 0, true);
  assert.equal(state.settings.waterRateSatang > 0, true);
}

for (const file of ['index.html', 'prototype/index.html']) {
  const html = fs.readFileSync(file, 'utf8');
  const storage = new Map();
  const fresh = launch(html, storage);
  verifyEmpty(fresh);
  assert.equal(storage.get(FLAG), 'complete');
  assert.equal(JSON.parse(storage.get(STORAGE_KEY)).invoices.length, 0);

  // A browser with saved demo or operating data must archive it before reset.
  const saved = JSON.parse(JSON.stringify(fresh));
  saved.rooms[0].status = 'OCCUPIED';
  saved.rooms[0].tenantName = 'TEST OCCUPANT';
  saved.rooms[0].prevWater = 18;
  saved.invoices = [{ id: 'INV-TEST', totalSatang: 10000, paidSatang: 10000 }];
  saved.expenses = [{ id: 'EXP-TEST', amountSatang: 1000 }];
  saved.settings.electricityRateSatang = 777;
  storage.set(STORAGE_KEY, JSON.stringify(saved));
  storage.delete(FLAG);
  const migrated = launch(html, storage);
  verifyEmpty(migrated);
  assert.equal(migrated.settings.electricityRateSatang, 777);
  assert.equal(JSON.parse(storage.get(BACKUP)).rooms[0].tenantName, 'TEST OCCUPANT');

  // Migration is one time; later real transactions must persist across reload.
  const after = JSON.parse(storage.get(STORAGE_KEY));
  after.rooms[0].status = 'OCCUPIED';
  after.rooms[0].tenantName = 'REAL TENANT';
  storage.set(STORAGE_KEY, JSON.stringify(after));
  const reloaded = launch(html, storage);
  assert.equal(reloaded.rooms[0].tenantName, 'REAL TENANT');
  assert.equal(reloaded.rooms[0].status, 'OCCUPIED');
  assert.equal(JSON.parse(storage.get(BACKUP)).rooms[0].tenantName, 'TEST OCCUPANT');

  console.log('PASS', file, 'new browser, migration backup, settings, no re-reset');
}
