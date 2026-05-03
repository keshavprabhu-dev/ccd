/**
 * seed.js
 *
 * Drops all data and seeds the CCD databases with scenarios covering
 * every possible match outcome, exception type, correction workflow,
 * and user role.
 *
 * Run: node server/seed.js
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbDir = path.join(__dirname, 'db');

const issuanceDb    = new sqlite3.Database(path.join(dbDir, 'issuance.db'));
const stopDb        = new sqlite3.Database(path.join(dbDir, 'stop_payments.db'));
const adminDb       = new sqlite3.Database(path.join(dbDir, 'administration.db'));

issuanceDb.configure('busyTimeout', 10000);
stopDb.configure('busyTimeout', 10000);
adminDb.configure('busyTimeout', 10000);

const now  = new Date().toISOString();
const today = now.substring(0, 10);

// ─── Helper ──────────────────────────────────────────────────────────────────
function runAll(db, statements) {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');
      let pending = statements.length;
      if (pending === 0) { db.run('COMMIT'); return resolve(); }
      for (const { sql, params } of statements) {
        db.run(sql, params, (err) => {
          if (err) { console.error('SQL error:', err.message, '\n SQL:', sql); }
          if (--pending === 0) {
            db.run('COMMIT', (e) => {
              if (e) reject(e); else resolve();
            });
          }
        });
      }
    });
  });
}

async function seed() {
  console.log('\n🌱  Seeding CCD databases...\n');

  // ── 1. WIPE ALL TABLES ─────────────────────────────────────────────────────
  console.log('  Clearing existing data...');
  await runAll(issuanceDb, [
    { sql: 'DELETE FROM issuance_records',    params: [] },
    { sql: 'DELETE FROM historical_files',    params: [] },
    { sql: 'DELETE FROM check_issuance',      params: [] },
    { sql: 'DELETE FROM check_payments',      params: [] },
    { sql: 'DELETE FROM icl_files',           params: [] },
    { sql: 'DELETE FROM icl_items',           params: [] },
    { sql: 'DELETE FROM check_exceptions',    params: [] },
    { sql: 'DELETE FROM encoding_corrections',params: [] },
    { sql: 'DELETE FROM audit_log',           params: [] },
  ].filter(s => {
    // Ignore if table doesn't exist yet (handled by the try catch)
    return true;
  }));
  await runAll(stopDb,    [{ sql: 'DELETE FROM check_stops', params: [] }, { sql: 'DELETE FROM stop_payments', params: [] }]);
  await runAll(adminDb,   [{ sql: 'DELETE FROM users', params: [] }, { sql: 'DELETE FROM currency_config', params: [] }]);
  console.log('  ✓ All tables cleared.\n');

  // ── 2. USERS (one per role) ─────────────────────────────────────────────────
  console.log('  Seeding users...');
  await runAll(adminDb, [
    { sql: `INSERT INTO users (id,username,password,email,firstName,lastName,userType,status,createdBy,createdTimestamp,modifiedCount,authStatus)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      params: ['U001','admin',   'admin123',  'admin@ccd.com',   'System',  'Admin',      'Administrator','ACTIVE','System',now,0,'A'] },
    { sql: `INSERT INTO users (id,username,password,email,firstName,lastName,userType,status,createdBy,createdTimestamp,modifiedCount,authStatus)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      params: ['U002','bankops1','ops123',    'ops1@ccd.com',    'James',   'Chen',       'BankOps',     'ACTIVE','admin',now,0,'A'] },
    { sql: `INSERT INTO users (id,username,password,email,firstName,lastName,userType,status,createdBy,createdTimestamp,modifiedCount,authStatus)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      params: ['U003','bankops2','ops456',    'ops2@ccd.com',    'Maria',   'Santos',     'BankOps',     'ACTIVE','admin',now,0,'A'] },
    { sql: `INSERT INTO users (id,username,password,email,firstName,lastName,userType,status,createdBy,createdTimestamp,modifiedCount,authStatus)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      params: ['U004','super1',  'sup123',    'super@ccd.com',   'David',   'Williams',   'Supervisor',  'ACTIVE','admin',now,0,'A'] },
    { sql: `INSERT INTO users (id,username,password,email,firstName,lastName,userType,status,createdBy,createdTimestamp,modifiedCount,authStatus)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      params: ['U005','corp1',   'corp123',   'corp1@ccd.com',   'Alice',   'Johnson',    'Corporate',   'ACTIVE','admin',now,0,'A'] },
    { sql: `INSERT INTO users (id,username,password,email,firstName,lastName,userType,status,createdBy,createdTimestamp,modifiedCount,authStatus)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      params: ['U006','inactive','pass999',   'old@ccd.com',     'Old',     'User',       'Corporate',   'INACTIVE','admin',now,0,'A'] },
  ]);
  console.log('  ✓ 6 users seeded (admin, 2×bankops, supervisor, corporate, inactive).\n');

  // ── 3. CURRENCIES ──────────────────────────────────────────────────────────
  console.log('  Seeding currencies...');
  await runAll(adminDb, [
    { sql: 'INSERT INTO currency_config (code,name,isEnabled) VALUES (?,?,?)', params: ['USD','US Dollar',1] },
    { sql: 'INSERT INTO currency_config (code,name,isEnabled) VALUES (?,?,?)', params: ['EUR','Euro',1] },
    { sql: 'INSERT INTO currency_config (code,name,isEnabled) VALUES (?,?,?)', params: ['GBP','British Pound',1] },
    { sql: 'INSERT INTO currency_config (code,name,isEnabled) VALUES (?,?,?)', params: ['CAD','Canadian Dollar',0] },
    { sql: 'INSERT INTO currency_config (code,name,isEnabled) VALUES (?,?,?)', params: ['JPY','Japanese Yen',0] },
  ]);
  console.log('  ✓ 5 currencies (3 enabled, 2 disabled).\n');

  // ── 4. CHECK ISSUANCES ─────────────────────────────────────────────────────
  // Scenarios:
  //   A) Will match perfectly (serial+amount exact)           → MATCHED
  //   B) Will match serial but amount differs by $50          → AMOUNT_MISMATCH
  //   C) No ICL item will reference this check                → (no payment — normal)
  //   D) Will be paid after a stop is placed                  → PAID_AFTER_STOP
  //   E) Serial encoding error — raw ICL has wrong serial     → SERIAL_MISMATCH (before correction)
  //   F) Dollar encoding error — raw ICL has wrong amount     → AMOUNT_MISMATCH → MATCHED after correction
  //   G) Voided check — should never be paid
  console.log('  Seeding check issuances...');
  const issuances = [
    // id, SerialNumber, accountNumber, Amount, Date, beneficiaryName, RecordStatus, authStatus
    ['ISS001','100001','ACC-10001-01', 5000.00, today, 'Acme Corp',         'APPROVED', 'A'],  // → MATCHED
    ['ISS002','100002','ACC-10001-01', 1200.00, today, 'Beta Supplies Ltd',  'APPROVED', 'A'],  // → AMOUNT_MISMATCH (paid 1250)
    ['ISS003','100003','ACC-10001-01', 3500.00, today, 'Gamma Services',     'APPROVED', 'A'],  // → not paid (unmatched issuance)
    ['ISS004','100004','ACC-10001-01',  750.00, today, 'Delta Consulting',   'APPROVED', 'A'],  // → PAID_AFTER_STOP
    ['ISS005','100005','ACC-20002-01', 8200.00, today, 'Epsilon Trading',    'APPROVED', 'A'],  // → serial correction needed (raw ICL has 100055)
    ['ISS006','100006','ACC-20002-01', 2100.00, today, 'Zeta Logistics',     'APPROVED', 'A'],  // → dollar correction needed (raw ICL has 2150.00)
    ['ISS007','100007','ACC-20002-01',  450.00, today, 'Eta Freight',        'VOID',     'A'],  // → Voided
    ['ISS008','100008','ACC-30003-01', 9900.00, today, 'Theta Holdings',     'APPROVED', 'A'],  // → Approved, not paid yet
    ['ISS009','100009','ACC-30003-01', 1100.00, today, 'Iota Partners',      'NEW',      'U'],  // → Unauthorized/pending
    ['ISS010','100010','ACC-30003-01', 6600.00, today, 'Kappa Ventures',     'APPROVED', 'A'],  // → MATCHED
  ];
  await runAll(issuanceDb, issuances.map(([id, serial, acct, amt, date, bene, status, auth]) => ({
    sql: `INSERT INTO check_issuance (id, SerialNumber, accountNumber, Amount, Date, beneficiaryName, RecordStatus, approvalStatus,
          createdBy, createdTimestamp, modifiedCount, CurrencyCode)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    params: [id, serial, acct, amt, date, bene, status, auth === 'A' ? 'AUTHORIZED' : 'UNAUTHORIZED', 'corp1', now, 0, 'USD']
  })));
  console.log(`  ✓ ${issuances.length} issuance records seeded.\n`);

  // ── 5. STOP PAYMENTS ──────────────────────────────────────────────────────
  console.log('  Seeding stop payments...');
  await runAll(stopDb, [
    { sql: `INSERT INTO check_stops (id, AccountNumber, SerialNumber, Date, Amount, Remarks, BeneficiaryName, RecordStatus,
            createdBy, createdTimestamp, modifiedCount, approvalStatus, CurrencyCode)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      params: ['STP001','ACC-10001-01','100004', today, 750.00, 'Lost check', 'Delta Consulting', 'ACTIVE', 'corp1', now, 0, 'AUTHORIZED', 'USD'] },
    { sql: `INSERT INTO check_stops (id, AccountNumber, SerialNumber, Date, Amount, Remarks, BeneficiaryName, RecordStatus,
            createdBy, createdTimestamp, modifiedCount, approvalStatus, CurrencyCode)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      params: ['STP002','ACC-30003-01','199999', today, 500.00, 'Fraud suspected', 'Unknown Payee', 'ACTIVE', 'bankops1', now, 0, 'AUTHORIZED', 'USD'] },
    { sql: `INSERT INTO check_stops (id, AccountNumber, SerialNumber, Date, Amount, Remarks, BeneficiaryName, RecordStatus,
            createdBy, createdTimestamp, modifiedCount, approvalStatus, CurrencyCode)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      params: ['STP003','ACC-20002-01','200001', today, 300.00, 'Released stop', 'Old Vendor', 'RELEASED', 'corp1', now, 0, 'AUTHORIZED', 'USD'] },
  ]);
  console.log('  ✓ 3 stop payments (1 active→triggers exception, 1 fraud stop, 1 released).\n');

  // ── 6. ICL FILE ─────────────────────────────────────────────────────────────
  console.log('  Seeding ICL file...');
  await runAll(issuanceDb, [
    { sql: `INSERT INTO icl_files (id, fileName, uploadDate, fileType, totalCount, totalAmount)
            VALUES (?,?,?,?,?,?)`,
      params: ['ICLF001', 'sample_x9_20260503.x9', now, 'X9.37', 7, 28850.00] },
  ]);
  console.log('  ✓ 1 ICL file.\n');

  // ── 7. ICL ITEMS (7 items, each triggering a different scenario) ────────────
  console.log('  Seeding ICL items...');
  const iclItems = [
    // id, iclFileId, checkNumber, amount, acct, effectiveCheckNumber, effectiveAmount, scenario comment
    ['ICLI001','ICLF001','100001',5000.00,'ACC-10001-01','100001',5000.00],  // → MATCHED
    ['ICLI002','ICLF001','100002',1250.00,'ACC-10001-01','100002',1250.00],  // → AMOUNT_MISMATCH (issued 1200)
    ['ICLI003','ICLF001','100004', 750.00,'ACC-10001-01','100004', 750.00],  // → PAID_AFTER_STOP
    ['ICLI004','ICLF001','099999',8200.00,'ACC-20002-01','099999',8200.00],  // → PAID_WITHOUT_ISSUANCE (raw serial wrong, needs correction to 100005)
    ['ICLI005','ICLF001','100006',2150.00,'ACC-20002-01','100006',2150.00],  // → AMOUNT_MISMATCH (dollar encoding, issued 2100)
    ['ICLI006','ICLF001','100010',6600.00,'ACC-30003-01','100010',6600.00],  // → MATCHED
    ['ICLI007','ICLF001','888888',4000.00,'ACC-99999-XX','888888',4000.00],  // → PAID_WITHOUT_ISSUANCE (unknown account)
  ];
  await runAll(issuanceDb, iclItems.map(([id,fileId,chk,amt,acct,effChk,effAmt]) => ({
    sql: `INSERT INTO icl_items (id, iclFileId, checkNumber, amount, accountNumber, routingNumber,
          carAmount, larAmount, effectiveCheckNumber, effectiveAmount, parsingStatus,
          createdBy, createdTimestamp, modifiedCount, recordStatus)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    params: [id, fileId, chk, amt, acct, '021000021', amt, amt, effChk, effAmt, 'PARSED', 'System', now, 0, 'ACTIVE']
  })));
  console.log(`  ✓ ${iclItems.length} ICL items seeded.\n`);

  // ── 8. RUN MATCHING ENGINE ──────────────────────────────────────────────────
  // We do this inline by manually creating payments + exceptions for each known scenario
  console.log('  Generating CheckPayments and CheckExceptions via matching outcomes...');

  const payments = [
    // id, acct, serial, amt, matchStatus, iclItemId, recordStatus
    ['PAY001','ACC-10001-01','100001',5000.00,'MATCHED',              'ICLI001','MATCHED'],
    ['PAY002','ACC-10001-01','100002',1250.00,'AMOUNT_MISMATCH',      'ICLI002','EXCEPTION'],
    ['PAY003','ACC-10001-01','100004', 750.00,'PAID_AFTER_STOP',      'ICLI003','EXCEPTION'],
    ['PAY004','ACC-20002-01','099999',8200.00,'PAID_WITHOUT_ISSUANCE','ICLI004','EXCEPTION'],
    ['PAY005','ACC-20002-01','100006',2150.00,'AMOUNT_MISMATCH',      'ICLI005','EXCEPTION'],
    ['PAY006','ACC-30003-01','100010',6600.00,'MATCHED',              'ICLI006','MATCHED'],
    ['PAY007','ACC-99999-XX','888888',4000.00,'PAID_WITHOUT_ISSUANCE','ICLI007','EXCEPTION'],
  ];
  await runAll(issuanceDb, payments.map(([id,acct,serial,amt,matchSt,iclId,recSt]) => ({
    sql: `INSERT INTO check_payments (id, AccountNumber, SerialNumber, Amount, Date, RecordStatus,
          matchStatus, iclItemId, createdBy, createdTimestamp, modifiedCount)
          VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    params: [id, acct, serial, amt, today, recSt, matchSt, iclId, 'System', now, 0]
  })));

  // Link payments back to ICL items
  for (const [payId, ,, , , iclId] of payments) {
    await new Promise(r => issuanceDb.run('UPDATE icl_items SET linkedPaymentId=? WHERE id=?', [payId, iclId], r));
  }

  const exceptions = [
    // id, paymentId, iclItemId, type, severity, status
    ['EXC001','PAY002','ICLI002','AMOUNT_MISMATCH',      'MEDIUM','OPEN'],
    ['EXC002','PAY003','ICLI003','PAID_AFTER_STOP',      'HIGH',  'OPEN'],
    ['EXC003','PAY004','ICLI004','PAID_WITHOUT_ISSUANCE','HIGH',  'OPEN'],    // serial encoding error
    ['EXC004','PAY005','ICLI005','AMOUNT_MISMATCH',      'MEDIUM','OPEN'],    // dollar encoding error
    ['EXC005','PAY007','ICLI007','PAID_WITHOUT_ISSUANCE','HIGH',  'RESOLVED'],// already resolved
  ];
  await runAll(issuanceDb, exceptions.map(([id, payId, iclId, type, sev, status]) => ({
    sql: `INSERT INTO check_exceptions (id, paymentId, iclItemId, exceptionType, severity, status,
          resolutionNotes, resolvedBy, resolvedTimestamp,
          createdBy, createdTimestamp, modifiedCount, approvalStatus, recordStatus)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    params: [
      id, payId, iclId, type, sev, status,
      status === 'RESOLVED' ? 'Duplicate check from prior batch — confirmed with issuer.' : null,
      status === 'RESOLVED' ? 'bankops1' : null,
      status === 'RESOLVED' ? now : null,
      'System', now, 0, 'UNAUTHORIZED', 'ACTIVE'
    ]
  })));
  console.log(`  ✓ ${payments.length} payments, ${exceptions.length} exceptions.\n`);

  // ── 9. ENCODING CORRECTIONS ─────────────────────────────────────────────────
  // Correction for ICLI004: serial was 099999, actual is 100005
  // Status = PENDING (waiting for maker-checker)
  console.log('  Seeding encoding corrections...');
  await runAll(issuanceDb, [
    { sql: `INSERT INTO encoding_corrections (id, iclItemId, paymentId, correctionType,
            originalCheckNumber, correctedCheckNumber, originalAmount, correctedAmount,
            reason, status, createdBy, createdTimestamp, modifiedCount, approvalStatus, recordStatus)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      params: ['COR001','ICLI004','PAY004','SERIAL',
               '099999','100005', 8200.00, 8200.00,
               'MICR encoding error on check — verified against physical document.',
               'PENDING','bankops1', now, 0, 'UNAUTHORIZED','ACTIVE'] },
    // Correction for ICLI005: dollar encoding — corrected to 2100.00
    { sql: `INSERT INTO encoding_corrections (id, iclItemId, paymentId, correctionType,
            originalCheckNumber, correctedCheckNumber, originalAmount, correctedAmount,
            reason, status, createdBy, createdTimestamp, modifiedCount, approvalStatus, recordStatus)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      params: ['COR002','ICLI005','PAY005','DOLLAR',
               '100006','100006', 2150.00, 2100.00,
               'CAR/LAR disagree — LAR 2100 matches issuance. CAR encoding smudged.',
               'PENDING','bankops2', now, 0, 'UNAUTHORIZED','ACTIVE'] },
  ]);
  console.log('  ✓ 2 encoding corrections (both PENDING — awaiting supervisor approval).\n');

  // ── 10. AUDIT LOG entries ────────────────────────────────────────────────────
  console.log('  Seeding audit log...');
  await runAll(issuanceDb, [
    { sql: `INSERT INTO audit_log (id, entityName, entityId, actionType, oldValue, newValue, timestamp, userId)
            VALUES (?,?,?,?,?,?,?,?)`,
      params: ['AUD001','CheckIssuance','ISS001','CREATE','null',JSON.stringify({serial:'100001',amount:5000}),now,'corp1'] },
    { sql: `INSERT INTO audit_log (id, entityName, entityId, actionType, oldValue, newValue, timestamp, userId)
            VALUES (?,?,?,?,?,?,?,?)`,
      params: ['AUD002','CheckStop','STP001','CREATE','null',JSON.stringify({serial:'100004',reason:'Lost check'}),now,'corp1'] },
    { sql: `INSERT INTO audit_log (id, entityName, entityId, actionType, oldValue, newValue, timestamp, userId)
            VALUES (?,?,?,?,?,?,?,?)`,
      params: ['AUD003','CheckException','EXC005','RESOLVE',JSON.stringify({status:'OPEN'}),JSON.stringify({status:'RESOLVED'}),now,'bankops1'] },
  ]);
  console.log('  ✓ 3 audit log entries.\n');

  console.log('✅  Seed complete!\n');
  console.log('  Scenario Coverage:');
  console.log('  ─────────────────────────────────────────────────────────────');
  console.log('  MATCHED              → PAY001 (serial 100001, $5,000), PAY006 (serial 100010, $6,600)');
  console.log('  AMOUNT_MISMATCH      → PAY002 (issued $1,200, paid $1,250)');
  console.log('  PAID_AFTER_STOP      → PAY003 (serial 100004 — stop STP001 is ACTIVE)');
  console.log('  PAID_WITHOUT_ISSUANCE→ PAY004 (serial 099999 — needs serial correction to 100005)');
  console.log('  AMOUNT_MISMATCH      → PAY005 (dollar encoding — needs amount correction 2150→2100)');
  console.log('  PAID_WITHOUT_ISSUANCE→ PAY007 (unknown account ACC-99999-XX — already resolved)');
  console.log('  Corrections pending  → COR001 (serial), COR002 (dollar)');
  console.log('  Users: admin / admin123 · bankops1 / ops123 · bankops2 / ops456');
  console.log('         super1 / sup123  · corp1 / corp123 · inactive/pass999 (blocked)');
  console.log('  ─────────────────────────────────────────────────────────────\n');

  issuanceDb.close();
  stopDb.close();
  adminDb.close();
}

seed().catch((err) => {
  console.error('❌  Seed failed:', err);
  process.exit(1);
});
