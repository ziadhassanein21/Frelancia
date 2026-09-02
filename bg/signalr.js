// ==========================================
// bg/signalr.js — SignalR connection management
// Depends on: constants.js (SIGNALR_AVAILABLE), signalr-client.js (signalRClient global)
// ==========================================

const DEFAULT_SIGNALR_URL = 'https://frelancia-hub.runasp.net/jobNotificationHub';

async function initializeSignalR() {
  try {
    if (!SIGNALR_AVAILABLE) {
      console.log('⚠️ SignalR not available. Using polling mode.');
      return;
    }

    if (typeof signalRClient === 'undefined') {
      console.warn('SignalR client not available. Make sure signalr-client.js is loaded.');
      return;
    }

    // Apply custom server URL from settings if set (auto-appends /jobNotificationHub if needed)
    const data = await chrome.storage.local.get(['settings']);
    let customUrl = data.settings?.signalrServerUrl?.trim();
    if (customUrl) {
      if (!customUrl.includes('/jobNotificationHub')) {
        customUrl = customUrl.replace(/\/+$/, '') + '/jobNotificationHub';
      }
    }
    signalRClient.serverUrl = customUrl || DEFAULT_SIGNALR_URL;

    if (signalRClient.isConnected) return;

    console.log('Initializing SignalR connection...');

    signalRClient.onFallbackActivated(() => {
      console.warn('🔄 SignalR fallback activated — polling will handle new jobs.');
    });

    signalRClient.onReconnected(() => {
      console.log('✅ SignalR reconnected — polling fallback deactivated.');
    });

    await signalRClient.connect();
    console.log('SignalR connection established');
  } catch (error) {
    console.error('Error initializing SignalR:', error);
  }
}

async function reconnectSignalR() {
  try {
    if (!SIGNALR_AVAILABLE || typeof signalRClient === 'undefined') return;

    // disconnect() is safe to call even when already disconnected
    await signalRClient.disconnect();
    signalRClient.reconnectAttempts = 0;

    await initializeSignalR();
    console.log('SignalR: Reconnected with new settings.');
  } catch (error) {
    console.error('Error reconnecting SignalR:', error);
  }
}
