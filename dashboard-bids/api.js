// ==========================================
// dashboard-bids/api.js — Mostaql bids API layer
// Depends on: constants.js (ITEMS_PER_PAGE)
// ==========================================

/**
 * Fetches a single page of bids from Mostaql API.
 * @param {number} pageNumber
 * @returns {Promise<Object>} JSON response with collection and count
 */
async function fetchBidTrackerPage(pageNumber) {
    const url = `https://mostaql.com/dashboard/bids?page=${pageNumber}&sort=latest`;

    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'Accept': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'include',
    });

    if (!response.ok) {
        throw new Error(`Bid page ${pageNumber} request failed: ${response.status}`);
    }

    return response.json();
}

/**
 * Extracts structured data from a rendered bid HTML row.
 * @param {string} renderedHtml
 * @returns {Object|null}
 */
function extractBidTrackerRow(renderedHtml) {
    if (typeof renderedHtml !== 'string') return null;

    const template = document.createElement('template');
    template.innerHTML = renderedHtml.trim();
    const row = template.content.querySelector('tr.bid-row');
    if (!row) return null;

    const titleLink = row.querySelector('h2 a');
    const statusEl = row.querySelector('.label-prj-pending, .label');
    const timeEl = row.querySelector('time[datetime]');
    const priceEl = row.querySelector('.project__meta li .fa-money')
        ?.closest('li')?.querySelector('span');
    const rawUrl = titleLink?.getAttribute('href') || '';
    const url = rawUrl.split('-')[0];

    return {
        title: titleLink?.textContent?.trim() || null,
        url,
        status: statusEl?.textContent?.trim() || null,
        publishedDatetime: timeEl?.getAttribute('datetime') || null,
        price: priceEl?.textContent?.trim() || null,
    };
}

/**
 * Processes raw API page data into an array of bid objects.
 * @param {Object} pageData
 * @returns {Array<Object>}
 */
function processBidTrackerPage(pageData) {
    const bids = [];
    if (!pageData.collection || !Array.isArray(pageData.collection)) return bids;

    pageData.collection.forEach((bidObject) => {
        const htmlString = bidObject.rendered || bidObject;
        const item = extractBidTrackerRow(htmlString);
        if (item) {
            item.apiBidId = bidObject.id || null;
            bids.push(item);
        }
    });

    return bids;
}
