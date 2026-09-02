// ==========================================
// dashboard/connection.js — SignalR / polling connection status
// ==========================================

function loadConnectionStatus() {
    chrome.storage.local.get(['signalRConnected', 'signalRFallbackActive', 'settings'], (data) => {
        const statusEl = document.getElementById('stat-connection');
        const iconEl = document.getElementById('connection-status-icon');
        if (!statusEl || !iconEl) return;

        const mode = (data.settings || {}).notificationMode || 'auto';

        if (mode === 'polling') {
            statusEl.textContent = 'استعلام دوري';
            iconEl.className = 'stat-icon blue';
            iconEl.innerHTML = '<i class="fas fa-sync-alt"></i>';
        } else if (data.signalRConnected) {
            statusEl.textContent = 'اتصال مباشر';
            iconEl.className = 'stat-icon green';
            iconEl.innerHTML = '<i class="fas fa-wifi"></i>';
        } else if (data.signalRFallbackActive) {
            statusEl.textContent = 'وضع الاستعلام';
            iconEl.className = 'stat-icon orange';
            iconEl.innerHTML = '<i class="fas fa-sync-alt"></i>';
        } else {
            statusEl.textContent = 'غير متصل';
            iconEl.className = 'stat-icon purple';
            iconEl.innerHTML = '<i class="fas fa-plug"></i>';
        }
    });
}
