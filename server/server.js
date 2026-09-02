// ==========================================================
// Frelancia Live Hub & Mostaql Real-Time Scraper Server
// 24/7 Active Service Worker for Chrome/Brave Extension
// ==========================================================

const express = require('express');
const http = require('http');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);

// Configuration
const PORT = process.env.PORT || 3000;
const SCRAPE_INTERVAL_MS = parseInt(process.env.SCRAPE_INTERVAL_MS, 10) || 15000; // 15 seconds
const RECORD_SEPARATOR = String.fromCharCode(0x1e); // SignalR JSON record separator

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// State
const state = {
  activeWsClients: new Set(),
  activeSseClients: new Set(),
  seenJobIds: new Set(),
  recentJobs: [],
  isFirstScrape: true,
  stats: {
    startTime: new Date().toISOString(),
    lastScrapeTime: null,
    totalScrapes: 0,
    totalNewJobsDetected: 0,
    errorsCount: 0,
    lastError: null
  }
};

// ==========================================================
// 1. SignalR Negotiation Endpoints
// ==========================================================

function handleNegotiate(req, res) {
  const connectionId = crypto.randomBytes(16).toString('hex');
  const connectionToken = crypto.randomBytes(16).toString('hex');

  // Support negotiate protocol versions 0 and 1
  res.json({
    negotiateVersion: 1,
    connectionId: connectionId,
    connectionToken: connectionToken,
    availableTransports: [
      { transport: 'WebSockets', transferFormats: ['Text'] },
      { transport: 'ServerSentEvents', transferFormats: ['Text'] }
    ]
  });
}

app.post('/jobNotificationHub/negotiate', handleNegotiate);
app.post('/negotiate', handleNegotiate);

// ==========================================================
// 2. Server-Sent Events (SSE) Fallback
// ==========================================================

app.get(['/jobNotificationHub', '/sse'], (req, res, next) => {
  const accept = req.headers.accept || '';
  if (!accept.includes('text/event-stream')) {
    return next();
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders?.();

  // SignalR Handshake response
  res.write(`{}${RECORD_SEPARATOR}`);

  // Send Connected event
  const connectedMsg = JSON.stringify({
    type: 1,
    target: 'Connected',
    arguments: [{ status: 'connected', transport: 'SSE', time: new Date().toISOString() }]
  });
  res.write(`data: ${connectedMsg}${RECORD_SEPARATOR}\n\n`);

  state.activeSseClients.add(res);
  console.log(`[SSE] Client connected. Total SSE clients: ${state.activeSseClients.size}`);

  req.on('close', () => {
    state.activeSseClients.delete(res);
    console.log(`[SSE] Client disconnected. Total SSE clients: ${state.activeSseClients.size}`);
  });
});

// ==========================================================
// 3. SignalR WebSocket Server
// ==========================================================

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;

  if (pathname.includes('/jobNotificationHub') || pathname === '/ws' || pathname === '/') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

wss.on('connection', (ws, req) => {
  state.activeWsClients.add(ws);
  console.log(`[WS] Extension connected. Total WS clients: ${state.activeWsClients.size}`);

  let isHandshakeComplete = false;

  // Keep-alive ping interval (every 15s)
  const pingInterval = setInterval(() => {
    if (ws.readyState === ws.OPEN) {
      ws.send(`{"type":6}${RECORD_SEPARATOR}`);
    }
  }, 15000);

  ws.on('message', (raw) => {
    const text = raw.toString();

    // SignalR Handshake
    if (!isHandshakeComplete) {
      if (text.includes('protocol') && text.includes('json')) {
        isHandshakeComplete = true;
        // Handshake ack
        ws.send(`{}${RECORD_SEPARATOR}`);

        // Notify client of successful connection
        const connectedMsg = JSON.stringify({
          type: 1,
          target: 'Connected',
          arguments: [{
            status: 'connected',
            server: 'Frelancia Live Hub',
            cachedJobs: state.recentJobs.length,
            time: new Date().toISOString()
          }]
        });
        ws.send(`${connectedMsg}${RECORD_SEPARATOR}`);
        return;
      }
    }

    // Ping or Hub Invocation
    const messages = text.split(RECORD_SEPARATOR).filter(Boolean);
    for (const msgStr of messages) {
      try {
        const msg = JSON.parse(msgStr);
        // Type 6 is Ping
        if (msg.type === 6) {
          ws.send(`{"type":6}${RECORD_SEPARATOR}`);
        } else if (msg.type === 1 && msg.target === 'Ping') {
          ws.send(`{"type":3,"invocationId":"${msg.invocationId || ''}","result":"Pong"}${RECORD_SEPARATOR}`);
        }
      } catch (e) {
        // Ignore malformed sub-messages
      }
    }
  });

  ws.on('close', () => {
    clearInterval(pingInterval);
    state.activeWsClients.delete(ws);
    console.log(`[WS] Extension disconnected. Total WS clients: ${state.activeWsClients.size}`);
  });

  ws.on('error', (err) => {
    console.warn('[WS] Socket error:', err.message);
    clearInterval(pingInterval);
    state.activeWsClients.delete(ws);
  });
});

// Broadcast helper for both WebSockets and SSE clients
function broadcastNewJobs(jobs) {
  if (!jobs || jobs.length === 0) return;

  const payload = { jobs: jobs };
  const signalRMsg = JSON.stringify({
    type: 1,
    target: 'NewJobsDetected',
    arguments: [payload]
  });
  const wsFrame = `${signalRMsg}${RECORD_SEPARATOR}`;
  const sseFrame = `data: ${signalRMsg}${RECORD_SEPARATOR}\n\n`;

  let wsSent = 0;
  for (const client of state.activeWsClients) {
    if (client.readyState === client.OPEN) {
      client.send(wsFrame);
      wsSent++;
    }
  }

  let sseSent = 0;
  for (const res of state.activeSseClients) {
    try {
      res.write(sseFrame);
      sseSent++;
    } catch (e) {
      state.activeSseClients.delete(res);
    }
  }

  console.log(`[BROADCAST] Sent ${jobs.length} new job(s) to ${wsSent} WS clients and ${sseSent} SSE clients.`);
}

// ==========================================================
// 4. Mostaql Real-Time Scraper Engine
// ==========================================================

function parseJobsFromHtml(html) {
  const jobs = [];
  const seenInBatch = new Set();
  const rowRegex = /<tr[^>]*class="[^"]*project-row[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi;
  let match;

  while ((match = rowRegex.exec(html)) !== null) {
    const rowHtml = match[1];

    const linkMatch = rowHtml.match(/<h2[^>]*>[\s\S]*?<a\s+href="([^"]*\/project\/(\d+)[^"]*)"[^>]*>([\s\S]*?)<\/a>/i) ||
                      rowHtml.match(/<a\s+href="([^"]*\/project\/(\d+)[^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!linkMatch) continue;

    const rawUrl = linkMatch[1];
    const id = linkMatch[2];
    if (seenInBatch.has(id)) continue;
    seenInBatch.add(id);

    const url = rawUrl.startsWith('http') ? rawUrl : 'https://mostaql.com' + rawUrl;
    const title = linkMatch[3].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

    const posterMatch = rowHtml.match(/<i class="fa fa-user"><\/i>[\s\S]*?<bdi>([\s\S]*?)<\/bdi>/i) ||
                        rowHtml.match(/<bdi>([\s\S]*?)<\/bdi>/i) ||
                        rowHtml.match(/<i class="fa fa-user"><\/i>([\s\S]*?)<\/li>/i);
    const poster = posterMatch ? posterMatch[1].replace(/<[^>]*>/g, '').trim() : '';

    const timeMatch = rowHtml.match(/<time\s+datetime="([^"]*)"[^>]*>([\s\S]*?)<\/time>/i);
    const postedAt = timeMatch ? timeMatch[1].trim() : '';
    const time = timeMatch ? timeMatch[2].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() : '';

    const bidsMatch = rowHtml.match(/<span class="hsoub-file-signature-icon"><\/span>([\s\S]*?)<\/li>/i) ||
                      rowHtml.match(/<i class="fa fa-ticket"><\/i>([\s\S]*?)<\/li>/i);
    const bidsText = bidsMatch ? bidsMatch[1].replace(/<[^>]*>/g, '').trim() : '';

    const briefMatch = rowHtml.match(/<p[^>]*class="[^"]*project__brief[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
    const description = briefMatch ? briefMatch[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() : '';

    jobs.push({
      id,
      title,
      url,
      poster,
      time,
      postedAt,
      bidsText,
      description,
      budget: 'غير محدد'
    });
  }

  // Fallback for links if layout changed
  if (jobs.length === 0) {
    const linkRegex = /<a\s+[^>]*href="([^"]*\/project\/(\d+)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    while ((match = linkRegex.exec(html)) !== null) {
      const href = match[1];
      const id = match[2];
      if (seenInBatch.has(id) || href.includes('/create') || href.includes('template=')) continue;
      const text = match[3].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
      if (text.length > 5) {
        seenInBatch.add(id);
        const url = href.startsWith('http') ? href : 'https://mostaql.com' + href;
        jobs.push({ id, title: text, url, poster: '', time: '', postedAt: '', bidsText: '', description: '', budget: 'غير محدد' });
      }
    }
  }

  return jobs;
}

async function scrapeMostaql() {
  const timestamp = new Date().toLocaleTimeString('ar-EG');
  state.stats.totalScrapes++;
  state.stats.lastScrapeTime = new Date().toISOString();

  try {
    const url = 'https://mostaql.com/projects?sort=latest&_t=' + Date.now();
    const res = await fetch(url, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'ar,en;q=0.9',
        'Cache-Control': 'no-cache',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      }
    });

    if (!res.ok) {
      throw new Error(`HTTP Error ${res.status} ${res.statusText}`);
    }

    const html = await res.text();
    const parsedJobs = parseJobsFromHtml(html);

    if (state.isFirstScrape) {
      // Seed existing projects on startup
      state.isFirstScrape = false;
      parsedJobs.forEach(job => {
        state.seenJobIds.add(job.id);
      });
      state.recentJobs = parsedJobs.slice(0, 50);
      console.log(`[BOOTSTRAP ${timestamp}] Seeded ${parsedJobs.length} existing Mostaql projects. Monitoring for new posts...`);
      return;
    }

    // Detect truly new jobs
    const newJobs = [];
    for (const job of parsedJobs) {
      if (!state.seenJobIds.has(job.id)) {
        state.seenJobIds.add(job.id);
        newJobs.push(job);
      }
    }

    if (newJobs.length > 0) {
      state.stats.totalNewJobsDetected += newJobs.length;
      console.log(`\n========================================`);
      console.log(`🔥 [NEW JOBS DETECTED at ${timestamp}] Found ${newJobs.length} new project(s)!`);
      newJobs.forEach(j => console.log(` - [${j.id}] ${j.title} (${j.poster || 'مجهول'})`));
      console.log(`========================================\n`);

      // Update recent jobs cache
      state.recentJobs = [...newJobs, ...state.recentJobs].slice(0, 50);

      // Broadcast immediately to all connected extensions
      broadcastNewJobs(newJobs);
    } else {
      process.stdout.write(`[CHECK ${timestamp}] 0 new jobs (${state.activeWsClients.size} extensions connected)\r`);
    }

    // Clean up seen IDs set if too large
    if (state.seenJobIds.size > 2000) {
      const arr = Array.from(state.seenJobIds).slice(-1000);
      state.seenJobIds = new Set(arr);
    }

  } catch (err) {
    state.stats.errorsCount++;
    state.stats.lastError = err.message;
    console.error(`[ERROR ${timestamp}] Scraping failed:`, err.message);
  }
}

// Start continuous scraper loop
function startScraper() {
  scrapeMostaql();
  setInterval(scrapeMostaql, SCRAPE_INTERVAL_MS);
  console.log(`[SCRAPER] Engine started with ${SCRAPE_INTERVAL_MS / 1000}s check interval.`);
}

// ==========================================================
// 5. Status Page & REST APIs
// ==========================================================

app.get('/', (req, res) => {
  const host = req.get('host');
  const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
  const hubUrl = `${protocol}://${host}/jobNotificationHub`;

  const jobsHtml = state.recentJobs.slice(0, 10).map(j => `
    <div style="background: rgba(255,255,255,0.05); padding: 12px 16px; border-radius: 8px; margin-bottom: 10px; border-right: 4px solid #2563eb;">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <strong style="color: #60a5fa; font-size: 15px;"><a href="${j.url}" target="_blank" style="color: #60a5fa; text-decoration: none;">${j.title}</a></strong>
        <span style="font-size: 12px; color: #94a3b8;">${j.time || 'الآن'}</span>
      </div>
      <div style="font-size: 13px; color: #cbd5e1; margin-top: 6px;">${j.description ? j.description.substring(0, 140) + '...' : 'بدون وصف'}</div>
      <div style="font-size: 12px; color: #64748b; margin-top: 4px;">الناشر: ${j.poster || 'غير محدد'} | العروض: ${j.bidsText || '0'}</div>
    </div>
  `).join('');

  res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Frelancia Live Hub | سيرفر التنبيهات المباشرة</title>
      <style>
        body { font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 24px; line-height: 1.6; }
        .container { max-width: 800px; margin: 0 auto; }
        .badge { background: #10b981; color: #fff; padding: 4px 10px; border-radius: 9999px; font-size: 12px; font-weight: bold; }
        .card { background: #1e293b; border-radius: 12px; padding: 20px; margin-bottom: 20px; border: 1px solid rgba(255,255,255,0.08); }
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-top: 14px; }
        .stat-box { background: rgba(255,255,255,0.03); padding: 14px; border-radius: 8px; text-align: center; }
        .stat-num { font-size: 26px; font-weight: bold; color: #38bdf8; }
        .stat-label { font-size: 13px; color: #94a3b8; }
        .copy-box { background: #0f172a; padding: 12px; border-radius: 6px; font-family: monospace; font-size: 14px; color: #38bdf8; display: flex; justify-content: space-between; align-items: center; border: 1px solid #334155; }
        button { background: #2563eb; color: white; border: none; padding: 8px 14px; border-radius: 6px; cursor: pointer; font-weight: 500; }
        button:hover { background: #1d4ed8; }
      </style>
    </head>
    <body>
      <div class="container">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 16px;">
          <h1 style="margin:0; font-size: 24px;">🔔 Frelancia Live Hub</h1>
          <span class="badge">متصل ويعمل 24/7 🟢</span>
        </div>

        <div class="card">
          <h3 style="margin-top:0;">📡 رابط السيرفر لإضافة المتصفح:</h3>
          <p style="font-size:14px; color:#94a3b8;">انسخ هذا الرابط وضعه في إعدادات الإضافة (رابط سيرفر SignalR المخصص):</p>
          <div class="copy-box">
            <span id="hubUrlText">${hubUrl}</span>
            <button onclick="navigator.clipboard.writeText(document.getElementById('hubUrlText').innerText); alert('تم نسخ الرابط!')">نسخ الرابط</button>
          </div>
        </div>

        <div class="card">
          <h3 style="margin-top:0;">📊 إحصائيات السيرفر:</h3>
          <div class="stats-grid">
            <div class="stat-box">
              <div class="stat-num">${state.activeWsClients.size + state.activeSseClients.size}</div>
              <div class="stat-label">المتصفحات المتصلة الآن</div>
            </div>
            <div class="stat-box">
              <div class="stat-num">${state.stats.totalNewJobsDetected}</div>
              <div class="stat-label">مشاريع رُصدت وبُثت</div>
            </div>
            <div class="stat-box">
              <div class="stat-num">${SCRAPE_INTERVAL_MS / 1000} ثانية</div>
              <div class="stat-label">معدل الفحص المباشر</div>
            </div>
            <div class="stat-box">
              <div class="stat-num">${state.stats.totalScrapes}</div>
              <div class="stat-label">إجمالي عمليات الفحص</div>
            </div>
          </div>
        </div>

        <div class="card">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 12px;">
            <h3 style="margin:0;">📋 آخر المشاريع المرصودة:</h3>
            <button onclick="fetch('/api/test-broadcast', {method:'POST'}).then(r=>r.json()).then(d=>alert('تم إرسال إشعار تجريبي للمتصفح!'))">إرسال إشعار تجريبي</button>
          </div>
          ${jobsHtml || '<p style="color:#64748b; text-align:center;">جاري جمع المشاريع...</p>'}
        </div>
      </div>
    </body>
    </html>
  `);
});

// Health check endpoint (for Render / UptimeRobot / Cron-job keep-alive)
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptimeSeconds: Math.floor(process.uptime()),
    connectedClients: state.activeWsClients.size + state.activeSseClients.size,
    totalNewJobs: state.stats.totalNewJobsDetected,
    lastScrapeTime: state.stats.lastScrapeTime
  });
});

// JSON API of recent jobs
app.get('/api/jobs', (req, res) => {
  res.json({
    success: true,
    count: state.recentJobs.length,
    jobs: state.recentJobs
  });
});

// Test broadcast endpoint
app.post('/api/test-broadcast', (req, res) => {
  const testJob = {
    id: 'test-' + Date.now(),
    title: 'مشروع تجريبي: اختبار إشعارات السيرفر المباشر',
    url: 'https://mostaql.com/projects',
    poster: 'Frelancia Server',
    time: 'الآن',
    postedAt: new Date().toISOString(),
    bidsText: '0 عروض',
    description: 'تم إرسال هذا الإشعار من سيرفر Frelancia للتحقق من وصول التنبيهات اللحظية للإضافة.',
    budget: '100 $ - 250 $'
  };

  broadcastNewJobs([testJob]);
  res.json({ success: true, message: 'Test notification broadcasted to all connected clients', clients: state.activeWsClients.size + state.activeSseClients.size });
});

// ==========================================================
// 6. Anti-Sleep Keep-Alive for Free Cloud Hosting
// ==========================================================

const PING_URL = process.env.RENDER_EXTERNAL_URL || process.env.SERVER_URL;
if (PING_URL) {
  setInterval(async () => {
    try {
      const pingEndpoint = PING_URL.endsWith('/') ? `${PING_URL}health` : `${PING_URL}/health`;
      await fetch(pingEndpoint);
      console.log('[KEEP-ALIVE] Self-ping successful to stay awake.');
    } catch (e) {
      // Ignore ping errors
    }
  }, 10 * 60 * 1000); // every 10 minutes
}

// Start Server
server.listen(PORT, () => {
  console.log(`\n==================================================`);
  console.log(`🚀 Frelancia Live Hub listening on port ${PORT}`);
  console.log(`📡 SignalR Endpoint: http://localhost:${PORT}/jobNotificationHub`);
  console.log(`🌐 Status Dashboard: http://localhost:${PORT}`);
  console.log(`==================================================\n`);

  startScraper();
});
