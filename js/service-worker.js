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

// Since chrome.sidePanel.onShown is undefined, we'll use a different approach
// Use the chrome.action.onClicked event to handle when the extension icon is clicked

// Set default to permission page
chrome.sidePanel.setOptions({
  path: 'html/permission.html'
});

// Add a message listener to handle navigation requests from the permission page
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "checkPermission") {
    checkAndSetSidePanelPage();
  } else if (message.action === "domainPermissionGranted") {
    // Update the sidePanel to the main page after permission is granted
    chrome.sidePanel.setOptions({
      path: 'html/sidepanel.html'
    });
    sendResponse({success: true});
  }
  return true;
});

// Function to check permissions and set the appropriate sidepanel page
async function checkAndSetSidePanelPage() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (tabs.length > 0) {
      const currentTab = tabs[0];
      
      // Skip permission check for chrome:// URLs
      if (currentTab.url.startsWith('chrome://')) {
        chrome.sidePanel.setOptions({
          path: 'html/sidepanel.html'
        });
        return;
      }
      
      // Extract just the domain part of the URL
      const url = new URL(currentTab.url);
      const domain = url.hostname;
      
      // Get allowed domains
      const result = await chrome.storage.local.get('allowedDomains');
      const allowedDomains = result.allowedDomains || [];
      
      // Set appropriate page based on permissions
      if (allowedDomains.includes(domain)) {
        chrome.sidePanel.setOptions({
          path: 'html/sidepanel.html'
        });
      } else {
        chrome.sidePanel.setOptions({
          path: 'html/permission.html'
        });
      }
    }
  } catch (error) {
    console.error("Error checking permission:", error);
  }
}

// Handle extension installation
chrome.runtime.onInstalled.addListener(() => {
  // Initialize extension settings, including empty allowed domains list
  chrome.storage.local.set({ allowedDomains: [] });
});
