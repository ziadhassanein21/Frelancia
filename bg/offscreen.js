// ==========================================
// bg/offscreen.js — Offscreen document bridge
// ==========================================

async function setupOffscreenDocument() {
  try {
    const existing = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT']
    });

    if (existing.length === 0) {
      await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['AUDIO_PLAYBACK', 'DOM_PARSER'],
        justification: 'Parsing HTML and Playing Audio'
      });
    }
  } catch (e) {
    // Ignore error if document already exists or is being created
    if (!e.message?.includes('Only a single offscreen document')) {
      console.warn('Offscreen setup notice:', e.message);
    }
  }
}

async function parseJobsOffscreen(html) {
  try {
    await setupOffscreenDocument();
    await new Promise(r => setTimeout(r, 100));

    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'parseJobs', html: html }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Parse Error:', chrome.runtime.lastError);
          resolve([]);
        } else if (response && response.success) {
          resolve(response.jobs);
        } else {
          resolve([]);
        }
      });
      setTimeout(() => resolve([]), 3000);
    });
  } catch (e) {
    console.error('Offscreen Parse Error:', e);
    return [];
  }
}

async function parseTrackedDataOffscreen(html) {
  try {
    await setupOffscreenDocument();
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'parseTrackedData', html: html }, (response) => {
        if (response && response.success) {
          resolve(response.data);
        } else {
          resolve(null);
        }
      });
      setTimeout(() => resolve(null), 3000);
    });
  } catch (e) {
    return null;
  }
}
