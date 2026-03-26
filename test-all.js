const fs = require('fs');
const path = require('path');
const { parseX9Buffer } = require('./server/x9-parser');

async function testAll() {
  const inputDir = path.join(__dirname, 'input');
  const files = fs.readdirSync(inputDir).filter(f => f.endsWith('.x9'));
  
  for (const f of files) {
    console.log(`\n--- Testing ${f} ---`);
    const buffer = fs.readFileSync(path.join(inputDir, f));
    try {
      const res = await parseX9Buffer(buffer, path.join(__dirname, 'server', 'uploads', 'icl'), `test_${f}`);
      console.log(`Version: ${res.versionString}`);
      console.log(`Summary: Count=${res.summary.count}, Total=${res.summary.totalAmount}`);
      if (res.checks.length > 0) {
        const c = res.checks[0];
        console.log(`First Check: Amount=${c.amount}, Routing=${c.routingNumber}, Account=${c.accountNumber}, Serial=${c.serialNumber}, Date=${c.checkDate}, Payee=${c.payeeName}`);
      }
    } catch (e) {
      console.error(e);
    }
  }
}
testAll();
