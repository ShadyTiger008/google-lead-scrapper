const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { runScraper } = require('./scraper');
const { saveLead, getLeads } = require('./db');
const { checkWebsite } = require('./enricher');
const { exportToExcel } = require('./exporter');

const app = express();
const PORT = process.env.PORT || 5050;

// Enable CORS for frontend client
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  methods: ['GET', 'POST'],
  credentials: true
}));

app.use(express.json());

// Request logger middleware (ignores status polling to prevent console spam)
app.use((req, res, next) => {
  if (req.url !== '/api/scrape/status') {
    console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
  }
  next();
});

// In-memory tracker for the active background scraping job
let currentJob = {
  status: 'idle', // 'idle' | 'running'
  category: '',
  location: '',
  progress: 0,
  total: 0,
  logs: [],
  error: null
};

/**
 * Endpoint to fetch all leads from SQLite
 * Supports query filters: ?category=... &location=...
 */
app.get('/api/leads', (req, res) => {
  try {
    const filters = {
      category: req.query.category || null,
      location: req.query.location || null
    };
    const leads = getLeads(filters);
    res.json(leads);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Endpoint to check current scraping job status
 */
app.get('/api/scrape/status', (req, res) => {
  res.json(currentJob);
});

/**
 * Endpoint to trigger a new scraping job in the background
 */
app.post('/api/scrape', (req, res) => {
  const { category, location, lat, lng, radius, count } = req.body;
  let categories = [];
  if (Array.isArray(category)) {
    categories = category.map(c => c.trim()).filter(Boolean);
  } else if (typeof category === 'string') {
    categories = category.split(',').map(c => c.trim()).filter(Boolean);
  }

  if (categories.length === 0) {
    return res.status(400).json({ error: 'Category is required.' });
  }
  if (!location && (!lat || !lng)) {
    return res.status(400).json({ error: 'Either location or coordinate filters must be provided.' });
  }

  if (currentJob.status === 'running') {
    return res.status(400).json({ error: 'A scraping job is already running.' });
  }

  const targetCount = parseInt(count, 10) || 10;

  // Initialize new job state
  currentJob = {
    status: 'running',
    category: categories.join(', '),
    location: location || `${lat},${lng}`,
    progress: 0,
    total: categories.length * targetCount,
    logs: ['Initializing headed browser...'],
    error: null
  };

  // Helper to run scraper sequentially for all requested categories
  const runSequentialScrapers = async () => {
    const allResults = [];
    for (let i = 0; i < categories.length; i++) {
      const currentCategory = categories[i];
      currentJob.logs.push(`[Job ${i + 1}/${categories.length}] Starting scraper for category: "${currentCategory}"...`);

      const results = await runScraper({
        category: currentCategory,
        location,
        lat,
        lng,
        radius: radius ? parseFloat(radius) : null,
        count: targetCount
      }, async (lead) => {
        // Log progress
        currentJob.logs.push(`[${currentCategory}] Scraped: "${lead.name}". Running website checks...`);
        
        // Perform enrichment on website
        if (lead.website) {
          try {
            const check = await checkWebsite(lead.website);
            lead.website_resolves = check.resolves;
            lead.is_https = check.isHttps;
            currentJob.logs.push(`Enriched "${lead.name}": Resolves=${check.resolves === 1 ? 'Yes' : 'No'}, HTTPS=${check.isHttps === 1 ? 'Yes' : 'No'}`);
          } catch (err) {
            lead.website_resolves = 0;
            lead.is_https = lead.website.toLowerCase().startsWith('https://') ? 1 : 0;
          }
        } else {
          lead.website_resolves = 0;
          lead.is_https = 0;
        }

        // Save lead to SQLite
        try {
          saveLead(lead);
          currentJob.logs.push(`Saved "${lead.name}" to database.`);
        } catch (dbErr) {
          currentJob.logs.push(`Database Error for "${lead.name}": ${dbErr.message}`);
        }

        currentJob.progress += 1;
      });

      allResults.push(...results);
    }
    return allResults;
  };

  // Run scraper asynchronously in the background
  runSequentialScrapers()
  .then((results) => {
    currentJob.status = 'idle';
    currentJob.logs.push(`Scrape session completed successfully! ${results.length} leads processed.`);
  })
  .catch((err) => {
    currentJob.status = 'idle';
    currentJob.error = err.message;
    currentJob.logs.push(`Fatal Scraper Error: ${err.message}`);
  });

  // Return 202 Accepted immediately
  res.status(202).json(currentJob);
});

/**
 * Endpoint to export leads to Excel and download directly
 */
app.get('/api/export', async (req, res) => {
  const tempFilePath = path.join(__dirname, '..', `leads_${Date.now()}.xlsx`);
  try {
    const filters = {
      category: req.query.category || null,
      location: req.query.location || null
    };

    const leads = getLeads(filters);
    if (leads.length === 0) {
      return res.status(404).json({ error: 'No leads found to export.' });
    }

    await exportToExcel(leads, tempFilePath);

    res.download(tempFilePath, 'leads.xlsx', (err) => {
      // Clean up temp file
      try {
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
        }
      } catch (cleanupErr) {
        console.error('Failed to clean up temp export file:', cleanupErr.message);
      }

      if (err && !res.headersSent) {
        res.status(500).json({ error: 'Failed to download Excel file.' });
      }
    });
  } catch (err) {
    try {
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
    } catch (e) {}
    res.status(500).json({ error: err.message });
  }
});

// Start listening
app.listen(PORT, () => {
  console.log(`Lead Scraper Backend running at http://localhost:${PORT}`);
});
