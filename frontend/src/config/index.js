/**
 * Centralized API configuration.
 *
 * - In development (local), the backend runs on localhost:5050.
 * - In production (Render/Vercel), set the NEXT_PUBLIC_API_URL environment
 *   variable to the deployed backend URL (e.g. https://your-api.onrender.com).
 */
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:5050";

/**
 * Named API endpoint helpers.
 * Import individual endpoints to keep fetch() calls clean across the app.
 */
export const API_ENDPOINTS = {
  leads: `${API_BASE_URL}/api/leads`,
  scrape: `${API_BASE_URL}/api/scrape`,
  scrapeStatus: `${API_BASE_URL}/api/scrape/status`,
  export: `${API_BASE_URL}/api/export`,
};
