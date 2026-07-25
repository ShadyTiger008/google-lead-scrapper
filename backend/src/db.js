const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'leads.db');
const db = new Database(dbPath);

// Enable WAL mode for better concurrency performance
db.pragma('journal_mode = WAL');

// Initialize the leads table
db.exec(`
  CREATE TABLE IF NOT EXISTS leads (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT,
    address TEXT,
    phone TEXT,
    website TEXT,
    rating REAL,
    review_count INTEGER,
    status TEXT,
    place_url TEXT UNIQUE,
    has_website INTEGER CHECK(has_website IN (0, 1)),
    website_resolves INTEGER CHECK(website_resolves IN (0, 1, NULL)),
    is_https INTEGER CHECK(is_https IN (0, 1, NULL)),
    search_category TEXT,
    search_location TEXT,
    scraped_at TEXT DEFAULT CURRENT_TIMESTAMP,
    priority TEXT DEFAULT 'low'
  );
`);

// Backward compatibility check to add columns to an existing table
try {
  db.exec('ALTER TABLE leads ADD COLUMN website_resolves INTEGER CHECK(website_resolves IN (0, 1, NULL))');
} catch (e) {
  // Ignore error if column already exists
}
try {
  db.exec('ALTER TABLE leads ADD COLUMN is_https INTEGER CHECK(is_https IN (0, 1, NULL))');
} catch (e) {
  // Ignore error if column already exists
}

/**
 * Saves or updates a business lead in the database.
 * Deduplicates on 'id' (which is the unique Place ID/CID extracted from the Google Maps URL).
 * @param {Object} lead 
 */
function saveLead(lead) {
  const stmt = db.prepare(`
    INSERT INTO leads (
      id, name, category, address, phone, website, rating, review_count, status, place_url, has_website, website_resolves, is_https, search_category, search_location, priority
    ) VALUES (
      @id, @name, @category, @address, @phone, @website, @rating, @review_count, @status, @place_url, @has_website, @website_resolves, @is_https, @search_category, @search_location, @priority
    ) ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      category = excluded.category,
      address = excluded.address,
      phone = excluded.phone,
      website = excluded.website,
      rating = excluded.rating,
      review_count = excluded.review_count,
      status = excluded.status,
      place_url = excluded.place_url,
      has_website = excluded.has_website,
      website_resolves = excluded.website_resolves,
      is_https = excluded.is_https,
      search_category = excluded.search_category,
      search_location = excluded.search_location,
      priority = excluded.priority,
      scraped_at = CURRENT_TIMESTAMP
  `);
  
  const leadData = {
    website_resolves: null,
    is_https: null,
    ...lead
  };
  return stmt.run(leadData);
}

/**
 * Retrieves all leads from the database, optionally filtered by category or location.
 * @param {Object} filters
 * @returns {Array} List of leads
 */
function getLeads(filters = {}) {
  let query = 'SELECT * FROM leads';
  const conditions = [];
  const params = {};

  if (filters.category) {
    conditions.push('search_category = @category');
    params.category = filters.category;
  }
  if (filters.location) {
    conditions.push('search_location = @location');
    params.location = filters.location;
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY scraped_at DESC';

  const stmt = db.prepare(query);
  return stmt.all(params);
}

module.exports = {
  saveLead,
  getLeads,
  db
};
