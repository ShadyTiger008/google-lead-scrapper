const ExcelJS = require('exceljs');
const path = require('path');

/**
 * Exports a list of leads to an Excel spreadsheet.
 * Includes styling and highlighting for high priority leads.
 * @param {Array} leads 
 * @param {string} outputPath 
 * @returns {Promise<string>} Absolute output path
 */
async function exportToExcel(leads, outputPath) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Leads');

  worksheet.columns = [
    { header: 'Priority', key: 'priority', width: 12 },
    { header: 'Business Name', key: 'name', width: 30 },
    { header: 'Category', key: 'category', width: 22 },
    { header: 'Phone', key: 'phone', width: 18 },
    { header: 'Website', key: 'website', width: 35 },
    { header: 'Has Website?', key: 'has_website', width: 15 },
    { header: 'Website Resolves?', key: 'website_resolves', width: 18 },
    { header: 'Is HTTPS?', key: 'is_https', width: 12 },
    { header: 'Address', key: 'address', width: 45 },
    { header: 'Rating', key: 'rating', width: 10 },
    { header: 'Review Count', key: 'review_count', width: 14 },
    { header: 'Hours Status', key: 'status', width: 25 },
    { header: 'Google Maps URL', key: 'place_url', width: 40 },
    { header: 'Search Category', key: 'search_category', width: 18 },
    { header: 'Search Location', key: 'search_location', width: 18 },
    { header: 'Scraped At', key: 'scraped_at', width: 22 }
  ];

  // Style header row (Dark Premium Blue background, bold white text)
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  headerRow.height = 25;
  
  for (let i = 1; i <= worksheet.columns.length; i++) {
    const cell = headerRow.getCell(i);
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1F4E78' } // Premium slate blue
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  }

  // Add data rows
  leads.forEach((lead) => {
    const row = worksheet.addRow({
      priority: lead.priority ? lead.priority.toUpperCase() : 'LOW',
      name: lead.name,
      category: lead.category,
      phone: lead.phone,
      website: lead.website || '',
      has_website: lead.has_website === 1 ? 'Yes' : 'No',
      website_resolves: lead.website_resolves === 1 ? 'Yes' : (lead.website_resolves === 0 ? 'No' : 'N/A'),
      is_https: lead.is_https === 1 ? 'Yes' : (lead.is_https === 0 ? 'No' : 'N/A'),
      address: lead.address,
      rating: lead.rating,
      review_count: lead.review_count,
      status: lead.status,
      place_url: lead.place_url,
      search_category: lead.search_category,
      search_location: lead.search_location,
      scraped_at: lead.scraped_at
    });

    row.height = 20;

    // Center alignment for code/status/date fields
    row.getCell('priority').alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell('phone').alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell('has_website').alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell('website_resolves').alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell('is_https').alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell('rating').alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell('review_count').alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell('scraped_at').alignment = { horizontal: 'center', vertical: 'middle' };

    // Highlight Priority column cell
    const priorityCell = row.getCell('priority');
    if (lead.priority === 'high') {
      // Light red highlight for high priority leads
      priorityCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF2DCDB' }
      };
      priorityCell.font = { bold: true, color: { argb: 'FFC00000' } };
    } else {
      // Light green highlight for low priority leads
      priorityCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE2EFDA' }
      };
      priorityCell.font = { bold: true, color: { argb: 'FF375623' } };
    }
  });

  // Enable auto-filtering across the entire sheet
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: worksheet.columns.length }
  };

  const absolutePath = path.resolve(outputPath);
  await workbook.xlsx.writeFile(absolutePath);
  return absolutePath;
}

module.exports = {
  exportToExcel
};
