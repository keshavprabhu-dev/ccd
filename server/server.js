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
  fs.mkdirSync(dbDir);
}

// Connect to Issuance database
const issuanceDb = new sqlite3.Database(path.join(dbDir, 'issuance.db'));

// Initialize Issuance tables
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
      beneficiary TEXT,
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
      historyList TEXT
    )
  `);
});

// Issuance API Routes

// Load everything to initialize state
app.get('/api/issuance/sync', (req, res) => {
  issuanceDb.all('SELECT * FROM historical_files', [], (err, files) => {
    if (err) return res.status(500).json({ error: err.message });
    
    issuanceDb.all('SELECT * FROM issuance_records', [], (err, records) => {
      if (err) return res.status(500).json({ error: err.message });
      
      // Parse historyList JSON string back to array and build proper structure
      const parsedRecords = records.map(r => ({
        ...r,
        historyList: r.historyList ? JSON.parse(r.historyList) : []
      }));

      // Re-hydrate files with their records 
      // Note: The UI logic maps records back into the historical array for viewing
      // We will infer records inside files based on their IDs if we need to, 
      // but the UI currently expects the raw array from saveState.
      // So let's fetch the mapping we stored:
      res.json({
        allRecords: parsedRecords,
        historicalFiles: files.map(f => ({
          ...f,
          // Since UI originally serialized the full records inside files:
          records: parsedRecords.filter(pr => pr.fileId === f.id)
        }))
      });
    });
  });
});

// Sync logic will blindly synchronize the SQLite table with memory state
// While not perfectly RESTful, it flawlessly converts the localStorage paradigm 
// into real relational SQLite tables for the records and files!
app.post('/api/issuance/sync', (req, res) => {
  const { allRecords, historicalFiles } = req.body;

  issuanceDb.serialize(() => {
    // Wrap in a transaction for atomicity
    issuanceDb.run('BEGIN TRANSACTION');

    // Remove all old state to resync memory
    issuanceDb.run('DELETE FROM historical_files');
    issuanceDb.run('DELETE FROM issuance_records');

    const insertFile = issuanceDb.prepare('INSERT INTO historical_files (id, fileName, uploadDate, fileStatus) VALUES (?, ?, ?, ?)');
    if (historicalFiles) {
      historicalFiles.forEach(f => {
        insertFile.run(f.id, f.fileName, f.uploadDate, f.fileStatus);
        
        // Tag records with fileId to rehydrate later
        if (f.records) {
          f.records.forEach(fr => {
            const memRecord = allRecords.find(a => a.id === fr.id);
            if (memRecord) {
              memRecord.fileId = f.id;
            }
          });
        }
      });
    }
    insertFile.finalize();

    const insertRecord = issuanceDb.prepare(`
      INSERT INTO issuance_records (
        id, date, serialNumber, accountNumber, beneficiary, amount, createdBy, 
        createdTimestamp, modifiedBy, modifiedTimestamp, approvedBy, approvedTimestamp, 
        modifiedCount, recordStatus, previousStatus, fileId, historyList
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    if (allRecords) {
      allRecords.forEach(r => {
        insertRecord.run(
          r.id, r.date, r.serialNumber, r.accountNumber, r.beneficiary, r.amount, 
          r.createdBy, r.createdTimestamp, r.modifiedBy, r.modifiedTimestamp, 
          r.approvedBy, r.approvedTimestamp, r.modifiedCount, r.recordStatus, 
          r.previousStatus, r.fileId || null, 
          JSON.stringify(r.historyList || [])
        );
      });
    }
    insertRecord.finalize();

    issuanceDb.run('COMMIT', (err) => {
      if (err) {
        issuanceDb.run('ROLLBACK');
        return res.status(500).json({ error: err.message });
      }
      res.json({ success: true });
    });
  });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(\`Server is running cleanly on http://localhost:\${PORT}\`);
});
