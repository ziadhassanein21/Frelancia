// ==========================================
// dashboard-bids/homepage-stats.js — Mostaql homepage bid quota scraping
// ==========================================

/**
 * Scrapes the Mostaql homepage to get available bids, plan usage, and additional bids.
 * @returns {Promise<Object>} - { available, planUsed, planTotal, additional }
 */
async function fetchMostaqlHomepageStats() {
    const defaults = { available: '-', planUsed: '-', planTotal: '-', additional: '-' };

    try {
        const response = await fetch('https://mostaql.com/', {
            credentials: 'include',
            headers: { 'Accept': 'text/html' },
        });
        if (!response.ok) return defaults;

        const html = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        return parseHomepageBidStats(doc, defaults);
    } catch (error) {
        console.warn('Homepage stats fetch failed:', error.message);
        return defaults;
    }
}

/**
 * Parses bid stats from the Mostaql homepage DOM.
 * @param {Document} doc
 * @param {Object} defaults
 * @returns {Object}
 */
function parseHomepageBidStats(doc, defaults) {
    const result = { ...defaults };

    const availableLink = doc.querySelector('a[href*="dashboard/bids"] .text-alpha');
    if (availableLink) {
        result.available = parseInt(availableLink.textContent.trim(), 10) || 0;
    }

    const progressBars = doc.querySelectorAll('.progress__bar');
    progressBars.forEach(bar => {
        const labelEl = bar.querySelector('.pull-right');
        if (!labelEl) return;
        const label = labelEl.textContent.trim();

        if (label.includes('عروض من الخطة')) {
            const valueEl = bar.querySelector('.pull-left span, .pull-left');
            if (valueEl) {
                const parts = valueEl.textContent.trim().split('/');
                if (parts.length === 2) {
                    result.planTotal = parseInt(parts[0].trim(), 10) || 0;
                    result.planUsed = parseInt(parts[1].trim(), 10) || 0;
                }
            }
        }

        if (label.includes('عروض') && label.includes('إضافية')) {
            const valueEl = bar.querySelector('.pull-left');
            if (valueEl) {
                result.additional = parseInt(valueEl.textContent.trim(), 10) || 0;
            }
        }
    });

    return result;
}
