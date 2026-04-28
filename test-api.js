const fs = require('fs');
const http = require('http');
const path = require('path');

const inputDir = path.join(__dirname, 'input');
const files = fs.readdirSync(inputDir);

async function uploadFile(fileName) {
  return new Promise((resolve) => {
    const filePath = path.join(inputDir, fileName);
    const fileBuffer = fs.readFileSync(filePath);
    const fileContent = fileBuffer.toString('base64');

    const data = JSON.stringify({
      fileName: fileName,
      fileContent: fileContent,
      override: true
    });

    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/icl-parser/upload',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = http.request(options, res => {
      console.log(`[${fileName}] statusCode: ${res.statusCode}`);
      let resData = '';
      res.on('data', d => { resData += d; });
      res.on('end', () => {
        if (res.statusCode !== 200) console.error(`[${fileName}] Response:`, resData);
        resolve();
      });
    });

    req.on('error', error => {
      console.error(`[${fileName}] Error:`, error);
      resolve();
    });

    req.write(data);
    req.end();
  });
}

(async () => {
  for (const file of files) {
    if (file.endsWith('.x9')) {
      await uploadFile(file);
    }
  }
})();
