const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

function decodeEbcdic(buf) {
  let str = '';
  for(let i=0; i<buf.length; i++) {
    let b = buf[i];
    if (b >= 0xF0 && b <= 0xF9) {
      str += String.fromCharCode(b - 0xF0 + 0x30); // 0-9
    } else if (b >= 0xC1 && b <= 0xC9) {
      str += String.fromCharCode(b - 0xC1 + 0x41); // A-I
    } else if (b >= 0xD1 && b <= 0xD9) {
      str += String.fromCharCode(b - 0xD1 + 0x4A); // J-R
    } else if (b >= 0xE2 && b <= 0xE9) {
      str += String.fromCharCode(b - 0xE2 + 0x53); // S-Z
    } else if (b >= 0x81 && b <= 0x89) {
      str += String.fromCharCode(b - 0x81 + 0x61); // a-i
    } else if (b >= 0x91 && b <= 0x99) {
      str += String.fromCharCode(b - 0x91 + 0x6A); // j-r
    } else if (b >= 0xA2 && b <= 0xA9) {
      str += String.fromCharCode(b - 0xA2 + 0x73); // s-z
    } else if (b === 0x40) {
      str += ' ';
    } else {
      str += '?';
    }
  }
  return str;
}

async function parseX9File(filePath) {
  const buffer = fs.readFileSync(filePath);
  let offset = 0;
  
  let currentCheck = null;
  let checks = [];
  let fileTotals = { amount: 0, count: 0 };
  let standardLevel = 'Unknown';
  let imagePromises = [];

  while (offset < buffer.length) {
    // Length prefix is 4 bytes big endian
    if (offset + 4 > buffer.length) break;
    const recordLength = buffer.readUInt32BE(offset);
    offset += 4;
    
    if (recordLength === 0) continue;
    if (offset + recordLength > buffer.length) break;

    const recordBuf = buffer.slice(offset, offset + recordLength);
    const recordTypeEbcdic = recordBuf.slice(0, 2);
    const recordType = decodeEbcdic(recordTypeEbcdic);

    if (recordType === '01') {
      const headerRaw = decodeEbcdic(recordBuf);
      standardLevel = headerRaw.substring(2, 4);
      console.log('File Header found, Standard Level:', standardLevel);
      if (standardLevel === '03') {
        console.log('Detected X9.37-2003 ICL version');
      } else {
        console.log('Detected X9.100-187 ICL version:', standardLevel);
      }
    } 
    else if (recordType === '25') {
      const str = decodeEbcdic(recordBuf);
      let amountStr = '';
      let routingNumber = '';
      let accountNumber = '';

      if (recordLength === 80) {
        amountStr = str.substring(46, 56); 
        routingNumber = str.substring(18, 27);
        accountNumber = str.substring(27, 43).trim();
      } else {
        amountStr = str.substring(133, 147);
        routingNumber = str.substring(26, 35);
        accountNumber = str.substring(35, 51).trim();
      }
      
      const amount = parseInt(amountStr, 10) / 100 || 0;
      fileTotals.amount += amount;
      fileTotals.count++;
      
      currentCheck = {
        amount: amount,
        routingNumber: routingNumber.replace(/\?/g, '0'),
        accountNumber: accountNumber.replace(/\?/g, ''),
        rawString: str.trim(),
        images: []
      };
      checks.push(currentCheck);
    } 
    else if (recordType === '52') {
      let tiffOffset = -1;
      for (let i = 2; i < recordBuf.length - 4; i++) {
        if ((recordBuf[i] === 0x49 && recordBuf[i+1] === 0x49 && recordBuf[i+2] === 0x2A && recordBuf[i+3] === 0x00) ||
            (recordBuf[i] === 0x4D && recordBuf[i+1] === 0x4D && recordBuf[i+2] === 0x00 && recordBuf[i+3] === 0x2A)) {
          tiffOffset = i;
          break;
        }
      }
      
      if (tiffOffset !== -1) {
        const tiffData = recordBuf.slice(tiffOffset);
        if (currentCheck) {
          const imgIndex = currentCheck.images.length;
          const outName = 'check_' + fileTotals.count + '_' + imgIndex + '.png';
          currentCheck.images.push(outName);
          
          const savePath = path.join(__dirname, 'server', 'uploads', 'icl', outName);
          const savePromise = sharp(tiffData)
            .png()
            .toFile(savePath)
            .then(() => console.log('Saved image', savePath))
            .catch(err => console.error('Tiff convert error:', err));
          imagePromises.push(savePromise);
        }
      }
    }

    offset += recordLength;
  }
  
  await Promise.allSettled(imagePromises);
  console.log('Parsing complete.');
  console.log('Totals:', fileTotals);
  console.log('Version:', standardLevel);
  console.log('Num Checks:', checks.length);
  return { checks, fileTotals, standardLevel };
}

(async () => {
  const inputDir = path.join(__dirname, 'input');
  const files = fs.readdirSync(inputDir);
  for (const file of files) {
    if (file.endsWith('.x9')) {
      console.log(`\n\n=== Parsing ${file} ===`);
      try {
        await parseX9File(path.join(inputDir, file));
      } catch (err) {
        console.error(`Error parsing ${file}:`, err);
      }
    }
  }
})();
