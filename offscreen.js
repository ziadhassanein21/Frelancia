// ==========================================
// Offscreen Document - Audio Player
// ==========================================

// Listen for messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log(`Offscreen: Received action: ${message.action}`);

  if (message.action === 'playSound') {
    playNotificationSound().then(() => sendResponse({ success: true }));
    return true;
  } else if (message.action === 'parseJobs') {
    const jobs = parseMostaqlHTML(message.html);
    sendResponse({ success: true, jobs: jobs });
  } else if (message.action === 'parseTrackedData' || message.action === 'parseProjectDetails') {
    const data = parseProjectDetails(message.html);
    sendResponse({ success: true, data: data });
  } else if (message.action === 'playTrackedSound') {
    playTrackedSound().then(() => sendResponse({ success: true }));
    return true;
  }
});

function parseMostaqlHTML(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const jobs = [];
    const seenIds = new Set();

    // Strategy 0: Mostaql project-row layout (Active standard layout on Mostaql)
    const projectRows = doc.querySelectorAll('tr.project-row, tr[class*="project"]');
    projectRows.forEach(row => {
        const link = row.querySelector('h2 a, a[href*="/project/"]');
        if (!link) return;
        const href = link.getAttribute('href') || '';
        const idMatch = href.match(/\/project\/(\d+)/);
        if (!idMatch) return;
        const id = idMatch[1];
        if (seenIds.has(id)) return;
        seenIds.add(id);

        const title = link.textContent.trim();
        const url = href.startsWith('http') ? href : 'https://mostaql.com' + href;

        // Client/poster name
        const userIcon = row.querySelector('.fa-user');
        const posterBdi = row.querySelector('.project__meta bdi');
        let poster = '';
        if (posterBdi) {
            poster = posterBdi.textContent.trim();
        } else if (userIcon && userIcon.parentElement) {
            poster = userIcon.parentElement.textContent.replace(/\s+/g, ' ').trim();
        }

        // Time ago
        const timeEl = row.querySelector('time');
        const time = timeEl ? timeEl.textContent.replace(/\s+/g, ' ').trim() : '';
        const postedAt = timeEl ? (timeEl.getAttribute('datetime') || '') : '';

        // Bids count
        const bidsEl = row.querySelector('.hsoub-file-signature-icon') || row.querySelector('.fa-ticket');
        let bidsText = '';
        if (bidsEl && bidsEl.parentElement) {
            bidsText = bidsEl.parentElement.textContent.replace(/\s+/g, ' ').trim();
        } else {
            const metaItems = row.querySelectorAll('.project__meta li');
            bidsText = metaItems.length >= 3 ? metaItems[2].textContent.replace(/\s+/g, ' ').trim() : '';
        }

        // Brief description
        const briefEl = row.querySelector('.project__brief, p[class*="brief"], .text-wrapper-div');
        const description = briefEl ? briefEl.textContent.replace(/\s+/g, ' ').trim() : '';

        jobs.push({ id, title, url, poster, time, postedAt, bidsText, description, budget: 'غير محدد' });
    });

    // Strategy 1: Mostaql list-group-item layout (Alternative dashboard layout)
    if (jobs.length === 0) {
        const listItems = doc.querySelectorAll('.list-group-item');
        listItems.forEach(item => {
            const link = item.querySelector('a[href*="/project/"]');
            if (!link) return;
            const href = link.getAttribute('href') || '';
            const idMatch = href.match(/\/project\/(\d+)/);
            if (!idMatch) return;
            const id = idMatch[1];
            if (seenIds.has(id)) return;
            seenIds.add(id);

            const title = link.textContent.trim();
            const url = href.startsWith('http') ? href : 'https://mostaql.com' + href;

            const userIcon = item.querySelector('.fa-user');
            const poster = userIcon ? userIcon.parentElement.textContent.replace(/\s+/g, ' ').trim() : '';

            const timeEl = item.querySelector('time');
            const time = timeEl ? timeEl.textContent.replace(/\s+/g, ' ').trim() : '';
            const postedAt = timeEl ? (timeEl.getAttribute('datetime') || '') : '';

            const metaItems = item.querySelectorAll('.project__meta li');
            const bidsText = metaItems.length >= 3 ? metaItems[2].textContent.replace(/\s+/g, ' ').trim() : '';

            const briefEl = item.querySelector('.project__brief, p');
            const description = briefEl ? briefEl.textContent.replace(/\s+/g, ' ').trim() : '';

            jobs.push({ id, title, url, poster, time, postedAt, bidsText, description, budget: 'غير محدد' });
        });
    }

    // Strategy 2: Generic Table Rows
    if (jobs.length === 0) {
        const rows = doc.querySelectorAll('tr');
        rows.forEach(row => {
            const link = row.querySelector('a[href*="/project/"]');
            if (link) {
                const href = link.getAttribute('href') || '';
                const idMatch = href.match(/\/project\/(\d+)/);
                if (idMatch) {
                    const id = idMatch[1];
                    if (!seenIds.has(id)) {
                        const title = link.textContent.trim();
                        const budgetEl = row.querySelector('td:nth-child(4), [class*="budget"]');
                        const budget = budgetEl ? budgetEl.textContent.trim() : 'غير محدد';
                        const timeEl = row.querySelector('time, td:nth-child(5n), .timeSince, [class*="date"]');
                        const time = timeEl ? timeEl.textContent.trim() : '';
                        const postedAt = timeEl ? (timeEl.getAttribute('datetime') || '') : '';
                        seenIds.add(id);
                        jobs.push({ id, title, budget, time, postedAt, poster: '', bidsText: '', description: '',
                            url: href.startsWith('http') ? href : 'https://mostaql.com' + href });
                    }
                }
            }
        });
    }
    
    // Strategy 3: Cards (Grid View)
    if (jobs.length === 0) {
        const cards = doc.querySelectorAll('.card, .project-card, div[class*="project"]');
        cards.forEach(card => {
            const link = card.querySelector('a[href*="/project/"]');
            if (link) {
                const href = link.getAttribute('href') || '';
                const idMatch = href.match(/\/project\/(\d+)/);
                if (idMatch) {
                    const id = idMatch[1];
                    if (!seenIds.has(id)) {
                        seenIds.add(id);
                        const timeEl = card.querySelector('time, .timeSince, [class*="date"]');
                        jobs.push({ id, title: link.textContent.trim(), budget: 'غير محدد',
                            time: timeEl ? timeEl.textContent.trim() : '', postedAt: timeEl?.getAttribute('datetime') || '', poster: '', bidsText: '', description: '',
                            url: href.startsWith('http') ? href : 'https://mostaql.com' + href });
                    }
                }
            }
        });
    }

    // Strategy 4: Fallback - All Links
    if (jobs.length === 0) {
        const allLinks = doc.querySelectorAll('a[href*="/project/"]');
        allLinks.forEach(link => {
            const href = link.getAttribute('href') || '';
            const idMatch = href.match(/\/project\/(\d+)/);
            if (idMatch) {
                const id = idMatch[1];
                const text = link.innerText.trim();
                if (!seenIds.has(id) && text.length > 5 && !href.includes('/create')) {
                    seenIds.add(id);
                    jobs.push({ id, title: text, budget: 'غير محدد', postedAt: '', poster: '', bidsText: '', description: '',
                        url: href.startsWith('http') ? href : 'https://mostaql.com' + href });
                }
            }
        });
    }

    return jobs;
}

function parseProjectDetails(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Extract Status
    const statusLabel = doc.querySelector('.label-prj-open, .label-prj-closed, .label-prj-completed, .label-prj-cancelled, .label-prj-underway, .label-prj-processing');
    const status = statusLabel ? statusLabel.textContent.trim() : 'غير معروف';

    // Extract Description: supports carda__content, text-wrapper-div, and legacy project-post__body
    const descriptionEl = doc.querySelector('.carda__content, .project-post__body, .text-wrapper-div');
    const description = descriptionEl ? descriptionEl.textContent.replace(/\s+/g, ' ').trim() : '';

    // Extract Metadata
    let communications = '0';
    let hiringRate = '';
    let duration = 'غير محددة';
    let budget = '';
    let registrationDate = '';
    
    const metaRows = doc.querySelectorAll('.meta-row, .table-meta tr');
    metaRows.forEach(row => {
        const text = row.textContent;
        const val = row.querySelector('.meta-value, td:last-child');
        if (!val) return;

        if (text.includes('التواصلات الجارية') || text.includes('التواصلات')) {
            communications = val.textContent.trim();
        } else if (text.includes('معدل التوظيف')) {
            hiringRate = val.textContent.trim();
        } else if (text.includes('مدة التنفيذ')) {
            duration = val.textContent.trim();
        } else if (text.includes('الميزانية')) {
            budget = val.textContent.trim();
        } else if (text.includes('تاريخ التسجيل')) {
            registrationDate = val.textContent.trim();
        }
    });

    return { status, communications, hiringRate, description, duration, budget, registrationDate };
}

async function playNotificationSound() {
  try {
    const audioEl = document.getElementById('notificationSound');
    if (audioEl) {
      audioEl.currentTime = 0;
      await audioEl.play();
    } else {
      await playBeep();
    }
  } catch (err) {
    console.error('Audio file playback failed, falling back to beep:', err);
    await playBeep();
  }
}

// Create a notification sound using Web Audio API (as fallback)
async function playBeep() {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    // Basic notification: two beeps (low then high)
    playTone(audioContext, 800, 0, 0.15);
    playTone(audioContext, 1000, 0.2, 0.15);

  } catch (error) {
    console.error('Error playing beep:', error);
  }
}

async function playTrackedSound() {
  try {
    const audioEl = document.getElementById('notificationSound');
    if (audioEl) {
      audioEl.currentTime = 0;
      await audioEl.play();
    } else {
      await fallbackPlayTrackedSound();
    }
  } catch (err) {
    console.error('Error playing tracked sound:', err);
    await fallbackPlayTrackedSound();
  }
}

async function fallbackPlayTrackedSound() {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    // Tracked update: 三 sequence of beeps (high-high-low) or distinct pattern
    playTone(audioContext, 1200, 0, 0.1);
    playTone(audioContext, 1200, 0.15, 0.1);
    playTone(audioContext, 1500, 0.3, 0.2);

  } catch (error) {
    console.error('Error playing tracked sound:', error);
  }
}

function playTone(audioContext, frequency, startTime, duration) {
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  
  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  
  oscillator.frequency.value = frequency;
  oscillator.type = 'sine';
  
  const now = audioContext.currentTime;
  gainNode.gain.setValueAtTime(0.3, now + startTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, now + startTime + duration);
  
  oscillator.start(now + startTime);
  oscillator.stop(now + startTime + duration);
}