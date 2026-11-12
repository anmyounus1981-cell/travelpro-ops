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

    stage = 'fixture';
    const inquiryId = randomUUID();
    const requestId = randomUUID();

    await observer.query(`
      INSERT INTO public.inquiries
        (id, source, client_type, raw_message, service_type)
      VALUES ($1, 'landing_page', 'corporate',
              'SYNTHETIC: direct concurrency test', 'flight_booking')
    `, [inquiryId]);

    console.log(JSON.stringify({ inquiryId, requestId, pidA, pidB }));

    const date = (await observer.query(`
      SELECT to_char(
        (clock_timestamp() AT TIME ZONE 'Asia/Dhaka')::date + 30,
        'YYYY-MM-DD'
      ) AS departure
    `)).rows[0].departure;

    const payload = {
      version: 1, requestId, inquiryId,
      clientId: '10000000-0000-0000-0000-000000000001',
      serviceType: 'flight_booking', reviewConfirmed: true,
      origin: 'DAC', destination: 'BKK',
      departureDate: date, returnDate: '', tripType: 'oneway',
      adultCount: 1, childCount: 0, infantCount: 0,
      cabinClass: 'economy',
      notes: 'Synthetic direct concurrent identical conversion'
    };

    stage = 'session A conversion';
    await ownerTransaction(a);
    const first = (await a.query(
      'SELECT public.convert_inquiry_to_case($1::jsonb) AS result',
      [JSON.stringify(payload)]
    )).rows[0].result;
    assert.equal(first.duplicate, false);

    stage = 'session B conversion';
    await ownerTransaction(b);

    const pendingB = b.query(
      'SELECT public.convert_inquiry_to_case($1::jsonb) AS result',
      [JSON.stringify(payload)]
    ).then(
      result => ({ result }),
      error => ({ error })
    );

    stage = 'observe blocking';
    let blocking;
    const deadline = Date.now() + 5000;

    while (Date.now() < deadline) {
      const observed = await observer.query(`
        SELECT pid, wait_event_type, wait_event,
               pg_blocking_pids(pid) AS blockers
        FROM pg_stat_activity
        WHERE pid = $1
          AND wait_event_type = 'Lock'
          AND $2::integer = ANY(pg_blocking_pids(pid))
      `, [pidB, pidA]);

      if (observed.rows.length === 1) {
        blocking = observed.rows[0];
        break;
      }

      await new Promise(resolve => setTimeout(resolve, 100));
    }

    assert.ok(blocking, 'B blocked by A was not observed');
    console.log('BLOCKING_CONFIRMED', JSON.stringify(blocking));

    stage = 'commit and retry result';
    await a.query('COMMIT');

    const outcomeB = await pendingB;
    if (outcomeB.error) throw outcomeB.error;

    const retry = outcomeB.result.rows[0].result;
    assert.equal(retry.id, first.id);
    assert.equal(retry.duplicate, true);
    await b.query('COMMIT');

    stage = 'persistent verification';
    const state = (await observer.query(`
      SELECT i.status, i.converted_case_id,
        (SELECT count(*)::integer FROM public.cases c
         WHERE c.id = i.converted_case_id) AS linked_cases,
        (SELECT count(*)::integer FROM public.audit_logs l
         WHERE l.entity_id = i.id
           AND l.action = 'inquiry.converted') AS audits
      FROM public.inquiries i WHERE i.id = $1
    `, [inquiryId])).rows[0];

    assert.equal(state.status, 'converted');
    assert.equal(state.converted_case_id, first.id);
    assert.equal(state.linked_cases, 1);
    assert.equal(state.audits, 1);

    console.log(JSON.stringify({
      result: 'PASS',
      scenario: 'Concurrent identical conversion',
      first, retry, state
    }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({
      result: 'FAIL',
      stage,
      code: error.code || 'UNKNOWN'
    }));
    process.exitCode = 1;
  } finally {
    await a.query('ROLLBACK').catch(() => {});
    await b.query('ROLLBACK').catch(() => {});
    await Promise.allSettled([a.end(), b.end(), observer.end()]);
  }
})();