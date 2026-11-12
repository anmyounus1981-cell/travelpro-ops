import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the actual Server Action with an in-memory database boundary.
// This tests orchestration, not live Postgres transactions/RLS.
const source = readFileSync(new URL('../app/actions.ts', import.meta.url), 'utf8');
const action = source.slice(source.indexOf('export async function transitionQuotation('), source.indexOf('export async function createBooking('));
const javascript = ts.transpileModule(action.replace('export async', 'async'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

function setup(options = {}) {
  const state = { quote: { id: 'quote', case_id: 'case', status: options.status || 'draft' },
    caseStatus: options.caseStatus || 'new', updates: [], audits: [], refreshed: [] };
  const db = { from(table) {
    let patch, filters = [], allowed;
    const query = {
      select() { return query; },
      eq(key, value) { filters.push([key, value]); return query; },
      in(key, values) { allowed = values; return query; },
      update(value) { patch = value; return query; },
      async single() { return { data: state.quote, error: options.readError }; },
      async maybeSingle() {
        if (table === 'quotations') {
          assert.deepEqual(filters, [['id', 'quote'], ['status', options.status || 'draft']]);
          if (options.conflict) return { data: null, error: null };
          if (options.updateError) return { data: null, error: options.updateError };
          state.updates.push({ table, patch }); Object.assign(state.quote, patch);
        } else {
          if (options.caseError) return { data: null, error: options.caseError };
          if (!allowed.includes(state.caseStatus)) return { data: null, error: null };
          state.updates.push({ table, patch }); state.caseStatus = patch.status;
        }
        return { data: { id: table }, error: null };
      },
    };
    return query;
  } };
  const context = vm.createContext({
    createClient: async () => db,
    requireOwnerId: async () => { if (options.denied) throw Error('Owner access required'); return 'actual-owner'; },
    text: (fd, key) => String(fd.get(key) || '').trim(),
    audit: async (...args) => { if (options.auditError) throw Error('Audit unavailable'); state.audits.push(args); },
    revalidatePath: path => state.refreshed.push(path),
  });
  vm.runInContext(javascript, context);
  const run = (requested) => {
    const fd = new FormData(); fd.set('id', options.emptyId ? '' : 'quote');
    if (requested) fd.set('status', requested);
    return context.transitionQuotation(fd);
  };
  return { state, run };
}

test('approval records resolved owner and refreshes quotation page', async () => {
  const { state, run } = setup(); await run();
  assert.equal(state.quote.approved_by, 'actual-owner');
  assert.equal(state.caseStatus, 'quoted'); assert.equal(state.audits.length, 1);
  assert.ok(state.refreshed.includes('/quotations'));
});
test('sending preserves original approver and does not update case', async () => {
  const { state, run } = setup({ status: 'approved' }); state.quote.approved_by = 'original'; await run();
  assert.equal(state.quote.approved_by, 'original'); assert.equal(state.updates.length, 1);
});
test('non-owner rejected before any mutation', async () => {
  const { state, run } = setup({ denied: true }); await assert.rejects(run(), /Owner access required/); assert.equal(state.updates.length, 0);
});
test('empty ID rejected', async () => { const { run } = setup({ emptyId: true }); await assert.rejects(run(), /ID is required/); });
test('read failure preserved', async () => { const { run } = setup({ readError: Error('read failed') }); await assert.rejects(run(), /read failed/); });
test('draft cannot be sent directly', async () => { const { state, run } = setup(); await assert.rejects(run('sent'), /Invalid quotation/); assert.equal(state.updates.length, 0); });
test('accepted quotation cannot be advanced implicitly', async () => { const { run } = setup({ status: 'accepted' }); await assert.rejects(run(), /Invalid quotation/); });
test('concurrent status change stops dependent writes and audit', async () => {
  const { state, run } = setup({ conflict: true }); await assert.rejects(run(), /changed during review/); assert.equal(state.updates.length, 0); assert.equal(state.audits.length, 0);
});
test('quotation write error preserved', async () => { const { run } = setup({ updateError: Error('write failed') }); await assert.rejects(run(), /write failed/); });
test('case failure reports partial completion honestly', async () => {
  const { state, run } = setup({ caseError: Error('case failed') }); await assert.rejects(run(), /approval was saved/); assert.equal(state.quote.status, 'approved'); assert.equal(state.audits.length, 0);
});
test('booked case cannot regress to quoted', async () => {
  const { state, run } = setup({ caseStatus: 'booked' }); await assert.rejects(run(), /case update did not complete/); assert.equal(state.caseStatus, 'booked');
});
test('audit failure reports saved state without claiming success', async () => {
  const { state, run } = setup({ auditError: true }); await assert.rejects(run(), /audit completion is unverified/); assert.equal(state.quote.status, 'approved'); assert.equal(state.refreshed.length, 0);
});
