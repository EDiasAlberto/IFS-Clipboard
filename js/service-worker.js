"use strict";
// allows the user to open the sidepanel by clicking the extension icon
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Set up a polling function to check browser's local storage
function pollLocalStorage() {
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    if (tabs[0]) {
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        function: getLocalStorageItems,
      });
    }
  });
}

// Function to be executed in the context of the page
function getLocalStorageItems() {
  const recordsString = localStorage.getItem(
    "IFS-Aurena-CopyPasteRecordStorage",
  );

  if (recordsString) {
    // Send the data to the service worker
    chrome.runtime.sendMessage({
      action: "localStorageUpdated",
      data: recordsString,
      timestamp: new Date().toISOString()
    });
  }
}

// Listen for messages from the content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "localStorageUpdated" && message.data) {
    // Store the data in Chrome's storage for access by the sidepanel
    chrome.storage.local.set({
      "IFS-Aurena-CopyPasteRecordStorage": message.data,
    });
  }
  return true;
});

// Start polling local storage every 500ms
setInterval(pollLocalStorage, 500);
