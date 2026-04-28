# Developer Skills & Environment Setup (SKILL.md)

This document captures the essential technical setup, developer workflows, and AI prompting instructions necessary to maintain and extend the Control Disbursement (CCD) Web Application.

## 1. Environment & Architecture Stack

**Frontend:**
- **Framework:** Angular 17+ (Standalone Components).
- **Styling:** Vanilla CSS (component-scoped and global `styles.css`), SVG-based icons.
- **Server:** Webpack Dev Server running on Port `4200` (`npm start`).

**Backend:**
- **Runtime:** Node.js, Express.js.
- **Database:** SQLite (`sqlite3`), storing data in `server/db/`. Databases include `issuance.db`, `stop_payments.db`, `admin.db`.
- **Server:** Node running on Port `3000` (`node server.js`).
- **File Parsing:** Custom X9/ICL file parsers (`server/x9-parser.js`) utilizing `sharp` for TIFF-to-PNG image extraction.

## 2. Server Startup & Workflows

### How to Start the Application
To run the full stack locally for development or network testing:
1. Open PowerShell.
2. Execute `.\start-servers.ps1`.
   - *This script automatically cleans up orphaned ports and spins up both the Node.js backend and the Angular frontend in separate background windows.*

### Environment Variables & API Routing (CRITICAL RULE)
Due to Angular's development build configuration:
- **Rule:** Always import `environment.development` explicitly in your TypeScript components during development instead of `environment`.
- **Why:** `environment.development.ts` sets the `apiUrl` to `http://<hostname>:3000/api` (the backend), whereas `environment.ts` defaults to `/api` (for production Nginx proxies). Importing the wrong file will cause `404 Not Found` API errors when testing locally.

**Correct Import:**
```typescript
import { environment } from '../../../environments/environment.development';
const API = `${environment.apiUrl}/module-name`;
```

## 3. Reference Prompts for Future AI Development

Use the following reference prompts when extending the application to ensure consistency:

### A. Creating a New Module
> "I want to create a new module called [ModuleName]. Create a standalone Angular component at `src/app/pages/[module-name]`. Add it to the routing in `app.routes.ts`. Follow the design tokens established in `DESIGN.md` using `.icl-card` and `.icl-table`. Then, create a corresponding API route in `server/server.js` and a new SQLite table if persistent storage is required."

### B. Modifying Database Schemas
> "I need to add a new field `[fieldName]` to the `[tableName]` table. Please:
> 1. Write an `ALTER TABLE` SQL command to update the SQLite database in `server.js` on startup (using `IF NOT EXISTS` logic via `PRAGMA table_info`).
> 2. Update the `INSERT` and `UPDATE` API queries to accommodate the new field.
> 3. Update the corresponding TypeScript Interface in the Angular component.
> 4. Add the field to the HTML data table and input forms."

### C. Troubleshooting ICL File Uploads
> "If an ICL file upload fails: 
> 1. Check if the file exceeds the `express.json` limit in `server.js` (currently 500MB).
> 2. Check the browser Network tab. If it's a 404, verify the component is importing `environment.development.ts`.
> 3. If the file parses but Check Details are wrong, review the string slicing logic in `server/x9-parser.js` (remembering that Type 25 and Type 31 records have different offsets for fields like the On-Us/Account Number)."

## 4. Common Troubleshooting Scripts
- **Testing Backend Parsers:** `node test-parser.js` will simulate X9 file parsing natively without launching the HTTP server.
- **Testing Backend Endpoints:** `node test-api.js` simulates Angular's API payload, ensuring `base64` JSON ingestion works independently of the UI.
