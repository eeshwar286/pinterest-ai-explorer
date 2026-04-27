// Background service worker for Pinterest AI Explorer
// Currently minimal: just logs install. API calls happen from the content script.

chrome.runtime.onInstalled.addListener(() => {
  console.log("[Pinterest AI Explorer] Installed.");
});
