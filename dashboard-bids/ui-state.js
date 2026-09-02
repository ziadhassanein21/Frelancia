// ==========================================
// dashboard-bids/ui-state.js — Loading, error, and reset UI helpers
// ==========================================

/**
 * Shows a loading spinner inside the timeline container.
 */
function showBidLoadingState() {
    const container = document.getElementById('bidsTimelineList');
    if (!container) return;

    container.innerHTML = `
        <div class="bids-loading">
            <i class="fas fa-spinner fa-spin"></i>
            <p>جاري تحميل بيانات العروض...</p>
        </div>
    `;

    resetBidSummaryCards();

    const statusGrid = document.getElementById('bidsStatusGrid');
    if (statusGrid) statusGrid.innerHTML = '';
}

/**
 * Shows an error message inside the timeline container.
 * @param {string} message - Error details
 */
function showBidErrorState(message) {
    const container = document.getElementById('bidsTimelineList');
    if (!container) return;

    container.innerHTML = `
        <div class="bids-error">
            <i class="fas fa-exclamation-triangle"></i>
            <p>تعذر تحميل بيانات العروض</p>
            <span>${message}</span>
            <button class="btn-secondary" onclick="refreshBidTracker()" style="margin-top: 16px;">
                <i class="fas fa-redo"></i> إعادة المحاولة
            </button>
        </div>
    `;
}

/**
 * Resets all summary stat card values to the loading placeholder.
 */
function resetBidSummaryCards() {
    ['bids-total-30d', 'bids-available-slots', 'bids-plan-usage',
     'bids-additional', 'bids-next-available', 'bids-today-count']
        .forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = '-';
        });
}
