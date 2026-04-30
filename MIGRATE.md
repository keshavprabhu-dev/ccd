# Database Migration Guide (SQLite to PostgreSQL)

The Control Disbursement (CCD) Application is currently built using **SQLite** for zero-configuration, file-based database management during development. However, for a high-traffic production environment, migrating to a robust, concurrent relational database like **PostgreSQL** is highly recommended.

This guide outlines the exact steps required to transition the Node.js backend from SQLite to PostgreSQL.

---

## 1. Prerequisites & Setup

1. **Provision a PostgreSQL Database**: Set up a local Postgres instance or provision a cloud database (e.g., AWS RDS, Azure Database for PostgreSQL).
2. **Install PostgreSQL Node Driver**:
   Navigate to the `server/` directory and install the `pg` library:
   ```bash
   cd server
   npm install pg
   ```

---

## 2. Environment Variables Configuration

Do not hardcode database credentials. Create a `.env` file in the `server/` directory to store your Postgres connection string securely:

```env
# server/.env
PGUSER=postgres
PGPASSWORD=your_secure_password
PGHOST=localhost
PGPORT=5432
PGDATABASE=ccd_production
```
*(You may also need to run `npm install dotenv` and require it at the top of `server.js`).*

---

## 3. Update Database Initialization (server.js)

Currently, the app uses `sqlite3` to create three separate `.db` files. In Postgres, you will typically use **one database** (`ccd_production`) with multiple tables, or multiple schemas. 

**Remove the old SQLite code:**
```javascript
// DELETE THIS
const sqlite3 = require('sqlite3').verbose();
const adminDb = new sqlite3.Database(path.join(dbDir, 'admin.db'));
// ... etc
```

**Replace with PostgreSQL Connection Pool:**
```javascript
// ADD THIS
const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.PGUSER,
  host: process.env.PGHOST,
  database: process.env.PGDATABASE,
  password: process.env.PGPASSWORD,
  port: process.env.PGPORT,
});

// Test connection
pool.connect()
  .then(() => console.log('Connected to PostgreSQL successfully'))
  .catch(err => console.error('PostgreSQL connection error', err.stack));
```

---

## 4. SQL Syntax Conversion Rules

When updating the raw SQL queries in `server.js`, you must apply the following syntax changes from SQLite to PostgreSQL:

### A. Table Creation (`AUTOINCREMENT` -> `SERIAL`)
SQLite uses `INTEGER PRIMARY KEY AUTOINCREMENT`. Postgres uses `SERIAL PRIMARY KEY`.

*Old SQLite:*
```sql
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE
)
```
*New PostgreSQL:*
```sql
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) UNIQUE
)
```

### B. Parameterized Queries (`?` -> `$1, $2`)
SQLite uses `?` for parameterized values. Postgres uses `$1, $2, $3` mapping to the array index.

*Old SQLite:*
```javascript
adminDb.get('SELECT * FROM users WHERE username = ? AND password = ?', [username, password], (err, row) => { ... })
```
*New PostgreSQL:*
```javascript
const result = await pool.query('SELECT * FROM users WHERE username = $1 AND password = $2', [username, password]);
const row = result.rows[0];
```

---

## 5. Updating Express Route Handlers

The `sqlite3` library relies heavily on callbacks (`db.all(sql, params, callback)`), whereas the `pg` library supports modern `async/await` Promises. You will need to update the database calls in your endpoints.

**Example 1: Fetching Data (GET)**

*Old SQLite:*
```javascript
app.get('/api/administration/users', (req, res) => {
  adminDb.all('SELECT * FROM users', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});
```

*New PostgreSQL:*
```javascript
app.get('/api/administration/users', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM users');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

**Example 2: Inserting Data (POST/INSERT)**

*Old SQLite:*
```javascript
issuanceDb.run('INSERT INTO issuance_records (serialNumber, amount) VALUES (?, ?)', [serial, amount], function(err) {
  // `this.lastID` gets the inserted ID in sqlite3
  res.json({ id: this.lastID }); 
});
```

*New PostgreSQL:*
Note the use of `RETURNING id` to get the inserted row's ID.
```javascript
try {
  const result = await pool.query(
    'INSERT INTO issuance_records (serialNumber, amount) VALUES ($1, $2) RETURNING id', 
    [serial, amount]
  );
  res.json({ id: result.rows[0].id });
} catch (err) {
  res.status(500).json({ error: err.message });
}
```

---

## 6. Data Migration Strategy (Optional)

If you have existing data in your SQLite `.db` files that must be preserved:

1. **Use pgloader**: The easiest way to migrate schema and data is using the open-source tool [pgloader](https://pgloader.io/).
   ```bash
   pgloader server/db/admin.db postgresql://user:pass@localhost/ccd_production
   pgloader server/db/issuance.db postgresql://user:pass@localhost/ccd_production
   pgloader server/db/stop_payments.db postgresql://user:pass@localhost/ccd_production
   ```
2. **Manual CSV Export**: Alternatively, you can use DB Browser for SQLite to export your tables to `.csv` files, and use the Postgres `COPY` command or pgAdmin interface to import them into your new Postgres database.
