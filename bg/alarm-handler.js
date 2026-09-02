// ==========================================
// bg/alarm-handler.js — Chrome alarms listener
// Depends on: signalr.js, job-checker.js, tracker.js, constants.js
// ==========================================

/* global signalRClient */

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'checkJobs') {
    const data = await chrome.storage.local.get(['settings']);
    const notificationMode = (data.settings || {}).notificationMode || 'auto';

    checkTrackedProjects();

    if (notificationMode === 'polling') {
      console.log('📡 Notification mode: polling — checking for new jobs');
      checkForNewJobs();

    } else if (notificationMode === 'signalr') {
      console.log('📡 Notification mode: signalr — ensuring SignalR connection');
      await initializeSignalR();

    } else {
      // 'auto' mode: Maintain SignalR connection for instant push if active,
      // and run periodic polling check so jobs are never missed if the hub is idle
      await initializeSignalR();
      checkForNewJobs();
    }
  }

  if (alarm.name === 'signalRReconnect') {
    console.log('SignalR: Reconnect alarm fired, attempting to reconnect...');
    const d = await chrome.storage.local.get(['settings']);
    const mode = (d.settings || {}).notificationMode || 'auto';
    if (mode !== 'polling') {
      await initializeSignalR();
    }
  }
});
