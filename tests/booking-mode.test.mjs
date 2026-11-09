import test from 'node:test';
import assert from 'node:assert/strict';
import { bookingMode, simulationReference } from '../lib/booking-mode.mjs';

test('approved staging selects simulation; production selects live', () => {
  assert.equal(bookingMode('staging','zkrpbcxukbtbsakcepxv'),'simulation');
  assert.equal(bookingMode('production','zhqdssbysdebgeijscvm'),'live');
});
test('cross-environment booking writes fail closed', () => {
  for (const [mode, ref] of [['staging','zhqdssbysdebgeijscvm'],['production','zkrpbcxukbtbsakcepxv'],['staging','abcdefghijklmnopqrst'],['development','zkrpbcxukbtbsakcepxv'],[undefined,undefined]]) {
    assert.throws(() => bookingMode(mode,ref));
  }
});
test('simulation reference is normalized independently of real PNR', () => {
  assert.equal(simulationReference(' test99 '),'TEST99');
  for (const invalid of ['',null,'AB','A'.repeat(33),'TEST 99','<script>']) assert.throws(() => simulationReference(invalid));
});
