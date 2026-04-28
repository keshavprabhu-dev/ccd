const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { parseX9Buffer } = require('./server/x9-parser');

const dbPath = path.join(__dirname, 'server', 'db', 'issuance.db');
const iclUploadDir = path.join(__dirname, 'server', 'uploads', 'icl');

(async () => {
    // 1. Clean history
    const db = new sqlite3.Database(dbPath);
    await new Promise((resolve) => {
        db.run('DELETE FROM icl_files', resolve);
    });
    console.log('Cleared ICL files from database.');

    // 2. Clear Uploads directory
    if (fs.existsSync(iclUploadDir)) {
        fs.readdirSync(iclUploadDir).forEach(file => {
            fs.unlinkSync(path.join(iclUploadDir, file));
        });
    } else {
        fs.mkdirSync(iclUploadDir, { recursive: true });
    }
    console.log('Cleared uploads directory.');

    // 3. Parse input files
    const inputDir = path.join(__dirname, 'input');
    const files = fs.readdirSync(inputDir);
    for (const file of files) {
        if (!file.endsWith('.x9')) continue;
        console.log(`\n\n--- Parsing file: ${file} ---`);
        const filePath = path.join(inputDir, file);
        const buffer = fs.readFileSync(filePath);
        const uniquePrefix = file.replace(/[^a-z0-9]/gi, '_').toLowerCase();

        try {
            const parsedData = await parseX9Buffer(buffer, iclUploadDir, uniquePrefix);
            console.log(`Version: ${parsedData.versionString}`);
            console.log(`Total Checks: ${parsedData.checks.length}`);
            console.log(`Batch Amount: $${parsedData.summary.totalAmount}`);
            
            if (parsedData.checks.length > 0) {
               const c = parsedData.checks[0];
               console.log(`Check 1 Details:`);
               console.log(`  Amount: ${c.amount}`);
               console.log(`  Routing: ${c.routingNumber}`);
               console.log(`  Account: ${c.accountNumber}`);
               console.log(`  Serial: ${c.serialNumber}`);
               console.log(`  Date: ${c.checkDate}`);
               console.log(`  RAW Rec25: ${c.rawRecord25.replace(/[\x00-\x1F\x7F]/g, '.')}`);
            }
        } catch(e) {
            console.error(`Error parsing ${file}:`, e);
        }
    }
})();
