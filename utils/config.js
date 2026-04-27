// utils/config.js
// Central config for Pinterest AI Explorer.
// The Gemini API key is stored in chrome.storage.local (set via the popup).
// Endpoints and model choice live here so main logic stays clean.

(function () {
  window.PAE_Config = {
    GEMINI_MODEL: "gemini-2.5-flash",
    GEMINI_URL:
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
    STORAGE_KEY: "gemini_api_key",
    // Debounce delay (ms) before firing an API call after the search query changes.
    DEBOUNCE_MS: 500,
    getApiKey() {
      return new Promise((resolve) => {
        chrome.storage.local.get([this.STORAGE_KEY], (res) => {
          resolve(res[this.STORAGE_KEY] || "");
        });
      });
    },
  };
})();
