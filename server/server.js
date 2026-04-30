const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { parseX9Buffer } = require('./x9-parser');

const app = express();
app.use(helmet({ crossOriginResourcePolicy: false })); // Allowed for static images locally
app.use(cors());

// Basic rate limiting for API endpoints
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // limit each IP to 200 requests per windowMs
  message: { error: 'Too many requests from this IP, please try again after 15 minutes' }
});
app.use('/api/', apiLimiter);

// JSON payload limit increased to support large base64 encoded ICL files
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ limit: '500mb', extended: true }));



// Ensure db directory exists
const dbDir = path.join(__dirname, 'db');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Connect to databases
const issuanceDb = new sqlite3.Database(path.join(dbDir, 'issuance.db'));
const stopPaymentsDb = new sqlite3.Database(path.join(dbDir, 'stop_payments.db'));
const adminDb = new sqlite3.Database(path.join(dbDir, 'administration.db'));

// Set busy timeout to prevent "database is locked" errors
issuanceDb.configure('busyTimeout', 10000);
stopPaymentsDb.configure('busyTimeout', 10000);
adminDb.configure('busyTimeout', 10000);

// Initialize tables
issuanceDb.serialize(() => {
  issuanceDb.run(`
    CREATE TABLE IF NOT EXISTS historical_files (
      id TEXT PRIMARY KEY,
      fileName TEXT,
      uploadDate TEXT,
      fileStatus TEXT
    )
  `);

  issuanceDb.run(`
    CREATE TABLE IF NOT EXISTS icl_files (
      id TEXT PRIMARY KEY,
      fileName TEXT,
      uploadDate TEXT,
      fileType TEXT,
      totalCount INTEGER,
      totalAmount REAL
    )
  `);

  issuanceDb.run(`
    CREATE TABLE IF NOT EXISTS issuance_records (
      id TEXT PRIMARY KEY,
      date TEXT,
      serialNumber TEXT,
      accountNumber TEXT,
      beneficiaryName TEXT,
      amount REAL,
      createdBy TEXT,
      createdTimestamp TEXT,
      modifiedBy TEXT,
      modifiedTimestamp TEXT,
      approvedBy TEXT,
      approvedTimestamp TEXT,
      modifiedCount INTEGER,
      recordStatus TEXT,
      previousStatus TEXT,
      fileId TEXT,
      historyList TEXT,
      authStatus TEXT
    )
  `);

  issuanceDb.run("ALTER TABLE issuance_records ADD COLUMN beneficiaryAddress TEXT", (err) => {
    // Ignore error if column already exists
  });

  issuanceDb.run(`
    CREATE TABLE IF NOT EXISTS check_issuance (
      id TEXT PRIMARY KEY,
      accountNumber TEXT,
      SerialNumber TEXT,
      Date TEXT,
      Amount REAL,
      CurrencyCode TEXT,
      beneficiaryName TEXT,
      beneficiaryAddressLine1 TEXT,
      beneficiaryAddressLine2 TEXT,
      beneficiaryTownName TEXT,
      beneficiaryStateCode TEXT,
      beneficiaryCountryCode TEXT,
      RecordStatus TEXT,
      Remarks TEXT,
      createdBy TEXT,
      createdTimestamp TEXT,
      modifiedBy TEXT,
      modifiedTimestamp TEXT,
      approvedBy TEXT,
      approvedTimestamp TEXT,
      approvalStatus TEXT,
      modifiedCount INTEGER
    )
  `);

  issuanceDb.run(`
    CREATE TABLE IF NOT EXISTS check_payments (
      id TEXT PRIMARY KEY,
      AccountNumber TEXT,
      SerialNumber TEXT,
      Date TEXT,
      Amount REAL,
      CurrencyCode TEXT,
      BeneficiaryName TEXT,
      BeneficiaryAddressLine1 TEXT,
      BeneficiaryAddressLine2 TEXT,
      BeneficiaryTownName TEXT,
      BeneficiaryStateCode TEXT,
      BeneficiaryCountryCode TEXT,
      RecordStatus TEXT,
      Remarks TEXT,
      createdBy TEXT,
      createdTimestamp TEXT,
      modifiedBy TEXT,
      modifiedTimestamp TEXT,
      approvedBy TEXT,
      approvedTimestamp TEXT,
      approvalStatus TEXT,
      modifiedCount INTEGER
    )
  `);
});

stopPaymentsDb.serialize(() => {
  stopPaymentsDb.run(`
    CREATE TABLE IF NOT EXISTS stop_payments (
      id TEXT PRIMARY KEY,
      accountNumber TEXT,
      serialNumber TEXT,
      date TEXT,
      amount REAL,
      reason TEXT,
      beneficiaryName TEXT,
      status TEXT,
      createdBy TEXT,
      createdTimestamp TEXT,
      modifiedBy TEXT,
      modifiedTimestamp TEXT,
      modifiedCount INTEGER,
      approvedBy TEXT,
      approvedTimestamp TEXT,
      authStatus TEXT
    )
  `);

  stopPaymentsDb.run(`
    CREATE TABLE IF NOT EXISTS check_stops (
      id TEXT PRIMARY KEY,
      AccountNumber TEXT,
      SerialNumber TEXT,
      Date TEXT,
      Amount REAL,
      CurrencyCode TEXT,
      BeneficiaryName TEXT,
      BeneficiaryAddressLine1 TEXT,
      BeneficiaryAddressLine2 TEXT,
      BeneficiaryTownName TEXT,
      BeneficiaryStateCode TEXT,
      BeneficiaryCountryCode TEXT,
      RecordStatus TEXT,
      Remarks TEXT,
      createdBy TEXT,
      createdTimestamp TEXT,
      modifiedBy TEXT,
      modifiedTimestamp TEXT,
      approvedBy TEXT,
      approvedTimestamp TEXT,
      approvalStatus TEXT,
      modifiedCount INTEGER
    )
  `);
});

adminDb.serialize(() => {
  adminDb.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE,
      password TEXT,
      email TEXT,
      firstName TEXT,
      middleName TEXT,
      lastName TEXT,
      phoneNumber TEXT,
      userType TEXT,
      status TEXT,
      createdBy TEXT,
      createdTimestamp TEXT,
      modifiedBy TEXT,
      modifiedTimestamp TEXT,
      modifiedCount INTEGER,
      approvedBy TEXT,
      approvedTimestamp TEXT,
      authStatus TEXT
    )
  `);
  // Insert a default admin user if none exists
  adminDb.get("SELECT COUNT(*) as count FROM users", (err, row) => {
    if (!err && row.count === 0) {
      adminDb.run(`
        INSERT INTO users (
          id, username, password, email, firstName, lastName, userType, status, createdBy, createdTimestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        'U' + Date.now(), 'admin', 'admin', 'admin@example.com', 'System', 'Admin', 'Administrator', 'ACTIVE', 'System', new Date().toISOString()
      ]);
    }
  });


  adminDb.run(`
    CREATE TABLE IF NOT EXISTS currency_config (
      code TEXT PRIMARY KEY,
      name TEXT,
      isEnabled INTEGER DEFAULT 1
    )
  `);

  // Insert default currencies if none exist
  adminDb.get("SELECT COUNT(*) as count FROM currency_config", (err, row) => {
    if (!err && row.count === 0) {
      const defaultCurrencies = [
        ['USD', 'US Dollar', 1],
        ['EUR', 'Euro', 1],
        ['GBP', 'British Pound', 1],
        ['JPY', 'Japanese Yen', 1],
        ['CAD', 'Canadian Dollar', 1],
        ['AUD', 'Australian Dollar', 1],
        ['CHF', 'Swiss Franc', 1],
        ['CNY', 'Chinese Yuan', 1],
        ['INR', 'Indian Rupee', 1]
      ];
      const stmt = adminDb.prepare("INSERT INTO currency_config (code, name, isEnabled) VALUES (?, ?, ?)");
      defaultCurrencies.forEach(c => stmt.run(c));
      stmt.finalize();
    }
  });
});

app.get('/api/currencies', (req, res) => {
  adminDb.all('SELECT * FROM currency_config ORDER BY code ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Issuance API Routes

app.get('/api/issuance/files', (req, res) => {
  issuanceDb.all('SELECT * FROM historical_files ORDER BY uploadDate DESC', [], (err, files) => {
    if (err) return res.status(500).json({ error: err.message });
    
    // For each file, fetch its records
    const fileCount = files.length;
    if (fileCount === 0) return res.json([]);
    
    let processedFiles = 0;
    const filesWithRecords = [];

    files.forEach((file, index) => {
      issuanceDb.all('SELECT * FROM issuance_records WHERE fileId = ?', [file.id], (err, records) => {
        if (err) {
          if (!res.headersSent) res.status(500).json({ error: err.message });
          return;
        }
        
        filesWithRecords[index] = {
          ...file,
          records: records.map(r => ({
            ...r,
            historyList: r.historyList ? JSON.parse(r.historyList) : []
          }))
        };
        
        processedFiles++;
        if (processedFiles === fileCount && !res.headersSent) {
          res.json(filesWithRecords);
        }
      });
    });
  });
});

app.post('/api/issuance/files', (req, res) => {
  const file = req.body;
  issuanceDb.run(
    'INSERT INTO historical_files (id, fileName, uploadDate, fileStatus) VALUES (?, ?, ?, ?)',
    [file.id, file.fileName, file.uploadDate, file.fileStatus],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      
      // Also insert records if they exist
      if (file.records && Array.isArray(file.records)) {
        issuanceDb.serialize(() => {
          const insertRecord = issuanceDb.prepare(`
            INSERT INTO issuance_records (
              id, date, serialNumber, accountNumber, beneficiaryName, beneficiaryAddress, amount, createdBy, 
              createdTimestamp, modifiedBy, modifiedTimestamp, approvedBy, approvedTimestamp, 
              modifiedCount, recordStatus, previousStatus, fileId, historyList, authStatus
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          
          let hasError = false;
          file.records.forEach(r => {
            insertRecord.run(
              r.id, r.date, r.serialNumber, r.accountNumber, r.beneficiaryName, r.beneficiaryAddress, r.amount, 
              r.createdBy, r.createdTimestamp || new Date().toISOString(), r.modifiedBy, r.modifiedTimestamp, 
              r.approvedBy, r.approvedTimestamp, r.modifiedCount || 0, r.recordStatus, 
              r.previousStatus, file.id, JSON.stringify(r.historyList || []), r.authStatus,
              (runErr) => { if (runErr) hasError = true; }
            );
          });
          insertRecord.finalize((finalErr) => {
            if (hasError || finalErr) {
              if (!res.headersSent) res.status(500).json({ error: "One or more records failed to save." });
            } else {
              if (!res.headersSent) res.json({ success: true });
            }
          });
        });
      } else {
        res.json({ success: true });
      }
    }
  );
});

app.delete('/api/issuance/files/:id', (req, res) => {
  const fileId = req.params.id;
  issuanceDb.serialize(() => {
    issuanceDb.run('DELETE FROM historical_files WHERE id = ?', [fileId]);
    issuanceDb.run('DELETE FROM issuance_records WHERE fileId = ?', [fileId], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
  });
});

app.post('/api/issuance/records', (req, res) => {
  const r = req.body;
  issuanceDb.run(`
    INSERT INTO check_issuance (
      id, Date, SerialNumber, accountNumber, beneficiaryName, beneficiaryAddressLine1, Amount, createdBy, 
      createdTimestamp, modifiedBy, modifiedTimestamp, approvedBy, approvedTimestamp, 
      modifiedCount, RecordStatus
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    r.id, r.date, r.serialNumber, r.accountNumber, r.beneficiaryName, r.beneficiaryAddress, r.amount, 
    r.createdBy, r.createdTimestamp || new Date().toISOString(), r.modifiedBy, r.modifiedTimestamp, 
    r.approvedBy, r.approvedTimestamp, r.modifiedCount || 0, r.recordStatus || 'NEW'
  ], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.get('/api/issuance/records', (req, res) => {
  let query = 'SELECT * FROM check_issuance';
  let params = [];
  
  issuanceDb.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows.map(r => ({
      ...r,
      date: r.Date,
      serialNumber: r.SerialNumber,
      amount: r.Amount,
      recordStatus: r.RecordStatus,
      beneficiaryAddress: r.beneficiaryAddressLine1
    })));
  });
});

app.put('/api/issuance/records/:id', (req, res) => {
  const r = req.body;
  issuanceDb.run(`
    UPDATE check_issuance SET
      Date = ?, SerialNumber = ?, accountNumber = ?, beneficiaryName = ?, beneficiaryAddressLine1 = ?, amount = ?, 
      modifiedBy = ?, modifiedTimestamp = ?, approvedBy = ?, approvedTimestamp = ?, 
      modifiedCount = ?, RecordStatus = ?
    WHERE id = ?
  `, [
    r.date, r.serialNumber, r.accountNumber, r.beneficiaryName, r.beneficiaryAddress, r.amount, 
    r.modifiedBy, r.modifiedTimestamp, r.approvedBy, r.approvedTimestamp, 
    r.modifiedCount, r.recordStatus, req.params.id
  ], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.delete('/api/issuance/records/:id', (req, res) => {
  issuanceDb.run('DELETE FROM check_issuance WHERE id = ?', [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// Stop Payments API Routes

app.get('/api/stop-payments', (req, res) => {
  let query = 'SELECT * FROM check_stops';
  let params = [];
  const filters = [];
  
  if (req.query.accountNumber) {
    filters.push('AccountNumber = ?');
    params.push(req.query.accountNumber);
  }
  if (req.query.serialNumber) {
    filters.push('SerialNumber = ?');
    params.push(req.query.serialNumber);
  }
  
  if (filters.length > 0) {
    query += ' WHERE ' + filters.join(' AND ');
  }
  
  query += ' ORDER BY createdTimestamp DESC';
  
  stopPaymentsDb.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows.map(r => ({
      ...r,
      accountNumber: r.AccountNumber,
      serialNumber: r.SerialNumber,
      date: r.Date,
      amount: r.Amount,
      currencyCode: r.CurrencyCode,
      beneficiaryName: r.BeneficiaryName,
      status: r.RecordStatus,
      reason: r.Remarks
    })));
  });
});

app.post('/api/stop-payments', (req, res) => {
  const r = req.body;
  stopPaymentsDb.run(`
    INSERT INTO check_stops (
      id, AccountNumber, SerialNumber, Date, Amount, Remarks, BeneficiaryName, RecordStatus,
      createdBy, createdTimestamp, modifiedBy, modifiedTimestamp, modifiedCount,
      approvedBy, approvedTimestamp, approvalStatus
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    r.id, r.accountNumber, r.serialNumber, r.date, r.amount, r.reason, r.beneficiaryName, r.status,
    r.createdBy, r.createdTimestamp, r.modifiedBy, r.modifiedTimestamp, r.modifiedCount || 0,
    r.approvedBy, r.approvedTimestamp, r.authStatus
  ], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ ...r, id: r.id });
  });
});

app.post('/api/stop-payments/bulk', (req, res) => {
  const records = req.body;
  if (!Array.isArray(records)) return res.status(400).json({ error: 'Expected an array of records' });

  stopPaymentsDb.serialize(() => {
    stopPaymentsDb.run("BEGIN TRANSACTION");
    const stmt = stopPaymentsDb.prepare(`
      INSERT INTO check_stops (
        id, AccountNumber, SerialNumber, Date, Amount, Remarks, BeneficiaryName, RecordStatus,
        createdBy, createdTimestamp, modifiedBy, modifiedTimestamp, modifiedCount,
        approvedBy, approvedTimestamp, approvalStatus
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let hasError = false;
    records.forEach(r => {
      stmt.run([
        r.id, r.accountNumber, r.serialNumber, r.date, r.amount, r.reason, r.beneficiaryName, r.status,
        r.createdBy, r.createdTimestamp, r.modifiedBy, r.modifiedTimestamp, r.modifiedCount || 0,
        r.approvedBy, r.approvedTimestamp, r.authStatus
      ], (err) => {
        if (err) hasError = true;
      });
    });

    stmt.finalize();
    stopPaymentsDb.run("COMMIT", (err) => {
      if (err || hasError) return res.status(500).json({ error: 'Failed to insert some or all records' });
      res.json({ success: true, count: records.length });
    });
  });
});

app.delete('/api/stop-payments/bulk', (req, res) => {
  const { accountNumber, startSerial, endSerial } = req.query;
  if (!accountNumber || !startSerial || !endSerial) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  stopPaymentsDb.run(`
    DELETE FROM check_stops 
    WHERE AccountNumber = ? AND CAST(SerialNumber AS INTEGER) >= ? AND CAST(SerialNumber AS INTEGER) <= ?
  `, [accountNumber, parseInt(startSerial), parseInt(endSerial)], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, deletedCount: this.changes });
  });
});

app.put('/api/stop-payments/:id', (req, res) => {
  const r = req.body;
  const id = req.params.id;
  stopPaymentsDb.run(`
    UPDATE check_stops SET
      AccountNumber = ?, SerialNumber = ?, Date = ?, Amount = ?, Remarks = ?, 
      BeneficiaryName = ?, RecordStatus = ?, modifiedBy = ?, modifiedTimestamp = ?, 
      modifiedCount = ?, approvedBy = ?, approvedTimestamp = ?, approvalStatus = ?
    WHERE id = ?
  `, [
    r.accountNumber, r.serialNumber, r.date, r.amount, r.reason, 
    r.beneficiaryName, r.status, r.modifiedBy, r.modifiedTimestamp, 
    r.modifiedCount, r.approvedBy, r.approvedTimestamp, r.authStatus, id
  ], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ ...r, id });
  });
});

app.delete('/api/stop-payments/:id', (req, res) => {
  stopPaymentsDb.run('DELETE FROM check_stops WHERE id = ?', [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// Administration API Routes

app.get('/api/administration/users', (req, res) => {
  adminDb.all('SELECT * FROM users ORDER BY createdTimestamp DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/administration/users', (req, res) => {
  const r = req.body;
  adminDb.run(`
    INSERT INTO users (
      id, username, password, email, firstName, middleName, lastName, phoneNumber, userType, status,
      createdBy, createdTimestamp, modifiedBy, modifiedTimestamp, modifiedCount,
      approvedBy, approvedTimestamp, authStatus
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    r.id, r.username, r.password, r.email, r.firstName, r.middleName, r.lastName, r.phoneNumber, r.userType, r.status,
    r.createdBy, r.createdTimestamp, r.modifiedBy, r.modifiedTimestamp, r.modifiedCount || 0,
    r.approvedBy, r.approvedTimestamp, r.authStatus
  ], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ ...r, id: r.id });
  });
});

app.put('/api/administration/users/:id', (req, res) => {
  const r = req.body;
  const id = req.params.id;

  adminDb.get('SELECT * FROM users WHERE id = ?', [id], (err, existing) => {
    if (err) return res.status(500).json({ error: err.message });
    
    // If not existing, it's actually an upsert/creation
    if (!existing) {
      adminDb.run(`
        INSERT INTO users (
          id, username, password, email, firstName, middleName, lastName, phoneNumber, userType, status,
          createdBy, createdTimestamp, modifiedBy, modifiedTimestamp, modifiedCount,
          approvedBy, approvedTimestamp, authStatus
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        id, r.username, r.password, r.email, r.firstName, r.middleName, r.lastName, r.phoneNumber, r.userType, r.status,
        r.createdBy, r.createdTimestamp, r.modifiedBy, r.modifiedTimestamp, r.modifiedCount || 0,
        r.approvedBy, r.approvedTimestamp, r.authStatus
      ], function(insertErr) {
        if (insertErr) return res.status(500).json({ error: insertErr.message });
        return res.json({ ...r, id });
      });
      return;
    }

    // Otherwise update
    adminDb.run(`
      UPDATE users SET
        username = ?, password = ?, email = ?, firstName = ?, middleName = ?, lastName = ?, 
        phoneNumber = ?, userType = ?, status = ?, modifiedBy = ?, modifiedTimestamp = ?, 
        modifiedCount = ?, approvedBy = ?, approvedTimestamp = ?, authStatus = ?
      WHERE id = ?
    `, [
      r.username, r.password || existing.password, r.email, r.firstName, r.middleName, r.lastName, 
      r.phoneNumber, r.userType, r.status, r.modifiedBy, r.modifiedTimestamp, 
      r.modifiedCount, r.approvedBy, r.approvedTimestamp, r.authStatus, id
    ], function(updateErr) {
      if (updateErr) return res.status(500).json({ error: updateErr.message });
      res.json({ ...r, id });
    });
  });
});

app.delete('/api/administration/users/:id', (req, res) => {
  adminDb.run('DELETE FROM users WHERE id = ?', [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// ── ICL Parser Endpoint ───────────────────────────────────────────────────
const iclUploadDir = path.join(__dirname, 'uploads', 'icl');
if (!fs.existsSync(iclUploadDir)) {
  fs.mkdirSync(iclUploadDir, { recursive: true });
}
app.use('/api/images/icl', express.static(iclUploadDir));

app.post('/api/icl-parser/upload', async (req, res) => {
  const { fileName, fileContent, override } = req.body;
  if (!fileName || !fileContent) {
    return res.status(400).json({ error: 'Missing fileName or fileContent' });
  }

  const filePath = path.join(iclUploadDir, fileName);
  if (fs.existsSync(filePath) && !override) {
    return res.status(409).json({ error: 'Duplicate - File already Processed' });
  }

  try {
    const buffer = Buffer.from(fileContent, 'base64');
    fs.writeFileSync(filePath, buffer);
    
    // Parse the file and extract summary/checks/images
    const uniquePrefix = fileName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const parsedData = await parseX9Buffer(buffer, iclUploadDir, uniquePrefix);
    
    // Save to historical table
    const id = Date.now().toString() + Math.random().toString(36).substring(2, 9);
    const uploadDate = new Date().toISOString();
    
    issuanceDb.run(
      'INSERT INTO icl_files (id, fileName, uploadDate, fileType, totalCount, totalAmount) VALUES (?, ?, ?, ?, ?, ?)',
      [id, fileName, uploadDate, parsedData.versionString, parsedData.summary.count, parsedData.summary.totalAmount],
      (err) => {
        if (err) console.error('Error saving ICL history:', err);
      }
    );

    // Save checks to check_payments
    if (parsedData.checks && parsedData.checks.length > 0) {
      issuanceDb.serialize(() => {
        const insertPayment = issuanceDb.prepare(`
          INSERT INTO check_payments (
            id, AccountNumber, SerialNumber, Date, Amount, CurrencyCode, BeneficiaryName,
            RecordStatus, createdBy, createdTimestamp, modifiedCount
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        parsedData.checks.forEach(check => {
          const checkId = Date.now().toString() + Math.random().toString(36).substring(2, 9);
          insertPayment.run([
            checkId, check.accountNumber, check.serialNumber, check.checkDate || uploadDate,
            check.amount, 'USD', check.payeeName || '', 'NEW', 'System', uploadDate, 0
          ]);
        });
        insertPayment.finalize();
      });
    }

    res.status(200).json({ message: 'File successfully parsed!', parsedData });
  } catch (error) {
    console.error('File saving/parsing error:', error);
    res.status(500).json({ error: 'Internal server error while saving file' });
  }
});

app.get('/api/icl-parser/files', (req, res) => {
  issuanceDb.all('SELECT * FROM icl_files ORDER BY uploadDate DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/api/icl-parser/files/:fileName', async (req, res) => {
  const fileName = decodeURIComponent(req.params.fileName);
  const filePath = path.join(iclUploadDir, fileName);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found on disk' });
  }
  try {
    const buffer = fs.readFileSync(filePath);
    const uniquePrefix = fileName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const parsedData = await parseX9Buffer(buffer, iclUploadDir, uniquePrefix);
    res.status(200).json({ parsedData });
  } catch (error) {
    console.error('File parsing error from history:', error);
    res.status(500).json({ error: 'Internal server error while parsing historical file' });
  }
});

app.delete('/api/icl-parser/files/:id', (req, res) => {
  const id = req.params.id;
  issuanceDb.get('SELECT fileName FROM icl_files WHERE id = ?', [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'File not found' });
    
    // Delete file from disk
    const filePath = path.join(iclUploadDir, row.fileName);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (e) {
        console.error('Failed to delete file from disk:', e);
      }
    }
    
    // Delete record from DB
    issuanceDb.run('DELETE FROM icl_files WHERE id = ?', [id], (deleteErr) => {
      if (deleteErr) return res.status(500).json({ error: deleteErr.message });
      res.json({ success: true });
    });
  });
});



const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running cleanly on port ${PORT}`);
});
