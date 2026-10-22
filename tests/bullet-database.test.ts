import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { bulletSelection, parseBulletDatabase, parseCSV, searchBullets } from '../src/ballistics/bullet-database';
import { defaultScenario, validateScenario } from '../src/ballistics/model';
import { toSI } from '../src/ballistics/units';
const raw = readFileSync(new URL('../src/data/wilson/bullet_database.csv', import.meta.url));
const source = JSON.parse(readFileSync(new URL('../src/data/wilson/source.json', import.meta.url), 'utf8'));
const catalog = parseBulletDatabase(raw.toString('utf8'));

test('pinned Wilson snapshot retains its source bytes, credits and all real records', () => {
  assert.equal(createHash('sha256').update(raw).digest('hex'), source.sha256);
  assert.equal(createHash('sha1').update(`blob ${raw.length}\0`).update(raw).digest('hex'), '4c0b61b13b5e85345037bdb1a93523dd1240ebdf');
  assert.equal(catalog.bullets.length, 5686); assert.equal(source.records, 5686);
  assert.equal(catalog.blankRows, 5); assert.equal(catalog.invalidRows, 0);
  assert.equal(new Set(catalog.bullets.map(b => b.manufacturer)).size, 122);
  assert.equal(new Set(catalog.bullets.map(b => b.id)).size, catalog.bullets.length);
  const license = readFileSync(new URL('../src/data/wilson/LICENSE', import.meta.url), 'utf8');
  assert.ok(license.includes('Copyright (c) 2026 Wilson Kinetics'));
  assert.ok(readFileSync(new URL('../public/THIRD_PARTY_NOTICES.txt', import.meta.url), 'utf8').includes(license));
});

test('CSV parser handles BOM, quoted commas, quotes, CRLF and quoted newlines', () => {
  assert.deepEqual(parseCSV('\uFEFF"a","b"\r\n"A, B","A ""quote""\nsecond line"\r\n'), [['a', 'b'], ['A, B', 'A "quote"\nsecond line']]);
  assert.throws(() => parseCSV('"unclosed'), /Unclosed/);
  assert.throws(() => parseBulletDatabase('wrong,columns'), /columns/);
  const invalid = parseBulletDatabase('"Caliber","Manufacturer","Bullet Name","Grain","G1 BC","G7 BC"\n0.3,M,N,0,0.4,0\n0.3,M,N,10,0.4\n');
  assert.equal(invalid.bullets.length, 0); assert.equal(invalid.invalidRows, 2);
});

test('bullet selection preserves listed G1/G7 pairs and SI mass without overwriting other scenario values', () => {
  const b = catalog.bullets.find(b => b.name === 'AR Hybrid OTM 26195')!;
  assert.equal(b.bc.G1, .614); assert.equal(b.bc.G7, .291);
  for (const model of ['G1', 'G7'] as const) {
    const patch = bulletSelection(b, model), result = { ...defaultScenario, ...patch };
    assert.equal(result.bc, b.bc[model]); assert.equal(result.dragModel, model);
    assert.equal(result.massKg, toSI(130, 'gr'));
    assert.equal(result.muzzleMps, defaultScenario.muzzleMps);
    assert.equal(result.zeroRangeM, defaultScenario.zeroRangeM);
    validateScenario(result);
  }
  const oneModel = catalog.bullets.find(b => b.bc.G1 && !b.bc.G7)!;
  assert.ok(Number.isNaN(bulletSelection(oneModel, 'G7').bc));
  assert.ok(Number.isNaN(bulletSelection(b, 'G5').bc));
  assert.throws(() => { (b.bc as { G1: number }).G1 = 1; });
});

test('missing and out-of-range BCs require manual entry instead of retaining a previous BC', () => {
  const missing = catalog.bullets.find(b => b.name === 'FPBB EPRX')!;
  const invalid = catalog.bullets.find(b => b.manufacturer === 'LEE' && b.name === '457-500-3R')!;
  assert.equal(invalid.sourceBC.G1, '443'); assert.equal(invalid.bc.G1, null);
  for (const b of [missing, invalid]) {
    const scenario = { ...defaultScenario, ...bulletSelection(b, 'G1') };
    assert.ok(Number.isNaN(scenario.bc)); assert.throws(() => validateScenario(scenario));
    scenario.bc = .4; validateScenario(scenario);
  }
});

test('catalog searches intersect words, manufacturer and physical diameter filters', () => {
  const records = searchBullets(catalog.bullets, 'berger 130 hybrid', 'Berger', '.264');
  assert.ok(records.length > 0);
  assert.ok(records.some(b => b.name === 'AR Hybrid OTM 26195'));
  assert.equal(searchBullets(catalog.bullets, 'berger', 'Sierra').length, 0);
  assert.ok(searchBullets(catalog.bullets, '7.823', 'Sierra', '.308').length > 0);
  assert.equal(searchBullets(catalog.bullets, 'no-such-bullet-xyz').length, 0);
});
