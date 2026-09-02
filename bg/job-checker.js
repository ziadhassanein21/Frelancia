// ==========================================
// bg/job-checker.js — Main job polling loop
// Depends on: constants.js, filters.js, fetcher.js, notifications.js, audio.js
// ==========================================

async function checkForNewJobs() {
  try {
    const data = await chrome.storage.local.get(['settings', 'seenJobs', 'stats', 'recentJobs', 'notificationsEnabled']);
    const settings = data.settings || {};

    if (settings.systemEnabled === false) {
      console.log('System is paused via Dashboard toggle. Skipping check.');
      return { success: true, paused: true };
    }

    let seenJobs = data.seenJobs || [];
    let recentJobs = data.recentJobs || [];
    let stats = data.stats || {};

    if (typeof stats.todayCount !== 'number') stats.todayCount = 0;
    if (!stats.todayDate) stats.todayDate = new Date().toDateString();
    const isFirstRun = (!stats.lastCheck && seenJobs.length === 0);

    if (stats.todayDate !== new Date().toDateString()) {
      stats.todayCount = 0;
      stats.todayDate = new Date().toDateString();
    }

    let allNewJobs = [];

    // Prioritize categories: if 'all' is active, check 'all'; else check enabled categories
    const categoriesToCheck = (settings.all !== false)
      ? { all: MOSTAQL_URLS.all }
      : Object.fromEntries(Object.entries(MOSTAQL_URLS).filter(([cat]) => settings[cat] !== false));

    for (const [category, url] of Object.entries(categoriesToCheck)) {
      console.log(`Checking category: ${category}`);
      const jobs = await fetchJobs(url);
      console.log(`Found ${jobs.length} total jobs in ${category}`);

      jobs.forEach(job => {
        if (applyFilters(job, settings)) {
          const existingIdx = recentJobs.findIndex(rj => rj.id === job.id);
          if (existingIdx !== -1) {
            recentJobs[existingIdx] = { ...recentJobs[existingIdx], ...job };
          } else {
            recentJobs.unshift(job);
          }
        }
      });

      const newJobs = jobs.filter(job => {
        if (seenJobs.includes(job.id)) return false;
        return applyFilters(job, settings);
      });
      console.log(`Found ${newJobs.length} NEW jobs in ${category}`);

      allNewJobs = allNewJobs.concat(newJobs);
      jobs.forEach(job => {
        if (!seenJobs.includes(job.id)) seenJobs.push(job.id);
      });
    }

    // Phase 1: Commit state immediately
    stats.lastCheck = new Date().toISOString();

    if (seenJobs.length > 500) seenJobs = seenJobs.slice(-500);

    recentJobs.sort((a, b) => {
      const idA = parseInt(a.id) || 0;
      const idB = parseInt(b.id) || 0;
      return idB - idA;
    });
    recentJobs = recentJobs.slice(0, 50);

    // Initial Run: Seed data without sending mass notifications
    if (isFirstRun) {
      console.log(`Initial setup: Seeded ${recentJobs.length} projects to dashboard without alert spam.`);
      stats.todayCount = recentJobs.length;
      await chrome.storage.local.set({ seenJobs, stats, recentJobs });
      return { success: true, newJobs: 0, seeded: recentJobs.length };
    }

    stats.todayCount += allNewJobs.length;
    await chrome.storage.local.set({ seenJobs, stats, recentJobs });
    console.log(`Phase 1 Commit: Saved ${allNewJobs.length} new jobs to dashboard.`);

    if (allNewJobs.length === 0) {
      console.log(`✓ Check completed at ${new Date().toLocaleTimeString()}, found 0 new jobs`);
      return { success: true, newJobs: 0, totalChecked: seenJobs.length };
    }

    // Check Quiet Hours
    if (settings.quietHoursEnabled && isQuietHour(settings)) {
      console.log('Quiet Hours active, suppressing notifications/sounds');
      return { success: true, newJobs: 0, suppressed: allNewJobs.length };
    }

    // Phase 2: Check whether deep verification (budget, hiring rate, duration) is needed
    const needsDeepCheck = (settings.minBudget > 0)
      || (settings.minHiringRate > 0)
      || (settings.maxDuration > 0)
      || (settings.minClientAge > 0);

    let qualityJobs = [];

    if (needsDeepCheck) {
      // Limit deep checks to at most 3 jobs to prevent rate-limiting
      const jobsToVerify = allNewJobs.slice(0, 3);
      for (const job of jobsToVerify) {
        try {
          const projectDetails = await fetchProjectDetails(job.url);
          if (projectDetails) {
            job.description = projectDetails.description || job.description;
            job.hiringRate = projectDetails.hiringRate;
            job.status = projectDetails.status;
            job.communications = projectDetails.communications;
            job.duration = projectDetails.duration;
            job.registrationDate = projectDetails.registrationDate;

            if ((!job.budget || job.budget === 'غير محدد') && projectDetails.budget) {
              job.budget = projectDetails.budget;
            }

            if (!applyFilters(job, settings)) {
              console.log(`Filtering out job ${job.id} after deep check`);
              continue;
            }
          }
        } catch (e) {
          console.error(`Error deep checking job ${job.id}:`, e);
        }

        qualityJobs.push(job);
      }
    } else {
      // No deep check needed — brief description from list already passed applyFilters!
      qualityJobs = allNewJobs;
    }

    // Phase 3: Deliver notification
    if (qualityJobs.length > 0) {
      const isEnabled = data.notificationsEnabled !== false;
      if (isEnabled) {
        console.log(`Showing notification for ${qualityJobs.length} new job(s)`);
        showNotification(qualityJobs);
        if (settings.sound) playSound();
      } else {
        console.log('Notifications are toggled off. Skipping alert for new jobs.');
      }
    }

    console.log(`✓ Check completed at ${new Date().toLocaleTimeString()}, found ${allNewJobs.length} new jobs`);
    return { success: true, newJobs: allNewJobs.length, totalChecked: seenJobs.length };
  } catch (error) {
    console.error('Error checking jobs:', error);
    return { success: false, error: error.message };
  }
}
