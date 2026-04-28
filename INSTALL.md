# Installation & Setup Guide

This guide provides step-by-step instructions for deploying and running the Control Disbursement (CCD) Application on any new machine.

## Prerequisites

Before you begin, ensure you have the following installed on your system:
1. **Node.js** (v18.x or v20.x recommended) - [Download here](https://nodejs.org/)
2. **npm** (comes bundled with Node.js)
3. **Angular CLI** (v17+) - Install globally by running:
   ```bash
   npm install -g @angular/cli
   ```
4. **Git** (optional, for cloning the repository)

---

## 1. Get the Source Code
If you are pulling from a repository:
```bash
git clone <repository-url>
cd ccd
```
If you are copying the files manually, simply extract the project folder and navigate into it using your terminal.

---

## 2. Install Dependencies

The application is split into two parts: the Angular Frontend (root directory) and the Express Backend (`server/` directory). **You must install dependencies for both.**

**Install Frontend Dependencies:**
```bash
# From the root directory (ccd/)
npm install
```

**Install Backend Dependencies:**
```bash
# Navigate to the backend directory
cd server

# Install backend packages
npm install
```

---

## 3. Database Initialization

The backend uses SQLite for storage. 
1. The databases are automatically generated inside `server/db/` the first time the server boots up. 
2. No external database servers (like MySQL or PostgreSQL) need to be installed.
3. The `server/uploads/icl/` directory will also automatically be created to store parsed ICL check images.

---

## 4. Starting the Application

### Option A: Quick Start (Windows Only)
If you are running on a Windows environment, we provide a script that automatically manages ports, kills old orphaned processes, and starts both servers in parallel:

1. Open PowerShell in the root directory (`ccd/`).
2. Run the startup script:
   ```powershell
   .\start-servers.ps1
   ```
3. The script will print the Local and LAN IP addresses you can use to access the web interface.

### Option B: Manual Start (Mac / Linux / Windows)
If you are not on Windows or prefer to run them manually in separate terminal tabs:

**Terminal 1: Start the Backend API**
```bash
# From the root directory
cd server
node server.js
```
*You should see: `Server is running cleanly on port 3000`*

**Terminal 2: Start the Frontend UI**
```bash
# From the root directory
npm start
```
*This will compile the Angular application and serve it on port `4200`.*

---

## 5. Accessing the Application

Once both servers are running:
1. Open your web browser.
2. Navigate to: `http://localhost:4200`
3. Log in using the default credentials:
   - **Username:** `demo`
   - **Password:** `demo123`

*(Note: If you want other users on your local network to access it, replace `localhost` with your machine's IPv4 address).*

---

## 6. Production Deployment Notes
If you are deploying this to a production environment (like AWS, Azure, or a local Linux server):
1. Compile the frontend using `ng build`. This will output static files into the `dist/` directory.
2. Use a reverse proxy (like **Nginx** or **Apache**) to serve the static frontend files on port `80`/`443`.
3. Configure the reverse proxy to forward any requests hitting `/api` directly to your Node.js backend running on port `3000`.
4. Run the backend using a process manager like `pm2` (`pm2 start server.js`).
