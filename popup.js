// popup.js — save the Gemini API key into chrome.storage.local
const STORAGE_KEY = "gemini_api_key";
const keyInput = document.getElementById("key");
const saveBtn = document.getElementById("save");
const statusEl = document.getElementById("status");

chrome.storage.local.get([STORAGE_KEY], (res) => {
  if (res[STORAGE_KEY]) keyInput.value = res[STORAGE_KEY];
});

saveBtn.addEventListener("click", () => {
  const val = (keyInput.value || "").trim();
  chrome.storage.local.set({ [STORAGE_KEY]: val }, () => {
    statusEl.textContent = val ? "Saved!" : "Cleared.";
    setTimeout(() => (statusEl.textContent = ""), 2000);
  });
});
