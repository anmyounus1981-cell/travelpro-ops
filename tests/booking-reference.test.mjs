import test from 'node:test';
import assert from 'node:assert/strict';
import { bookingReference } from '../lib/booking-reference.mjs';
test('simulation uses explicit reference, never a real PNR label', () => {
 assert.equal(bookingReference({execution_mode:'simulation',simulation_reference:'TEST99',pnr:null}), 'SIMULATION TEST99');
 assert.equal(bookingReference({simulation_reference:'TEST99',pnr:null}), 'SIMULATION TEST99');
 assert.equal(bookingReference({execution_mode:'simulation',pnr:'BAD'}), 'SIMULATION reference unavailable');
});
test('live and missing references render without null or blank', () => {
 assert.equal(bookingReference({pnr:' ABC123 '}), 'PNR ABC123');
 assert.equal(bookingReference({pnr:null}), 'Booking reference unavailable');
});
