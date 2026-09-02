// ==========================================
// content/utils.js — Runtime helpers & shared state
// ==========================================

let lastPath = '';
let observerStarted = false;

function isContextValid() {
    try {
        return typeof chrome !== 'undefined' &&
            !!chrome.runtime &&
            !!chrome.runtime.id &&
            !!chrome.storage;
    } catch (e) {
        return false;
    }
}

function getPageType() {
    const path = location.pathname;
    if (/\/project[s]?\/\d+/.test(path)) return 'project';
    if (/\/message\//.test(path)) return 'message';
    if (/\/messages/.test(path)) return 'messages';
    if (/\/profile/.test(path)) return 'profile';
    if (path === '/' || path === "") return 'home';
    return 'other';
}

function getProjectId() {
    const match = window.location.pathname.match(/\/project\/(\d+)/);
    return match ? match[1] : '';
}
