const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Ensure db directory exists
const dbDir = path.join(__dirname, 'db');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Connect to databases
const issuanceDb = new sqlite3.Database(path.join(dbDir, 'issuance.db'));
const stopPaymentsDb = new sqlite3.Database(path.join(dbDir, 'stop_payments.db'));

// Set busy timeout to prevent "database is locked" errors
issuanceDb.configure('busyTimeout', 10000);
stopPaymentsDb.configure('busyTimeout', 10000);

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
              id, date, serialNumber, accountNumber, beneficiaryName, amount, createdBy, 
              createdTimestamp, modifiedBy, modifiedTimestamp, approvedBy, approvedTimestamp, 
              modifiedCount, recordStatus, previousStatus, fileId, historyList, authStatus
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          
          let hasError = false;
          file.records.forEach(r => {
            insertRecord.run(
              r.id, r.date, r.serialNumber, r.accountNumber, r.beneficiaryName, r.amount, 
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
    INSERT INTO issuance_records (
      id, date, serialNumber, accountNumber, beneficiaryName, amount, createdBy, 
      createdTimestamp, modifiedBy, modifiedTimestamp, approvedBy, approvedTimestamp, 
      modifiedCount, recordStatus, previousStatus, fileId, historyList, authStatus
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    r.id, r.date, r.serialNumber, r.accountNumber, r.beneficiaryName, r.amount, 
    r.createdBy, r.createdTimestamp || new Date().toISOString(), r.modifiedBy, r.modifiedTimestamp, 
    r.approvedBy, r.approvedTimestamp, r.modifiedCount || 0, r.recordStatus || 'NEW', 
    r.previousStatus, r.fileId || null, JSON.stringify(r.historyList || []), r.authStatus
  ], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.get('/api/issuance/records', (req, res) => {
  let query = 'SELECT * FROM issuance_records';
  let params = [];
  
  if (req.query.fileId) {
    query += ' WHERE fileId = ?';
    params.push(req.query.fileId);
  } else if (req.query.orphaned === 'true') {
    query += ' WHERE fileId IS NULL';
  }
  
  issuanceDb.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows.map(r => ({
      ...r,
      historyList: r.historyList ? JSON.parse(r.historyList) : []
    })));
  });
});

app.put('/api/issuance/records/:id', (req, res) => {
  const r = req.body;
  const id = req.params.id;
  issuanceDb.run(`
    UPDATE issuance_records SET
      date = ?, serialNumber = ?, accountNumber = ?, beneficiaryName = ?, amount = ?, 
      createdBy = ?, createdTimestamp = ?, modifiedBy = ?, modifiedTimestamp = ?, 
      approvedBy = ?, approvedTimestamp = ?, modifiedCount = ?, recordStatus = ?, 
      previousStatus = ?, historyList = ?, authStatus = ?
    WHERE id = ?
  `, [
    r.date, r.serialNumber, r.accountNumber, r.beneficiaryName, r.amount, 
    r.createdBy, r.createdTimestamp, r.modifiedBy, r.modifiedTimestamp, 
    r.approvedBy, r.approvedTimestamp, r.modifiedCount, r.recordStatus, 
    r.previousStatus, JSON.stringify(r.historyList || []), r.authStatus, id
  ], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.delete('/api/issuance/records/:id', (req, res) => {
  issuanceDb.run('DELETE FROM issuance_records WHERE id = ?', [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// Stop Payments API Routes

app.get('/api/stop-payments', (req, res) => {
  let query = 'SELECT * FROM stop_payments';
  let params = [];
  const filters = [];
  
  if (req.query.accountNumber) {
    filters.push('accountNumber = ?');
    params.push(req.query.accountNumber);
  }
  if (req.query.serialNumber) {
    filters.push('serialNumber = ?');
    params.push(req.query.serialNumber);
  }
  
  if (filters.length > 0) {
    query += ' WHERE ' + filters.join(' AND ');
  }
  
  query += ' ORDER BY createdTimestamp DESC';
  
  stopPaymentsDb.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/stop-payments', (req, res) => {
  const r = req.body;
  stopPaymentsDb.run(`
    INSERT INTO stop_payments (
      id, accountNumber, serialNumber, date, amount, reason, beneficiaryName, status,
      createdBy, createdTimestamp, modifiedBy, modifiedTimestamp, modifiedCount,
      approvedBy, approvedTimestamp, authStatus
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

app.put('/api/stop-payments/:id', (req, res) => {
  const r = req.body;
  const id = req.params.id;
  stopPaymentsDb.run(`
    UPDATE stop_payments SET
      accountNumber = ?, serialNumber = ?, date = ?, amount = ?, reason = ?, 
      beneficiaryName = ?, status = ?, modifiedBy = ?, modifiedTimestamp = ?, 
      modifiedCount = ?, approvedBy = ?, approvedTimestamp = ?, authStatus = ?
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
  stopPaymentsDb.run('DELETE FROM stop_payments WHERE id = ?', [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server is running cleanly on http://localhost:${PORT}`);
});
