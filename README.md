# Google Maps Lead Scraper & Dashboard

A personal, local-only lead generation tool that extracts business data from Google Maps (bypassing paid APIs) into a local SQLite database, performs HTTP website resolution & HTTPS checks, and exports data into formatted Excel spreadsheets. It includes both a command-line interface (CLI) and an interactive web dashboard.

---

## Project Structure
```
google-lead-scrapper/
├── backend/
│   ├── leads.db              # SQLite Database holding scraped leads
│   ├── package.json          # Backend dependencies (better-sqlite3, playwright, exceljs, express, cors)
│   └── src/
│       ├── index.js          # CLI entry point (for running in terminal)
│       ├── server.js         # REST API server (port 5000)
│       ├── scraper.js        # Playwright scraper core
│       ├── db.js             # SQLite management and Lead upserting
│       ├── enricher.js       # Website HTTP resolution checks
│       └── exporter.js       # Styled Excel sheet exporter
├── frontend/
│   ├── package.json          # Next.js React dependencies
│   └── src/
│       └── app/
│           ├── page.js       # Interactive Web Dashboard
│           ├── layout.js     # Dashboard Root layout
│           └── globals.css   # Premium dark mode & glassmorphic styles
└── README.md                 # Project instructions (this file)
```

---

## Prerequisites
- Node.js (v18+ recommended)
- Playwright Chromium browser binaries (automatically installed via backend setup)

---

## Setup & Running

### 1. Backend Server Setup
From the project root:
```bash
# Navigate to the backend directory
cd backend

# Install dependencies
npm install

# Option A: Start the Express API server (needed for the Web UI)
npm run server

# Option B: Run the scraper directly via Command Line (CLI)
# Example: Scrape 5 dentists in New York
npm run scrape -- --category "dentist" --location "New York" --count 5
# Example: Export leads to leads.xlsx via CLI
npm run scrape -- export --output leads.xlsx
```

### 2. Frontend Next.js Dashboard Setup
In a new terminal window from the project root:
```bash
# Navigate to the frontend directory
cd frontend

# Install dependencies
npm install

# Start the Next.js development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to access the interactive web dashboard.

---

## Web Dashboard Features
1. **Interactive Scrape Form**: Enter category, location, and desired lead limit count. The dashboard calls the backend and displays log progression and progress bars in real-time.
2. **Key Performance Metrics**: View stats including total lead count, coverage rate, and HTTPS secure site counts.
3. **Leads Table**: Search through collected leads instantly, filter by category or location, and examine status & website resolution directly.
4. **Styled Excel Exports**: Click **Export to Excel** to trigger a database query and download a styled Excel worksheet featuring custom column sizes and red highlights for website-less prospects.
