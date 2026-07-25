"use client";

import { useState, useEffect, useRef } from "react";
import { API_BASE_URL, API_ENDPOINTS } from "@/config";

const SUGGESTED_CATEGORIES = [
  "dentist",
  "plumber",
  "roofing contractor",
  "lawyer",
  "restaurant",
  "hair salon",
  "accounting service",
  "gym",
  "bakery"
];

export default function Home() {
  // Leads List
  const [leads, setLeads] = useState([]);
  const [loadingLeads, setLoadingLeads] = useState(true);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterLocation, setFilterLocation] = useState("");

  // Scrape Form state
  const [scrapeCategory, setScrapeCategory] = useState("");
  const [scrapeLocation, setScrapeLocation] = useState("");
  const [scrapeCount, setScrapeCount] = useState("10");

  // Active Scraping Job state
  const [job, setJob] = useState({
    status: "idle",
    category: "",
    location: "",
    progress: 0,
    total: 0,
    logs: [],
    error: null
  });

  const consoleEndRef = useRef(null);

  // Get an array of currently selected categories from the string
  const getSelectedCategories = () => {
    return scrapeCategory
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
  };

  // Check if a category tag is selected (case-insensitive)
  const isCategorySelected = (cat) => {
    const selected = getSelectedCategories();
    return selected.some((s) => s.toLowerCase() === cat.toLowerCase());
  };

  // Toggle category selection in the input field
  const handleToggleCategory = (cat) => {
    setScrapeCategory((prev) => {
      const selected = prev.split(",").map((s) => s.trim()).filter(Boolean);
      const isSelected = selected.some((s) => s.toLowerCase() === cat.toLowerCase());
      if (isSelected) {
        return selected.filter((s) => s.toLowerCase() !== cat.toLowerCase()).join(", ");
      } else {
        return [...selected, cat].join(", ");
      }
    });
  };

  // Fetch leads from database
  const fetchLeads = async () => {
    try {
      const res = await fetch(API_ENDPOINTS.leads);
      if (res.ok) {
        const data = await res.json();
        setLeads(data);
      }
    } catch (err) {
      console.error("Failed to fetch leads:", err);
    } finally {
      setLoadingLeads(false);
    }
  };

  // Poll for background scraping status
  const checkJobStatus = async () => {
    try {
      const res = await fetch(API_ENDPOINTS.scrapeStatus);
      if (res.ok) {
        const currentJob = await res.json();
        setJob(currentJob);

        // If the job finished, reload leads
        if (currentJob.status === "idle" && job.status === "running") {
          fetchLeads();
        }
      }
    } catch (err) {
      console.error("Failed to check job status:", err);
    }
  };

  // Run initial fetches
  useEffect(() => {
    fetchLeads();
    checkJobStatus();
  }, []);

  // Set up polling when job is active
  useEffect(() => {
    let intervalId;
    if (job.status === "running") {
      intervalId = setInterval(() => {
        checkJobStatus();
        // Also fetch leads periodically during scrape to show real-time additions
        fetchLeads();
      }, 1500);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [job.status]);

  // Auto-scroll logs panel to the bottom
  useEffect(() => {
    if (consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [job.logs]);

  // Trigger Scrape Job
  const handleStartScrape = async (e) => {
    e.preventDefault();
    if (!scrapeCategory || !scrapeLocation) {
      alert("Please fill in both Category and Location.");
      return;
    }

    try {
      const res = await fetch(API_ENDPOINTS.scrape, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: scrapeCategory,
          location: scrapeLocation,
          count: parseInt(scrapeCount, 10) || 10
        })
      });

      if (res.ok) {
        const startedJob = await res.json();
        setJob(startedJob);
      } else {
        const errData = await res.json();
        alert(errData.error || "Failed to trigger scraping.");
      }
    } catch (err) {
      alert("Error contacting the backend API.");
      console.error(err);
    }
  };

  // Trigger Excel download
  const handleDownloadExcel = () => {
    const params = new URLSearchParams();
    if (filterCategory) params.append("category", filterCategory);
    if (filterLocation) params.append("location", filterLocation);

    window.open(`${API_ENDPOINTS.export}?${params.toString()}`);
  };

  // Compute stats metrics
  const totalCount = leads.length;
  const highPriorityCount = leads.filter(l => l.priority === "high").length;
  const websiteCount = leads.filter(l => l.has_website === 1).length;
  const websiteCoverage = totalCount > 0 ? Math.round((websiteCount / totalCount) * 100) : 0;
  const secureWebsiteCount = leads.filter(l => l.is_https === 1).length;
  const httpsCoverage = websiteCount > 0 ? Math.round((secureWebsiteCount / websiteCount) * 100) : 0;

  // Filter client-side list based on search/filters
  const filteredLeads = leads.filter((lead) => {
    const matchesSearch = 
      lead.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.address.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (lead.phone && lead.phone.includes(searchQuery));
    
    const matchesCategoryFilter = filterCategory 
      ? lead.search_category.toLowerCase() === filterCategory.toLowerCase()
      : true;

    const matchesLocationFilter = filterLocation
      ? lead.search_location.toLowerCase().includes(filterLocation.toLowerCase())
      : true;

    return matchesSearch && matchesCategoryFilter && matchesLocationFilter;
  });

  // Extract unique categories and locations for filter dropdowns
  const uniqueSearchCategories = Array.from(new Set(leads.map(l => l.search_category))).filter(Boolean);
  const uniqueSearchLocations = Array.from(new Set(leads.map(l => l.search_location))).filter(Boolean);

  return (
    <main className="container">
      {/* Header Area */}
      <header className="app-header">
        <div className="app-title-group">
          <h1>LeadScraper Dashboard</h1>
          <p>Local Google Maps Lead Generation & Website Audit</p>
        </div>
        {job.status === "running" && (
          <div className="badge-live">
            <span className="pulse-dot"></span>
            Live Scraping Active
          </div>
        )}
      </header>

      {/* Metrics Row */}
      <section className="metrics-row">
        <div className="metric-card">
          <span className="metric-label">Total Leads</span>
          <span className="metric-value">{totalCount}</span>
          <span className="metric-subtext">Cached in SQLite database</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">High Priority Leads</span>
          <span className="metric-value">{highPriorityCount}</span>
          <span className="metric-subtext">No website (Outreach Targets)</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Website Coverage</span>
          <span className="metric-value">{websiteCoverage}%</span>
          <span className="metric-subtext">{websiteCount} out of {totalCount} leads</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">HTTPS Adoption</span>
          <span className="metric-value">{httpsCoverage}%</span>
          <span className="metric-subtext">{secureWebsiteCount} of {websiteCount} resolved sites</span>
        </div>
      </section>

      {/* Main Grid */}
      <div className="dashboard-grid">
        
        {/* Left Side: Scraper Configuration Form & Progress */}
        <section className="panel">
          <h2>Scraper Settings</h2>
          <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "1.25rem" }}>
            Trigger a real-time Playwright automated search to harvest new business data.
          </p>

          <form onSubmit={handleStartScrape}>
            <div className="form-group">
              <label>Business Category</label>
              <input
                type="text"
                placeholder="e.g. dentist, garment shop"
                className="input-field"
                value={scrapeCategory}
                onChange={(e) => setScrapeCategory(e.target.value)}
                disabled={job.status === "running"}
                required
              />
              <div className="tag-container">
                {SUGGESTED_CATEGORIES.map((cat) => {
                  const isSelected = isCategorySelected(cat);
                  return (
                    <button
                      key={cat}
                      type="button"
                      className={`tag-btn ${isSelected ? "selected" : ""}`}
                      onClick={() => handleToggleCategory(cat)}
                      disabled={job.status === "running"}
                    >
                      {cat}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="form-group">
              <label>Target Location</label>
              <input
                type="text"
                placeholder="e.g. Salt Lake, Kolkata"
                className="input-field"
                value={scrapeLocation}
                onChange={(e) => setScrapeLocation(e.target.value)}
                disabled={job.status === "running"}
                required
              />
            </div>

            <div className="form-group">
              <label>Number of Leads to Harvest</label>
              <input
                type="number"
                min="1"
                max="200"
                className="input-field"
                value={scrapeCount}
                onChange={(e) => setScrapeCount(e.target.value)}
                disabled={job.status === "running"}
                required
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={job.status === "running"}
            >
              {job.status === "running" ? "Scraper Running..." : "Launch Scraper (Headed)"}
            </button>
          </form>

          {/* Active Job Details */}
          {job.status === "running" && (
            <div className="progress-container">
              <div className="progress-label">
                <span>Progress</span>
                <span>{job.progress} / {job.total}</span>
              </div>
              <div className="progress-track">
                <div 
                  className="progress-fill" 
                  style={{ width: `${Math.min(100, Math.round((job.progress / job.total) * 100))}%` }}
                ></div>
              </div>
              
              <div className="console-panel">
                {job.logs.map((log, idx) => (
                  <div key={idx} className="console-log-row">
                    &gt; {log}
                  </div>
                ))}
                <div ref={consoleEndRef}></div>
              </div>
            </div>
          )}

          {job.error && (
            <div style={{ marginTop: "1rem", color: "var(--accent-danger)", fontSize: "0.85rem" }}>
              <strong>Error:</strong> {job.error}
            </div>
          )}
        </section>

        {/* Right Side: Leads Table & Controls */}
        <section className="panel">
          <div className="table-header">
            <h2>Lead Database</h2>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ width: "auto", display: "inline-flex" }}
              onClick={handleDownloadExcel}
              disabled={leads.length === 0}
            >
              📊 Export to Excel (.xlsx)
            </button>
          </div>

          {/* Filter Bar */}
          <div className="table-header" style={{ borderBottom: "none", paddingBottom: 0 }}>
            <div className="table-search-group">
              <input
                type="text"
                placeholder="Search by name, address, or phone..."
                className="input-field"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <select
                className="input-field"
                style={{ width: "160px" }}
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
              >
                <option value="">All Categories</option>
                {uniqueSearchCategories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>

              <select
                className="input-field"
                style={{ width: "160px" }}
                value={filterLocation}
                onChange={(e) => setFilterLocation(e.target.value)}
              >
                <option value="">All Locations</option>
                {uniqueSearchLocations.map(loc => (
                  <option key={loc} value={loc}>{loc}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Leads Table */}
          {loadingLeads ? (
            <p style={{ textAlign: "center", padding: "2rem", color: "var(--text-secondary)" }}>
              Loading lead database...
            </p>
          ) : filteredLeads.length === 0 ? (
            <p style={{ textAlign: "center", padding: "2rem", color: "var(--text-secondary)" }}>
              No leads found matching your criteria. Try launching the scraper above to find some!
            </p>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Priority</th>
                    <th>Business Name</th>
                    <th>Category</th>
                    <th>Phone</th>
                    <th>Website Info</th>
                    <th>Status</th>
                    <th>Location Details</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLeads.map((lead) => (
                    <tr key={lead.id}>
                      <td>
                        <span className={`badge ${lead.priority === "high" ? "badge-high" : "badge-low"}`}>
                          {lead.priority}
                        </span>
                      </td>
                      <td>
                        <strong>{lead.name}</strong>
                      </td>
                      <td>{lead.category || "N/A"}</td>
                      <td>{lead.phone || <span style={{ color: "#475569" }}>None</span>}</td>
                      <td>
                        {lead.website ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                            <a
                              href={lead.website}
                              target="_blank"
                              rel="noreferrer"
                              style={{ color: "var(--accent-primary)", fontSize: "0.85rem", textDecoration: "underline" }}
                            >
                              Visit Site
                            </a>
                            <div style={{ display: "flex", gap: "0.4rem", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                              <span>
                                <span className={`status-dot ${lead.website_resolves === 1 ? "success" : "error"}`}></span>
                                {lead.website_resolves === 1 ? "Resolves" : "Offline"}
                              </span>
                              <span>
                                <span className={`status-dot ${lead.is_https === 1 ? "success" : "neutral"}`}></span>
                                {lead.is_https === 1 ? "HTTPS" : "HTTP"}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <span style={{ color: "#475569" }}>No Website</span>
                        )}
                      </td>
                      <td>
                        <span style={{ fontSize: "0.8rem", color: "#94a3b8" }}>{lead.status || "N/A"}</span>
                      </td>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                          <span style={{ fontSize: "0.8rem" }}>{lead.address}</span>
                          <a
                            href={lead.place_url}
                            target="_blank"
                            rel="noreferrer"
                            style={{ color: "var(--text-secondary)", fontSize: "0.75rem", textDecoration: "underline" }}
                          >
                            Google Maps Link
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

      </div>
    </main>
  );
}
