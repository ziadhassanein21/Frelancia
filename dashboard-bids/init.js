// ==========================================
// dashboard-bids/init.js — Entry point: data loading & initialization
// Depends on: all other dashboard-bids/* modules
// ==========================================

/**
 * Fetches all bid pages from the API.
 * @returns {Promise<Array<Object>>} All parsed bid objects
 */
async function fetchAllBidPages() {
    const allBids = [];
    const firstPage = await fetchBidTrackerPage(1);
    allBids.push(...processBidTrackerPage(firstPage));

    const totalPages = Math.ceil(firstPage.count / ITEMS_PER_PAGE);

    for (let page = 2; page <= totalPages; page++) {
        try {
            const pageData = await fetchBidTrackerPage(page);
            allBids.push(...processBidTrackerPage(pageData));
        } catch (pageError) {
            console.warn(`Bid tracker: Page ${page} failed:`, pageError.message);
        }
    }

    return allBids;
}

/**
 * Fetches all data and renders the full bid tracker UI.
 */
async function loadBidTrackerData() {
    try {
        const [homepageStats, allBids] = await Promise.all([
            fetchMostaqlHomepageStats(),
            fetchAllBidPages(),
        ]);

        const stats = computeBidTrackerStats(allBids);
        renderBidTrackerSummary(stats, homepageStats);
        renderBidStatusCards(stats.byStatus, stats.total30d);
        renderBidTimeline(stats.bids);
        startBidTrackerCountdowns();
    } catch (error) {
        console.error('Bid tracker load failed:', error);
        showBidErrorState(error.message);
    }
}

/**
 * Initializes the bid tracker on first tab visit.
 * Called lazily when the bids-tracker tab is clicked.
 */
function initBidTracker() {
    if (bidTrackerLoaded) return;
    bidTrackerLoaded = true;
    loadBidTrackerData();
}

/**
 * Reloads all bid tracker data (used by the refresh button).
 */
function refreshBidTracker() {
    bidTrackerLoaded = false;
    clearBidTrackerTimers();
    showBidLoadingState();
    initBidTracker();
}
