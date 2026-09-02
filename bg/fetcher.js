// ==========================================
// bg/fetcher.js — HTTP fetching for job listings and project details
// Depends on: offscreen.js (parseJobsOffscreen, setupOffscreenDocument)
// ==========================================

function cleanTitle(text) {
  if (!text) return 'مشروع جديد';
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseJobsRegex(html) {
  const jobs = [];
  const seenIds = new Set();
  const rowRegex = /<tr[^>]*class="[^"]*project-row[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi;
  let match;

  while ((match = rowRegex.exec(html)) !== null) {
    const rowHtml = match[1];

    const linkMatch = rowHtml.match(/<h2[^>]*>[\s\S]*?<a\s+href="([^"]*\/project\/(\d+)[^"]*)"[^>]*>([\s\S]*?)<\/a>/i) ||
                      rowHtml.match(/<a\s+href="([^"]*\/project\/(\d+)[^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!linkMatch) continue;

    const rawUrl = linkMatch[1];
    const id = linkMatch[2];
    if (seenIds.has(id)) continue;
    seenIds.add(id);

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

    jobs.push({ id, title, url, poster, time, postedAt, bidsText, description, budget: 'غير محدد' });
  }

  // Fallback regex for all /project/(\d+) links if tr.project-row wasn't found
  if (jobs.length === 0) {
    const linkRegex = /<a\s+[^>]*href="([^"]*\/project\/(\d+)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    while ((match = linkRegex.exec(html)) !== null) {
      const href = match[1];
      const id = match[2];
      if (seenIds.has(id) || href.includes('/create') || href.includes('template=')) continue;
      const text = match[3].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
      if (text.length > 5) {
        seenIds.add(id);
        const url = href.startsWith('http') ? href : 'https://mostaql.com' + href;
        jobs.push({ id, title: text, url, poster: '', time: '', postedAt: '', bidsText: '', description: '', budget: 'غير محدد' });
      }
    }
  }

  return jobs;
}

function parseProjectDetailsRegex(html) {
  let status = 'غير معروف';
  const statusMatch = html.match(/class="[^"]*label-prj-[^"]*"[^>]*>([\s\S]*?)<\//i);
  if (statusMatch) status = statusMatch[1].replace(/<[^>]*>/g, '').trim();

  let description = '';
  const descMatch = html.match(/class="[^"]*(?:carda__content|project-post__body)[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  if (descMatch) description = descMatch[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

  let budget = '';
  const budgetMatch = html.match(/الميزانية[\s\S]*?class="meta-value"[^>]*>([\s\S]*?)<\/div>/i);
  if (budgetMatch) budget = budgetMatch[1].replace(/<[^>]*>/g, '').trim();

  let duration = 'غير محددة';
  const durationMatch = html.match(/مدة التنفيذ[\s\S]*?class="meta-value"[^>]*>([\s\S]*?)<\/div>/i);
  if (durationMatch) duration = durationMatch[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

  let hiringRate = '';
  const hiringMatch = html.match(/معدل التوظيف[\s\S]*?<td>([\s\S]*?)<\/td>/i);
  if (hiringMatch) hiringRate = hiringMatch[1].replace(/<[^>]*>/g, '').trim();

  let communications = '0';
  const commMatch = html.match(/التواصلات(?: الجارية)?[\s\S]*?<td>([\s\S]*?)<\/td>/i);
  if (commMatch) communications = commMatch[1].replace(/<[^>]*>/g, '').trim();

  return { status, communications, hiringRate, description, duration, budget, registrationDate: '' };
}

async function fetchJobs(url) {
  try {
    const fetchUrl = url + (url.includes('?') ? '&' : '?') + '_cb=' + Date.now();
    console.log(`Fetching: ${fetchUrl}`);

    const response = await fetch(fetchUrl, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'ar,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });

    if (!response.ok) {
      console.error(`HTTP Error: ${response.status}`);
      return [];
    }

    const html = await response.text();
    console.log(`Received HTML length: ${html.length}`);

    if (html.includes('Cloudflare') || html.includes('challenge-platform')) {
      console.error('Cloudflare challenge detected. Please open Mostaql.com in a tab first.');
      return [];
    }

    // Try offscreen parsing first
    let jobs = [];
    try {
      jobs = await parseJobsOffscreen(html);
    } catch (e) {
      console.warn('Offscreen parse failed, falling back to direct parse:', e);
    }

    // Fall back to direct regex parsing if offscreen produced no jobs
    if (!jobs || jobs.length === 0) {
      jobs = parseJobsRegex(html);
      console.log(`Parsed ${jobs.length} jobs via Direct Regex Parser`);
    } else {
      console.log(`Parsed ${jobs.length} jobs via Offscreen`);
    }

    return jobs;
  } catch (error) {
    console.error('Error fetching jobs:', error);
    return [];
  }
}

async function fetchProjectDetails(url) {
  try {
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'ar,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });

    if (!response.ok) return null;

    const html = await response.text();

    try {
      await setupOffscreenDocument();
      const offscreenResult = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'parseProjectDetails', html: html }, (response) => {
          if (chrome.runtime.lastError) {
            resolve(null);
          } else if (response && response.success) {
            resolve(response.data);
          } else {
            resolve(null);
          }
        });
        setTimeout(() => resolve(null), 2000);
      });

      if (offscreenResult) return offscreenResult;
    } catch (e) {
      console.warn('Offscreen details parse error, using regex fallback:', e);
    }

    // Fallback to regex details parser
    return parseProjectDetailsRegex(html);
  } catch (error) {
    console.error('Error fetching project details:', error);
    return null;
  }
}
