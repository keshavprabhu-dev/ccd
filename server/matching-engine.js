/**
 * matching-engine.js
 *
 * Core Positive Pay matching logic.
 * Given an ICL item (effectiveCheckNumber, effectiveAmount, accountNumber),
 * determines match status against issuances and stops,
 * creates CheckPayment records, and raises CheckException rows.
 */

const MATCH_STATUS = {
  MATCHED: 'MATCHED',
  PAID_WITHOUT_ISSUANCE: 'PAID_WITHOUT_ISSUANCE',
  AMOUNT_MISMATCH: 'AMOUNT_MISMATCH',
  PAID_AFTER_STOP: 'PAID_AFTER_STOP',
  SERIAL_MISMATCH: 'SERIAL_MISMATCH',
};

const EXCEPTION_SEVERITY = {
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
};

/**
 * Run matching for a single ICL item.
 *
 * @param {object} item        - ICL item row (effectiveCheckNumber, effectiveAmount, accountNumber, id, ...)
 * @param {object} issuanceDb  - SQLite DB instance (issuance.db)
 * @param {object} stopDb      - SQLite DB instance (stop_payments.db)
 * @param {string} operatorId  - User who triggered the match (for audit)
 * @returns {Promise<{matchStatus, paymentId, exceptionId}>}
 */
function matchItem(item, issuanceDb, stopDb, operatorId = 'System') {
  return new Promise((resolve, reject) => {
    const { accountNumber, effectiveCheckNumber, effectiveAmount, id: iclItemId } = item;
    const now = new Date().toISOString();

    // ── Step 1: Check for active stops ──────────────────────────────────────
    stopDb.get(
      `SELECT * FROM check_stops
       WHERE AccountNumber = ? AND SerialNumber = ? AND RecordStatus = 'ACTIVE'
       LIMIT 1`,
      [accountNumber, effectiveCheckNumber],
      (stopErr, stopRow) => {
        if (stopErr) return reject(stopErr);

        // ── Step 2: Find matching issuance ───────────────────────────────────
        issuanceDb.get(
          `SELECT * FROM check_issuance
           WHERE accountNumber = ? AND SerialNumber = ?
           LIMIT 1`,
          [accountNumber, effectiveCheckNumber],
          (issErr, issuanceRow) => {
            if (issErr) return reject(issErr);

            let matchStatus;
            let severity;

            if (stopRow) {
              // Stop found — highest priority
              matchStatus = MATCH_STATUS.PAID_AFTER_STOP;
              severity = EXCEPTION_SEVERITY.HIGH;
            } else if (!issuanceRow) {
              // No issuance on record
              matchStatus = MATCH_STATUS.PAID_WITHOUT_ISSUANCE;
              severity = EXCEPTION_SEVERITY.HIGH;
            } else {
              const issuedAmount = parseFloat(issuanceRow.Amount || 0);
              const paidAmount = parseFloat(effectiveAmount || 0);
              const diff = Math.abs(issuedAmount - paidAmount);
              const tolerance = 0.01; // cents tolerance

              if (diff > tolerance) {
                matchStatus = MATCH_STATUS.AMOUNT_MISMATCH;
                severity = EXCEPTION_SEVERITY.MEDIUM;
              } else {
                matchStatus = MATCH_STATUS.MATCHED;
                severity = null;
              }
            }

            // ── Step 3: Create/update CheckPayment ───────────────────────────
            const paymentId = 'PAY-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);

            issuanceDb.run(
              `INSERT OR REPLACE INTO check_payments (
                id, AccountNumber, SerialNumber, Amount, Date,
                RecordStatus, createdBy, createdTimestamp, modifiedCount,
                iclItemId, matchStatus
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                paymentId, accountNumber, effectiveCheckNumber,
                effectiveAmount, now.substring(0, 10),
                matchStatus === MATCH_STATUS.MATCHED ? 'MATCHED' : 'EXCEPTION',
                operatorId, now, 0, iclItemId, matchStatus
              ],
              (payErr) => {
                if (payErr) return reject(payErr);

                // Link payment back to ICL item
                issuanceDb.run(
                  `UPDATE icl_items SET linkedPaymentId = ?, modifiedTimestamp = ? WHERE id = ?`,
                  [paymentId, now, iclItemId],
                  () => {}
                );

                if (matchStatus === MATCH_STATUS.MATCHED) {
                  // All good — no exception needed
                  return resolve({ matchStatus, paymentId, exceptionId: null });
                }

                // ── Step 4: Create CheckException ──────────────────────────
                const exceptionId = 'EXC-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
                const exceptionType = matchStatus;

                issuanceDb.run(
                  `INSERT INTO check_exceptions (
                    id, paymentId, iclItemId, exceptionType, severity, status,
                    createdBy, createdTimestamp, modifiedCount,
                    approvalStatus, recordStatus
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                  [
                    exceptionId, paymentId, iclItemId,
                    exceptionType, severity, 'OPEN',
                    operatorId, now, 0, 'UNAUTHORIZED', 'ACTIVE'
                  ],
                  (excErr) => {
                    if (excErr) return reject(excErr);
                    resolve({ matchStatus, paymentId, exceptionId });
                  }
                );
              }
            );
          }
        );
      }
    );
  });
}

/**
 * Run matching for all unmatched items in an ICL file.
 */
function matchFile(iclFileId, issuanceDb, stopDb, operatorId = 'System') {
  return new Promise((resolve, reject) => {
    issuanceDb.all(
      `SELECT * FROM icl_items WHERE iclFileId = ? AND parsingStatus = 'PARSED'`,
      [iclFileId],
      async (err, items) => {
        if (err) return reject(err);

        const results = [];
        for (const item of items) {
          try {
            const result = await matchItem(item, issuanceDb, stopDb, operatorId);
            results.push({ iclItemId: item.id, ...result });
          } catch (e) {
            results.push({ iclItemId: item.id, error: e.message });
          }
        }
        resolve(results);
      }
    );
  });
}

/**
 * Re-run matching for a single item (called after encoding correction is applied).
 * Closes any existing OPEN exception for this item before re-matching.
 */
function rematchItem(iclItemId, issuanceDb, stopDb, operatorId = 'System') {
  return new Promise((resolve, reject) => {
    issuanceDb.get(`SELECT * FROM icl_items WHERE id = ?`, [iclItemId], async (err, item) => {
      if (err) return reject(err);
      if (!item) return reject(new Error('ICL item not found: ' + iclItemId));

      // Close existing open exceptions for this item
      const now = new Date().toISOString();
      issuanceDb.run(
        `UPDATE check_exceptions SET status = 'SUPERSEDED', modifiedTimestamp = ? WHERE iclItemId = ? AND status = 'OPEN'`,
        [now, iclItemId],
        async () => {
          try {
            const result = await matchItem(item, issuanceDb, stopDb, operatorId);
            resolve(result);
          } catch (e) {
            reject(e);
          }
        }
      );
    });
  });
}

module.exports = { matchItem, matchFile, rematchItem, MATCH_STATUS, EXCEPTION_SEVERITY };
