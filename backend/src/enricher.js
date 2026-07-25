const http = require('http');
const https = require('https');

/**
 * Checks a website URL by sending a HEAD request (falling back to GET if HEAD fails)
 * to verify if the website resolves and if it is served over HTTPS.
 * @param {string} urlString 
 * @returns {Promise<{resolves: number, isHttps: number}>} Resolves status and HTTPS status (1 for true, 0 for false)
 */
async function checkWebsite(urlString) {
  if (!urlString) {
    return { resolves: 0, isHttps: 0 };
  }

  // Basic check for string presence of https
  const initialHttps = urlString.toLowerCase().startsWith('https://') ? 1 : 0;

  return new Promise((resolve) => {
    let parsedUrl;
    try {
      parsedUrl = new URL(urlString);
    } catch (err) {
      return resolve({ resolves: 0, isHttps: initialHttps });
    }

    const client = parsedUrl.protocol === 'https:' ? https : http;

    const requestOptions = {
      method: 'HEAD',
      timeout: 5000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
      }
    };

    // Attempt HEAD request first (quicker, low bandwidth)
    const req = client.request(parsedUrl, requestOptions, (res) => {
      const status = res.statusCode || 0;
      const resolves = (status >= 200 && status < 400) ? 1 : 0;
      
      let isHttps = parsedUrl.protocol === 'https:' ? 1 : 0;

      // Handle redirect status codes to check if they point to HTTPS
      if (status >= 300 && status < 400 && res.headers.location) {
        if (res.headers.location.toLowerCase().startsWith('https://')) {
          isHttps = 1;
        }
      }

      resolve({ resolves, isHttps });
    });

    req.on('error', () => {
      // If HEAD fails, some websites block HEAD requests. Let's fall back to a quick GET request.
      const getOptions = { ...requestOptions, method: 'GET' };
      const getReq = client.request(parsedUrl, getOptions, (res) => {
        const status = res.statusCode || 0;
        const resolves = (status >= 200 && status < 400) ? 1 : 0;
        
        let isHttps = parsedUrl.protocol === 'https:' ? 1 : 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          if (res.headers.location.toLowerCase().startsWith('https://')) {
            isHttps = 1;
          }
        }
        resolve({ resolves, isHttps });
      });

      getReq.on('error', () => {
        resolve({ resolves: 0, isHttps: initialHttps });
      });

      getReq.on('timeout', () => {
        getReq.destroy();
        resolve({ resolves: 0, isHttps: initialHttps });
      });

      getReq.end();
    });

    req.on('timeout', () => {
      req.destroy();
      // Try fallback to GET even on HEAD timeout
      const getOptions = { ...requestOptions, method: 'GET', timeout: 3000 };
      const getReq = client.request(parsedUrl, getOptions, (res) => {
        const status = res.statusCode || 0;
        const resolves = (status >= 200 && status < 400) ? 1 : 0;
        let isHttps = parsedUrl.protocol === 'https:' ? 1 : 0;
        resolve({ resolves, isHttps });
      });
      getReq.on('error', () => resolve({ resolves: 0, isHttps: initialHttps }));
      getReq.on('timeout', () => {
        getReq.destroy();
        resolve({ resolves: 0, isHttps: initialHttps });
      });
      getReq.end();
    });

    req.end();
  });
}

module.exports = {
  checkWebsite
};
