const sharp = require('sharp');
const path = require('path');

// Standard EBCDIC Code Page 037 -> ASCII lookup table
const EBCDIC_TO_ASCII = [
   0,  1,  2,  3,156,  9,134,127,151,141,142, 11, 12, 13, 14, 15,
  16, 17, 18, 19,157,133,  8,135, 24, 25,146,143, 28, 29, 30, 31,
 128,129,130,131,132, 10, 23, 27,136,137,138,139,140,  5,  6,  7,
 144,145, 22,147,148,149,150,  4,152,153,154,155, 20, 21,158, 26,
  32,160,162,163,164,165,166,167,168,169, 91, 46, 60, 40, 43, 33,
  38,169,170,171,172,173,174,175,176,177, 93, 36, 42, 41, 59, 94,
  45, 47,178,179,180,181,182,183,184,185,124, 44, 37, 95, 62, 63,
 186,187,188,189,190,191,192,193,194, 96, 58, 35, 64, 39, 61, 34,
 195, 97, 98, 99,100,101,102,103,104,105,196,197,198,199,200,201,
 202,106,107,108,109,110,111,112,113,114,203,204,205,206,207,208,
 209,126,115,116,117,118,119,120,121,122,210,211,212,213,214,215,
 216,217,218,219,220,221,222,223,224,225,226,227,228,229,230,231,
 123, 65, 66, 67, 68, 69, 70, 71, 72, 73,232,233,234,235,236,237,
 125, 74, 75, 76, 77, 78, 79, 80, 81, 82,238,239,240,241,242,243,
  92,159, 83, 84, 85, 86, 87, 88, 89, 90,244,245,246,247,248,249,
  48, 49, 50, 51, 52, 53, 54, 55, 56, 57,250,251,252,253,254,255
];

function decodeEbcdic(buf) {
  let str = '';
  for (let i = 0; i < buf.length; i++) {
    str += String.fromCharCode(EBCDIC_TO_ASCII[buf[i]] || 63);
  }
  return str;
}

function formatDate(raw) {
  // Raw is YYYYMMDD
  const s = raw ? raw.trim() : '';
  if (s.length === 8 && /^\d{8}$/.test(s)) {
    return `${s.substring(0, 4)}-${s.substring(4, 6)}-${s.substring(6, 8)}`;
  }
  return s || null;
}

async function parseX9Buffer(buffer, uploadDir, uniquePrefix) {
  let offset = 0;

  let currentCheck = null;
  let checks = [];
  let summary = { totalAmount: 0, count: 0 };
  let standardLevel = 'Unknown';
  let versionString = 'Unknown ICL Format';
  let imagePromises = [];

  while (offset < buffer.length) {
    if (offset + 4 > buffer.length) break;
    const recordLength = buffer.readUInt32BE(offset);
    offset += 4;

    if (recordLength === 0) continue;
    if (offset + recordLength > buffer.length) break;

    const recordBuf = buffer.slice(offset, offset + recordLength);
    const recordType = decodeEbcdic(recordBuf.slice(0, 2));

    // ── File Header (Type 01) ──────────────────────────────────────────────
    if (recordType === '01') {
      const headerRaw = decodeEbcdic(recordBuf);
      standardLevel = headerRaw.substring(2, 4).trim();
      versionString = standardLevel === '03'
        ? 'X9.37-2003 (DSTU)'
        : `X9.100-187 (Level ${standardLevel})`;
    }

    // ── Check Detail (Type 25) or Return (Type 31) ─────────────────────────
    else if (recordType === '25' || recordType === '31') {
      const str = decodeEbcdic(recordBuf);

      let amountStr = '', routingNumber = '', accountNumber = '';
      let serialNumber = '', checkDate = '', payeeName = '';

      if (recordType === '31') {
        routingNumber  = str.substring(2, 11).trim();
        const onUs = str.substring(11, 31).trim();
        if (onUs.includes('/')) {
          const parts = onUs.split('/');
          accountNumber = parts[0].trim();
          serialNumber = parts[1].trim();
        } else {
          accountNumber = onUs;
          serialNumber = '';
        }
        amountStr      = str.substring(31, 41).trim();
      } else {
        // Record 25
        if (recordLength <= 80) {
          // Fixed 80-byte DSTU / X9.100-187 format 25 record
          routingNumber  = str.substring(18, 27).trim();
          
          const onUs = str.substring(27, 47).trim(); // On-Us field is 20 chars
          if (onUs.includes('/')) {
            const parts = onUs.split('/');
            accountNumber = parts[0].trim();
            serialNumber = parts[1].trim();
          } else {
            accountNumber = onUs;
            serialNumber = str.substring(57, 72).trim(); // Item seq num 15 chars fallback
          }

          amountStr      = str.substring(47, 57).trim();
          checkDate      = ''; 
        } else {
          // Variable-length X9.100-187 heuristical
          routingNumber  = str.substring(2, 11).trim();
          accountNumber  = str.substring(11, 26).trim();
          amountStr      = str.substring(26, 41).trim();
          serialNumber   = str.substring(50, 58).trim();
          checkDate      = formatDate(str.substring(58, 66));
        }
      }

      const amount = parseInt(amountStr.replace(/\D/g, ''), 10) / 100 || 0;
      summary.totalAmount += amount;
      summary.count++;

      currentCheck = {
        amount:        parseFloat(amount.toFixed(2)),
        routingNumber: routingNumber.replace(/[^0-9]/g, ''),
        accountNumber: accountNumber.replace(/[^0-9A-Za-z\-/ ]/g, '').trim(),
        serialNumber:  serialNumber.replace(/[^0-9A-Za-z]/g, '').trim(),
        checkDate:     checkDate || null,
        payeeName:     '', // filled by Type 26 addendum
        rawRecord25:   str,
        images:        [],
        imageSide:     []
      };
      checks.push(currentCheck);
    }

    // ── Check Detail Addendum A (Type 26) – contains payee name & date ───
    else if (recordType === '26') {
      if (currentCheck) {
        const str = decodeEbcdic(recordBuf);
        // Type 26 X9.37: fields at known offsets
        // [24-47] MICR valid indicator, Seq Num, Return …
        // Payee name is commonly the last 15–20 chars of the fixed portion
        // Position 22-57 in the 58-byte DSTU record = endorsement data
        // We try position 14 onward for payee-like content
        const raw = str.substring(14, 54).trim().replace(/\?+/g, '').trim();
        if (raw && raw.length > 2) {
          currentCheck.payeeName = raw;
        }
      }
    }

    // ── Image View Data (Type 50) – front/back toggle ───────────────────────
    else if (recordType === '50') {
      if (currentCheck) {
        // Automatically toggle image side: first image is front, second is back.
        // This is highly robust across DSTU, X9.100-180, and X9.100-187 variants where position offsets change.
        if (!currentCheck._nextImageSide || currentCheck._nextImageSide === 'back') {
          currentCheck._nextImageSide = 'front';
        } else {
          currentCheck._nextImageSide = 'back';
        }
      }
    }

    // ── Image View Data (Type 52) – actual TIFF payload ──────────────────
    else if (recordType === '52') {
      let tiffOffset = -1;
      for (let i = 2; i < recordBuf.length - 4; i++) {
        if (
          (recordBuf[i] === 0x49 && recordBuf[i+1] === 0x49 && recordBuf[i+2] === 0x2A && recordBuf[i+3] === 0x00) ||
          (recordBuf[i] === 0x4D && recordBuf[i+1] === 0x4D && recordBuf[i+2] === 0x00 && recordBuf[i+3] === 0x2A)
        ) {
          tiffOffset = i;
          break;
        }
      }

      if (tiffOffset !== -1 && currentCheck) {
        const tiffData = recordBuf.slice(tiffOffset);
        const side = currentCheck._nextImageSide || 'front';
        const imgIndex = currentCheck.images.length;
        const outName = `${uniquePrefix}_check_${summary.count}_${side}_${imgIndex}.png`;

        currentCheck.images.push({
          url:  `http://localhost:3000/api/images/icl/${outName}`,
          side: side
        });

        const savePath = path.join(uploadDir, outName);
        const savePromise = sharp(tiffData)
          .png()
          .toFile(savePath)
          .catch(err => console.error('TIFF convert error:', err.message));
        imagePromises.push(savePromise);
        currentCheck._nextImageSide = null;
      }
    }

    offset += recordLength;
  }

  await Promise.allSettled(imagePromises);
  summary.totalAmount = parseFloat(summary.totalAmount.toFixed(2));

  return { versionString, standardLevel, summary, checks };
}

module.exports = { parseX9Buffer };
