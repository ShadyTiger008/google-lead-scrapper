const { Command } = require('commander');
const { runScraper } = require('./scraper');
const { saveLead, getLeads } = require('./db');
const { checkWebsite } = require('./enricher');
const { exportToExcel } = require('./exporter');

const ROTATING_CATEGORIES = [
  'dentist',
  'plumber',
  'roofing contractor',
  'lawyer',
  'restaurant',
  'hair salon',
  'accounting service',
  'gym',
  'bakery',
  'dry cleaner'
];

const program = new Command();

program
  .name('google-lead-scraper')
  .description('A personal, local-only Google Maps lead generation tool')
  .version('1.0.0');

// 1. DEFAULT COMMAND: SCRAPE
program
  .command('scrape', { isDefault: true })
  .description('Scrape business leads from Google Maps (default command)')
  .option('-c, --category <type>', 'Business category (e.g., restaurant, garment shop). If omitted, searches a rotating list of common categories.')
  .option('-l, --location <city>', 'Location name (e.g., Kolkata, New York).')
  .option('--lat <latitude>', 'Latitude coordinate for coordinate-centered search.')
  .option('--lng <longitude>', 'Longitude coordinate for coordinate-centered search.')
  .option('-r, --radius <radiusKm>', 'Search radius in km (used with lat/lng, or city search)', (val) => parseFloat(val))
  .option('--count <number>', 'Number of leads to collect', (val) => parseInt(val, 10), 50)
  .action(async (options) => {
    try {
      const hasLocation = !!options.location;
      const hasCoordinates = !!options.lat && !!options.lng;

      if (!hasLocation && !hasCoordinates) {
        console.error('Error: You must specify either a location (--location) or coordinates (--lat and --lng).');
        process.exit(1);
      }

      let searchCategory = options.category;
      if (!searchCategory) {
        searchCategory = ROTATING_CATEGORIES[Math.floor(Math.random() * ROTATING_CATEGORIES.length)];
        console.log(`No category specified. Selecting from rotating list: "${searchCategory}"`);
      }

      const count = options.count;
      console.log(`Starting scrape of ${count} leads for "${searchCategory}"...`);

      const results = await runScraper({
        category: searchCategory,
        location: options.location,
        lat: options.lat,
        lng: options.lng,
        radius: options.radius,
        count: count
      }, async (lead) => {
        // Run website resolution and HTTPS check if a website is present
        if (lead.website) {
          console.log(`  [Enrichment] Verifying website: ${lead.website}...`);
          try {
            const check = await checkWebsite(lead.website);
            lead.website_resolves = check.resolves;
            lead.is_https = check.isHttps;
            console.log(`  [Enrichment] Resolves: ${check.resolves === 1 ? 'Yes' : 'No'} | HTTPS: ${check.isHttps === 1 ? 'Yes' : 'No'}`);
          } catch (enrichErr) {
            console.error(`  [Enrichment Error] Failed for ${lead.website}:`, enrichErr.message);
            lead.website_resolves = 0;
            lead.is_https = lead.website.toLowerCase().startsWith('https://') ? 1 : 0;
          }
        } else {
          lead.website_resolves = 0;
          lead.is_https = 0;
        }

        // Save lead immediately to SQLite
        try {
          saveLead(lead);
          console.log(`  [DB] Saved: "${lead.name}" to SQLite.`);
        } catch (dbErr) {
          console.error(`  [DB Error] Failed to save "${lead.name}":`, dbErr.message);
        }
      });

      console.log(`\nScrape session completed successfully. ${results.length} leads processed.`);
      process.exit(0);
    } catch (err) {
      console.error('Fatal Scraper Error:', err.message);
      process.exit(1);
    }
  });

// 2. EXPORT COMMAND
program
  .command('export')
  .description('Export stored leads from SQLite to an Excel spreadsheet')
  .option('-f, --format <format>', 'Output file format (only xlsx is supported)', 'xlsx')
  .option('-o, --output <path>', 'Output file path', 'leads.xlsx')
  .option('-c, --category <type>', 'Filter leads by category')
  .option('-l, --location <city>', 'Filter leads by location')
  .action(async (options) => {
    try {
      if (options.format.toLowerCase() !== 'xlsx') {
        console.error('Error: Only xlsx format is supported for export currently.');
        process.exit(1);
      }

      console.log(`Querying database for leads...`);
      const leads = getLeads({
        category: options.category,
        location: options.location
      });

      if (leads.length === 0) {
        console.log('No leads found matching the filters.');
        process.exit(0);
      }

      console.log(`Exporting ${leads.length} leads to ${options.output}...`);
      const absolutePath = await exportToExcel(leads, options.output);
      console.log(`Export complete! File saved at: ${absolutePath}`);
      process.exit(0);
    } catch (err) {
      console.error('Fatal Export Error:', err.message);
      process.exit(1);
    }
  });

program.parse(process.argv);
