const fs = require('node:fs');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');

const config = {
  host: 'aws-0-ap-southeast-1.pooler.supabase.com',
  port: 5432,
  database: 'postgres',
  user: 'postgres.tpfipndxhroliabwlgyb',
  password: process.env.TRAVELPRO_ATOMIC_DB_PASSWORD,
  ssl: {
    ca: fs.readFileSync(process.argv[2], 'utf8'),
    rejectUnauthorized: true
  },
  connectionTimeoutMillis: 15000,
  statement_timeout: 15000
};

const a = new Client(config);
const b = new Client(config);
const observer = new Client(config);
let stage = 'connect';

async function ownerTransaction(client) {
  await client.query('BEGIN');
  await client.query(`
    SELECT set_config('request.jwt.claim.sub', $1, true),
           set_config('request.jwt.claims', $2, true)
  `, [
    '61e2c0bc-f9d7-47c3-992e-b09c1de10b11',
    JSON.stringify({
      sub: '61e2c0bc-f9d7-47c3-992e-b09c1de10b11',
      role: 'authenticated'
    })
  ]);
  await client.query('SET LOCAL ROLE authenticated');
}

(async () => {
  try {
    await a.connect();
    await b.connect();
    await observer.connect();

    const pidA = (await a.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    const pidB = (await b.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    assert.notEqual(pidA, pidB);

    const inquiryA = randomUUID();
    const inquiryB = randomUUID();
    const requestId = randomUUID();
    const notesA = `cross-inquiry-winner:${inquiryA}`;
    const notesB = `cross-inquiry-loser:${inquiryB}`;

    stage = 'fixtures';
    await observer.query(`
      INSERT INTO public.inquiries
        (id, source, client_type, raw_message, service_type)
      VALUES
        ($1, 'landing_page', 'corporate',
         'SYNTHETIC: cross-inquiry race A', 'flight_booking'),
        ($2, 'landing_page', 'corporate',
         'SYNTHETIC: cross-inquiry race B', 'flight_booking')
    `, [inquiryA, inquiryB]);

    console.log(JSON.stringify({ inquiryA, inquiryB, requestId, pidA, pidB }));

    const date = (await observer.query(`
      SELECT to_char(
        (clock_timestamp() AT TIME ZONE 'Asia/Dhaka')::date + 30,
        'YYYY-MM-DD'
      ) AS departure
    `)).rows[0].departure;

    const payloadA = {
      version: 1, requestId, inquiryId: inquiryA,
      clientId: '10000000-0000-0000-0000-000000000001',
      serviceType: 'flight_booking', reviewConfirmed: true,
      origin: 'DAC', destination: 'BKK',
      departureDate: date, returnDate: '', tripType: 'oneway',
      adultCount: 1, childCount: 0, infantCount: 0,
      cabinClass: 'economy', notes: notesA
    };
    const payloadB = { ...payloadA, inquiryId: inquiryB, notes: notesB };

    stage = 'A conversion, uncommitted';
    await ownerTransaction(a);
    const first = (await a.query(
      'SELECT public.convert_inquiry_to_case($1::jsonb) AS result',
      [JSON.stringify(payloadA)]
    )).rows[0].result;
    assert.equal(first.duplicate, false);

    stage = 'B conversion';
    await ownerTransaction(b);
    await b.query('SAVEPOINT before_conversion');

    const pendingB = b.query(
      'SELECT public.convert_inquiry_to_case($1::jsonb) AS result',
      [JSON.stringify(payloadB)]
    ).then(result => ({ result }), error => ({ error }));

    stage = 'observe B blocked by A';
    let blocking;
    const deadline = Date.now() + 5000;

    while (Date.now() < deadline) {
      const result = await observer.query(`
        SELECT pid, wait_event_type, wait_event,
               pg_blocking_pids(pid) AS blockers
        FROM pg_stat_activity
        WHERE pid = $1
          AND wait_event_type = 'Lock'
          AND $2::integer = ANY(pg_blocking_pids(pid))
      `, [pidB, pidA]);

      if (result.rows.length === 1) {
        blocking = result.rows[0];
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    assert.ok(blocking, 'B blocked by A was not observed');
    console.log('BLOCKING_CONFIRMED', JSON.stringify(blocking));

    stage = 'commit A and verify unique-index rejection';
    await a.query('COMMIT');

    const outcomeB = await pendingB;
    assert.ok(outcomeB.error, 'B unexpectedly reused request identity');
    assert.equal(outcomeB.error.code, '23505');
    assert.equal(
      outcomeB.error.constraint,
      'inquiries_conversion_request_id_unique'
    );

    console.log('UNIQUE_INDEX_REJECTED', JSON.stringify({
      code: outcomeB.error.code,
      constraint: outcomeB.error.constraint
    }));

    await b.query('ROLLBACK TO SAVEPOINT before_conversion');

    stage = 'verify B rollback inside its transaction';
    const loser = (await b.query(`
      SELECT i.status, i.matched_client_id, i.converted_case_id,
             i.reviewed_at, i.conversion_request_id,
             i.conversion_payload_hash, i.conversion_reviewed_fields,
             i.conversion_reviewed_by,
        (SELECT count(*)::integer FROM public.cases
         WHERE notes = $2) AS loser_cases,
        (SELECT count(*)::integer FROM public.audit_logs
         WHERE entity_id = i.id AND action = 'inquiry.converted') AS audits
      FROM public.inquiries i WHERE i.id = $1
    `, [inquiryB, notesB])).rows[0];

    assert.ok(loser, 'B inquiry missing');
    assert.equal(loser.status, 'new');
    for (const key of [
      'matched_client_id', 'converted_case_id', 'reviewed_at',
      'conversion_request_id', 'conversion_payload_hash',
      'conversion_reviewed_fields', 'conversion_reviewed_by'
    ]) {
      assert.equal(loser[key], null, `B retained ${key}`);
    }
    assert.equal(loser.loser_cases, 0);
    assert.equal(loser.audits, 0);
    await b.query('COMMIT');

    stage = 'verify persistent winner and uniqueness';
    const winner = (await observer.query(`
      SELECT i.status, i.converted_case_id, i.conversion_request_id,
             i.conversion_reviewed_fields, c.notes,
        (SELECT count(*)::integer FROM public.inquiries
         WHERE conversion_request_id = $2) AS request_owners,
        (SELECT count(*)::integer FROM public.cases
         WHERE notes = $3) AS winner_cases,
        (SELECT count(*)::integer FROM public.cases
         WHERE notes = $4) AS loser_cases,
        (SELECT count(*)::integer FROM public.audit_logs
         WHERE entity_id = i.id AND action = 'inquiry.converted') AS audits
      FROM public.inquiries i
      JOIN public.cases c ON c.id = i.converted_case_id
      WHERE i.id = $1
    `, [inquiryA, requestId, notesA, notesB])).rows[0];

    assert.ok(winner, 'A linked case missing');
    assert.equal(winner.status, 'converted');
    assert.equal(winner.converted_case_id, first.id);
    assert.equal(winner.conversion_request_id, requestId);
    assert.equal(winner.conversion_reviewed_fields.inquiryId, inquiryA);
    assert.equal(winner.conversion_reviewed_fields.notes, notesA);
    assert.equal(winner.notes, notesA);
    assert.equal(winner.request_owners, 1);
    assert.equal(winner.winner_cases, 1);
    assert.equal(winner.loser_cases, 0);
    assert.equal(winner.audits, 1);

    console.log(JSON.stringify({
      result: 'PASS',
      scenario: 'Concurrent cross-inquiry request-ID collision',
      inquiryA, inquiryB, requestId, first, loser, winner
    }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({
      result: 'FAIL', stage, code: error.code || 'UNKNOWN'
    }));
    process.exitCode = 1;
  } finally {
    await a.query('ROLLBACK').catch(() => {});
    await b.query('ROLLBACK').catch(() => {});
    await Promise.allSettled([a.end(), b.end(), observer.end()]);
  }
})();