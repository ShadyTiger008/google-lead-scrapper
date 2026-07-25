const { chromium } = require('playwright');

/**
 * Calculates approximate Google Maps zoom level based on search radius in kilometers.
 * @param {number} radiusKm 
 * @returns {number} Zoom level
 */
function calculateZoom(radiusKm) {
  // At zoom 13, the map spans roughly 10-15 km.
  // We approximate zoom using log2.
  const zoom = Math.round(14 - Math.log2(radiusKm));
  return Math.max(2, Math.min(21, zoom)); // Google Maps zoom is 2-21
}

/**
 * Extracts a unique Place ID / CID from the Google Maps URL.
 * @param {string} url 
 * @returns {string} Unique identifier
 */
function extractPlaceId(url) {
  // Try to find the hex pair pattern (0x...:0x...) which is the Google Maps CID
  const cidMatch = url.match(/(0x[0-9a-fA-F]+:0x[0-9a-fA-F]+)/);
  if (cidMatch) {
    return cidMatch[1];
  }

  // Try to find the !1s Place ID pattern
  const placeIdMatch = url.match(/!1s([^!]+)/);
  if (placeIdMatch) {
    return placeIdMatch[1];
  }

  // Fallback: strip query params from the URL
  return url.split('?')[0];
}

/**
 * Extracts business details from the active Google Maps place detail page.
 * @param {import('playwright').Page} page 
 * @param {string} fallbackUrl 
 * @returns {Promise<Object>} Extracted lead data
 */
async function scrapeCurrentDetailsPage(page, fallbackUrl) {
  const placeUrl = page.url() || fallbackUrl;
  const id = extractPlaceId(placeUrl);

  // Extract Name (h1.DUwDvf or first h1 in detail panel)
  let name = '';
  try {
    name = await page.locator('h1.DUwDvf').first().textContent();
  } catch (err) {
    try {
      name = await page.locator('h1').first().textContent();
    } catch (e) {
      name = 'Unknown Business';
    }
  }
  name = name ? name.trim().replace(/[\uE000-\uF8FF]/g, '') : 'Unknown Business';

  // Extract Category (DkEaL/DkEaCc classes are standard for category button)
  let category = '';
  try {
    category = await page.locator('button.DkEaL, button.DkEaCc').first().textContent();
  } catch (err) {
    try {
      // Fallback: look for span styled with primary categories
      category = await page.locator('span.fontBodyMedium').first().textContent();
    } catch (e) {
      category = '';
    }
  }
  category = category ? category.trim().replace(/[\uE000-\uF8FF]/g, '').replace(/^[·\s\n\r]+|[·\s\n\r]+$/g, '') : '';

  // Extract Address
  let address = '';
  try {
    address = await page.locator('button[data-item-id="address"]').first().textContent();
  } catch (err) {
    address = '';
  }
  address = address ? address.trim().replace(/[\uE000-\uF8FF]/g, '').trim() : '';

  // Extract Phone Number
  let phone = '';
  try {
    phone = await page.locator('button[data-item-id^="phone:tel:"]').first().textContent();
  } catch (err) {
    phone = '';
  }
  phone = phone ? phone.trim().replace(/[\uE000-\uF8FF]/g, '').trim() : '';

  // Extract Website
  let website = '';
  try {
    website = await page.locator('a[data-item-id="authority"]').first().getAttribute('href');
  } catch (err) {
    website = '';
  }
  website = website ? website.trim() : '';

  // Extract Rating and Review Count
  let rating = null;
  let reviewCount = null;
  try {
    const ratingText = await page.locator('div.F7nice').first().textContent();
    if (ratingText) {
      // Extract numeric rating and reviews count (e.g. "4.5(120)")
      const match = ratingText.match(/([\d[,.]+)\s*\(([\d,]+)\)/);
      if (match) {
        rating = parseFloat(match[1].replace(',', '.'));
        reviewCount = parseInt(match[2].replace(/,/g, ''), 10);
      } else {
        const ratingMatch = ratingText.match(/([\d[,.]+)/);
        if (ratingMatch) {
          rating = parseFloat(ratingMatch[1].replace(',', '.'));
        }
      }
    }
  } catch (err) {
    // Keep null
  }

  // Extract Status (Open/Closed/Closed-Opens...)
  let status = '';
  try {
    // Target the collapsible hours button or container
    status = await page.locator('div.OMl5r, div[jsaction*="pane.info.hours"], div[jsaction*="pane.openhours."], div[role="button"]:has(span[aria-label="Hours"])').first().textContent();
  } catch (err) {
    status = '';
  }
  // Clean up any dropdown arrow icons or control characters (e.g. )
  status = status ? status.trim().replace(/[\r\n\s]+/g, ' ').replace(/[\uE000-\uF8FF]/g, '').replace(/[·]+/g, '').trim() : '';

  const hasWebsite = website ? 1 : 0;
  const priority = hasWebsite ? 'low' : 'high';

  return {
    id,
    name,
    category,
    address,
    phone,
    website,
    rating,
    review_count: reviewCount,
    status,
    place_url: placeUrl,
    has_website: hasWebsite,
    priority
  };
}

/**
 * Runs the scraper for the given configuration.
 * @param {Object} options 
 * @param {Function} onLeadScraped Callback triggered immediately for each scraped lead
 */
async function runScraper(options, onLeadScraped) {
  const { category, location, lat, lng, radius, count } = options;
  
  // 1. Build search URL
  let searchUrl = '';
  if (location) {
    searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(category + ' in ' + location)}`;
  } else if (lat && lng) {
    const zoom = radius ? calculateZoom(radius) : 13;
    searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(category)}/@${lat},${lng},${zoom}z`;
  } else {
    throw new Error('Either location or latitude/longitude coordinates must be provided.');
  }

  console.log(`Launching headed Playwright browser...`);
  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-blink-features=AutomationControlled']
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 }
  });

  const page = await context.newPage();
  console.log(`Navigating to search URL: ${searchUrl}`);
  await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });

  // 2. Wait for results or direct redirect
  try {
    await page.waitForSelector('div[role="feed"], h1.DUwDvf', { timeout: 15000 });
  } catch (err) {
    console.log('No results panel or detail page loaded (timeout).');
    await browser.close();
    return [];
  }

  // Handle single result page redirect
  const feedCount = await page.locator('div[role="feed"]').count();
  if (feedCount === 0) {
    console.log('Google Maps redirected directly to a single business profile.');
    const lead = await scrapeCurrentDetailsPage(page, page.url());
    lead.search_category = category;
    lead.search_location = location || `${lat},${lng}`;
    
    if (onLeadScraped) {
      await onLeadScraped(lead);
    }
    await browser.close();
    return [lead];
  }

  // 3. Scroll Left Panel results to lazy-load leads until count is reached
  console.log(`Scrolling results panel to collect listings (target: ${count})...`);
  const feed = page.locator('div[role="feed"]');
  const seenUrls = new Set();
  let noNewResultsCount = 0;

  while (seenUrls.size < count && noNewResultsCount < 10) {
    const currentListings = await page.locator('a[href*="/maps/place/"]').all();
    const prevSize = seenUrls.size;

    for (const listing of currentListings) {
      const url = await listing.getAttribute('href').catch(() => null);
      if (url) {
        seenUrls.add(url);
      }
    }

    if (seenUrls.size >= count) {
      break;
    }

    if (seenUrls.size === prevSize) {
      noNewResultsCount++;
    } else {
      noNewResultsCount = 0;
      console.log(`Collected ${seenUrls.size} business URLs so far...`);
    }

    // Scroll feed down
    await feed.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });

    // Wait for lazy loading (randomized delay to act like a human)
    await page.waitForTimeout(2000 + Math.random() * 1000);

    // Check for end of list banner
    const isEnd = await page.locator('text="You\'ve reached the end of the list"').isVisible().catch(() => false);
    if (isEnd) {
      console.log("Reached the end of Google Maps results.");
      break;
    }
  }

  const urlsToScrape = Array.from(seenUrls).slice(0, count);
  console.log(`Finished collecting links. Total unique listings to scrape: ${urlsToScrape.length}`);

  const scrapedLeads = [];

  // 4. Scrape each listing in detail
  for (let i = 0; i < urlsToScrape.length; i++) {
    const targetUrl = urlsToScrape[i];
    console.log(`[${i + 1}/${urlsToScrape.length}] Scraping: ${targetUrl}`);

    let loaded = false;
    // Attempt clicking in feed if the card is visible, to emulate human behavior
    const escapedUrl = targetUrl.replace(/"/g, '\\"');
    const cardLocator = page.locator(`a[href="${escapedUrl}"]`);

    if (await cardLocator.count() > 0) {
      try {
        await cardLocator.scrollIntoViewIfNeeded();
        await cardLocator.click();
        // Wait for name title or URL to shift
        await page.waitForSelector('h1.DUwDvf', { state: 'visible', timeout: 5000 });
        loaded = true;
      } catch (err) {
        console.log(`Clicking card failed or timed out. Falling back to direct navigation...`);
      }
    }

    if (!loaded) {
      try {
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('h1.DUwDvf', { state: 'visible', timeout: 8000 });
      } catch (err) {
        console.log(`Skipping: Could not load detail page.`);
        continue;
      }
    }

    // Add random human delay before extracting details
    await page.waitForTimeout(1000 + Math.random() * 1500);

    try {
      const lead = await scrapeCurrentDetailsPage(page, targetUrl);
      lead.search_category = category;
      lead.search_location = location || `${lat},${lng}`;

      console.log(`> Extracted: "${lead.name}" | Website: ${lead.website || 'None'} | Phone: ${lead.phone || 'None'}`);

      if (onLeadScraped) {
        await onLeadScraped(lead);
      }
      scrapedLeads.push(lead);
    } catch (err) {
      console.log(`Error parsing lead detail:`, err.message);
    }

    // Add random human delay after scraping before going to next listing
    await page.waitForTimeout(1000 + Math.random() * 2000);
  }

  console.log(`Scraping complete. Closing browser.`);
  await browser.close();

  return scrapedLeads;
}

module.exports = {
  runScraper
};
