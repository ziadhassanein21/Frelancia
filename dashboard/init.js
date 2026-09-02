// ==========================================
// dashboard/init.js — Entry point: data loading & DOMContentLoaded
// Depends on: all other dashboard/* modules
// ==========================================

function loadData() {
    chrome.storage.local.get(['settings', 'stats', 'prompts', 'proposalTemplate', 'seenJobs'], (data) => {
        // Overview stats
        if (data.stats) {
            const todayCount = parseInt(data.stats.todayCount);
            const el = document.getElementById('stat-today');
            if (el) el.textContent = isNaN(todayCount) ? 0 : todayCount;

            const lastTime = data.stats.lastCheck
                ? new Date(data.stats.lastCheck).toLocaleTimeString('ar-EG')
                : '-';
            const lastEl = document.getElementById('stat-last-time');
            if (lastEl) lastEl.textContent = lastTime;
        }

        if (data.seenJobs) {
            const totalEl = document.getElementById('stat-total');
            if (totalEl) totalEl.textContent = Array.isArray(data.seenJobs) ? data.seenJobs.length : 0;
        }

        // Tracked (watched) projects panel
        chrome.storage.local.get(['trackedProjects'], (td) => {
            const tracked = td.trackedProjects || {};
            const trackedList = Object.values(tracked)
                .sort((a, b) => (b.lastChecked || '').localeCompare(a.lastChecked || ''));
            renderTrackedProjects(trackedList);
        });

        // Populate settings form
        applySettingsToForm(data.settings || {});

        // Proposal template
        const proposalEl = document.getElementById('proposalTemplate');
        if (proposalEl) proposalEl.value = data.proposalTemplate || '';

        // Prompts list
        renderPrompts(data.prompts || []);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    loadData();
    loadConnectionStatus();
    setupEventListeners();
});
