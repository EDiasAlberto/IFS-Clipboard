"use strict";
// allows the user to open the sidepanel by clicking the extension icon
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Set up a polling function to check browser's local storage
function pollLocalStorage() {
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    if (tabs[0] && tabs[0].url && 
        (tabs[0].url.startsWith('http://') || tabs[0].url.startsWith('https://'))) {
      
      // Check if this is a trusted domain
      chrome.storage.local.get('allowedDomains', function(result) {
        const allowedDomains = result.allowedDomains || [];
        let isTrusted = false;
        
        try {
          const url = new URL(tabs[0].url);
          const hostname = url.hostname;
          
          for (const domain of allowedDomains) {
            if (hostname.includes(domain) || domain.includes(hostname)) {
              isTrusted = true;
              break;
            }
          }
          
          if (isTrusted) {
            chrome.scripting.executeScript({
              target: { tabId: tabs[0].id },
              function: getLocalStorageItems
            });
          }
        } catch (e) {
          console.error("Error checking tab URL:", e);
        }
      });
    }
  });
}

// Function to be executed in the context of the page
function getLocalStorageItems() {
  const recordsString = localStorage.getItem("IFS-Aurena-CopyPasteRecordStorage");
  const metadataString = localStorage.getItem("TcclClipboardMetadata");

  if (recordsString) {
    // Send the data to the service worker
    chrome.runtime.sendMessage({
      action: "localStoragePolled",
      data: recordsString,
      metadata: metadataString,
      timestamp: new Date().toISOString(),
      domain: location.hostname,
      url: location.href
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
    
    if (tabs.length === 0) {
      console.log("No active tab found");
      return;
    }
    
    const currentTab = tabs[0];
    console.log("Checking permissions for tab:", currentTab.url);
    
    // Skip permission check for chrome:// URLs
    if (!currentTab.url || currentTab.url.startsWith('chrome://')) {
      console.log("Chrome URL detected, skipping permission check");
      chrome.sidePanel.setOptions({
        path: 'html/sidepanel.html'
      });
      return;
    }
    
    // Extract just the domain part of the URL
    const url = new URL(currentTab.url);
    const domain = url.hostname;
    console.log("Current domain:", domain);
    
    // Get allowed domains
    const result = await chrome.storage.local.get('allowedDomains');
    const allowedDomains = result.allowedDomains || [];
    console.log("Allowed domains:", allowedDomains);
    
    // Check if domain is trusted (using flexible matching)
    let isTrusted = false;
    for (const allowedDomain of allowedDomains) {
      if (domain.includes(allowedDomain) || allowedDomain.includes(domain)) {
        isTrusted = true;
        console.log("Domain is trusted, matched with:", allowedDomain);
        break;
      }
    }
    
    // Set appropriate page based on permissions
    if (isTrusted) {
      console.log("Loading main sidepanel for trusted domain");
      chrome.sidePanel.setOptions({
        path: 'html/sidepanel.html'
      });
    } else {
      console.log("Loading permission page for untrusted domain");
      chrome.sidePanel.setOptions({
        path: 'html/permission.html'
      });
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

// Function to be executed in the context of the page to watch for localStorage changes
function watchStorageChanges() {
  // Save the original setItem method
  const originalSetItem = localStorage.setItem;
  
  // Override the setItem method
  localStorage.setItem = function(key, value) {
    // Call the original method first
    originalSetItem.apply(this, arguments);
    
    // Check if the key is our clipboard storage
    if (key === "IFS-Aurena-CopyPasteRecordStorage") {
      // Get the metadata if it exists
      const metadata = localStorage.getItem("TcclClipboardMetadata");
      
      // Notify our extension about the change
      chrome.runtime.sendMessage({
        action: "localStorageUpdated",
        data: value,
        metadata: metadata, // Include metadata
        timestamp: new Date().toISOString(),
        source: "userAction", // Indicate this was from a user copy action
        domain: location.hostname,
        url: location.href
      });
    }
  };
  
  console.log("[IFS Clipboard] Storage change monitor installed at:", location.href);
}

// Modified message handler to handle storage updates and sync
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "localStorageUpdated" || message.action === "localStoragePolled") {
    // Storage object to update
    const storageData = {
      "IFS-Aurena-CopyPasteRecordStorage": message.data
    };
    
    // Add metadata if available
    if (message.metadata) {
      storageData["TcclClipboardMetadata"] = message.metadata;
    }
    
    // First, check if this data is different from what's already stored
    chrome.storage.local.get(["IFS-Aurena-CopyPasteRecordStorage"], function(result) {
      const currentData = result["IFS-Aurena-CopyPasteRecordStorage"];
      
      // Only proceed if data has changed or we're explicitly syncing
      if (currentData !== message.data || message.action === "localStorageUpdated") {
        console.log(`Storage update from ${message.domain || 'unknown'}, updating extension storage`);
        
        // Store the data in Chrome's storage
        chrome.storage.local.set(storageData, () => {
          // Sync to other tabs if this was a user action or an explicit sync request
          if (message.action === "localStorageUpdated") {
            syncToAllTrustedTabs(message.data, message.metadata, sender.tab ? sender.tab.id : null);
          }
        });
      }
    });
  }
  
  // Handle the syncClipboardData message
  if (message.action === "syncClipboardData") {
    if (message.data) {
      // First, get metadata from extension storage
      chrome.storage.local.get(["TcclClipboardMetadata"], function(metadataResult) {
        const metadata = metadataResult["TcclClipboardMetadata"];
      
        // Store in extension storage - already done, but ensure it's there
        chrome.storage.local.set({
          "IFS-Aurena-CopyPasteRecordStorage": message.data
        }, () => {
          // Sync to all trusted tabs
          chrome.storage.local.get('allowedDomains', function(result) {
            const allowedDomains = result.allowedDomains || [];
            
            if (allowedDomains.length === 0) {
              if (sendResponse) sendResponse({success: true, message: "No trusted domains to sync to"});
              return;
            }
            
            // Get all tabs
            chrome.tabs.query({}, (tabs) => {
              // Filter tabs matching trusted domains
              const trustedTabs = tabs.filter(tab => {
                if (!tab.url) return false;
                try {
                  const url = new URL(tab.url);
                  return allowedDomains.includes(url.hostname);
                } catch (e) {
                  return false;
                }
              });
              
              if (trustedTabs.length === 0) {
                if (sendResponse) sendResponse({success: true, message: "No matching tabs to sync to"});
                return;
              }
              
              // Track sync operations
              let completed = 0;
              
              // Update localStorage for each tab
              trustedTabs.forEach(tab => {
                chrome.scripting.executeScript({
                  target: { tabId: tab.id },
                  function: function(data, meta) {
                    try {
                      localStorage.setItem("IFS-Aurena-CopyPasteRecordStorage", data);
                      
                      if (meta) {
                        localStorage.setItem("TcclClipboardMetadata", meta);
                      }
                      
                      return { success: true };
                    } catch (error) {
                      return { success: false };
                    }
                  },
                  args: [message.data, metadata] // Pass both data and metadata
                }, () => {
                  completed++;
                  
                  // When all operations are complete, respond
                  if (completed === trustedTabs.length && sendResponse) {
                    sendResponse({success: true, message: `Synced to ${trustedTabs.length} tabs`});
                  }
                });
              });
            });
          });
        });
      });
      return true; // Indicates async response
    }
  }
  
  // Handle other message types (keep your existing handlers)
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

// Inject the storage watcher when a tab's URL matches an allowed domain
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && 
      (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
    try {
      const url = new URL(tab.url);
      chrome.storage.local.get('allowedDomains', function(result) {
        const allowedDomains = result.allowedDomains || [];
        let isTrusted = false;
        
        for (const domain of allowedDomains) {
          if (url.hostname.includes(domain) || domain.includes(url.hostname)) {
            isTrusted = true;
            break;
          }
        }
        
        if (isTrusted) {
          console.log(`Injecting storage watcher into trusted tab: ${tab.id} (${url.hostname})`);
          
          // Inject the storage watcher
          chrome.scripting.executeScript({
            target: { tabId: tabId },
            function: watchStorageChanges
          }).then(() => {
            // After injecting the watcher, also sync the current clipboard data to this tab
            chrome.storage.local.get([
              "IFS-Aurena-CopyPasteRecordStorage", 
              "TcclClipboardMetadata"
            ], function(result) {
              const clipboardData = result["IFS-Aurena-CopyPasteRecordStorage"];
              const metadata = result["TcclClipboardMetadata"];
              
              if (clipboardData) {
                chrome.scripting.executeScript({
                  target: { tabId: tabId },
                  function: function(data, meta) {
                    try {
                      localStorage.setItem("IFS-Aurena-CopyPasteRecordStorage", data);
                      
                      if (meta) {
                        localStorage.setItem("TcclClipboardMetadata", meta);
                      }
                      
                      console.log("[IFS Clipboard] Data synced on tab initialization");
                      return true;
                    } catch (error) {
                      console.error("[IFS Clipboard] Failed to sync on init:", error);
                      return false;
                    }
                  },
                  args: [clipboardData, metadata]
                });
              }
            });
          }).catch(error => {
            console.error("Failed to inject storage watcher:", error);
          });
        }
      });
    } catch (e) {
      console.error("Error checking domain:", e);
    }
  }
});

// Add a new message type to explicitly request syncing
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "syncClipboardData") {
    if (message.data) {
      console.log("Received syncClipboardData request");
      
      // Store in extension storage
      const storageData = {
        "IFS-Aurena-CopyPasteRecordStorage": message.data
      };
      
      if (message.metadata) {
        storageData["TcclClipboardMetadata"] = message.metadata;
      }
      
      chrome.storage.local.set(storageData, () => {
        syncToAllTrustedTabs(message.data, message.metadata, null, sendResponse);
      });
      
      return true; // Indicates async response
    }
  }
  // Other handlers...
});

// Function to sync data to all trusted tabs
function syncToAllTrustedTabs(clipboardData, metadata, sourceTabId, sendResponse = null) {
  chrome.storage.local.get('allowedDomains', function(result) {
    const allowedDomains = result.allowedDomains || [];
    console.log("Allowed domains for sync:", allowedDomains);
    
    if (allowedDomains.length === 0) {
      console.log("No trusted domains configured");
      if (sendResponse) sendResponse({success: true, message: "No trusted domains to sync to"});
      return;
    }
    
    // Get all tabs
    chrome.tabs.query({}, (tabs) => {
      console.log("Found total tabs:", tabs.length);
      
      // Filter tabs matching trusted domains
      const trustedTabs = tabs.filter(tab => {
        // Skip the source tab that triggered this update
        if (sourceTabId && tab.id === sourceTabId) return false;
        
        if (!tab.url || (!tab.url.startsWith('http://') && !tab.url.startsWith('https://'))) {
          return false;
        }
        
        try {
          const url = new URL(tab.url);
          const hostname = url.hostname;
          
          for (const domain of allowedDomains) {
            if (hostname.includes(domain) || domain.includes(hostname)) {
              console.log(`Tab ${tab.id} is trusted - matches domain: ${domain}`);
              return true;
            }
          }
          
          return false;
        } catch (e) {
          console.error(`Error checking tab ${tab.id}:`, e);
          return false;
        }
      });
      
      console.log("Trusted tabs found:", trustedTabs.length);
      
      if (trustedTabs.length === 0) {
        console.log("No tabs to sync to");
        if (sendResponse) sendResponse({success: true, message: "No matching tabs to sync to"});
        return;
      }
      
      // Track sync operations
      let completed = 0;
      let successful = 0;
      let syncResults = [];
      
      // Update localStorage for each tab
      trustedTabs.forEach(tab => {
        console.log(`Syncing to tab ${tab.id}: ${tab.url}`);
        
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          function: function(data, meta) {
            try {
              localStorage.setItem("IFS-Aurena-CopyPasteRecordStorage", data);
              
              if (meta) {
                localStorage.setItem("TcclClipboardMetadata", meta);
              }
              
              console.log("[IFS Clipboard] Data synced successfully at:", location.href);
              return { success: true, domain: location.hostname, url: location.href };
            } catch (error) {
              console.error("[IFS Clipboard] Sync failed:", error);
              return { success: false, error: error.message, url: location.href };
            }
          },
          args: [clipboardData, metadata]
        }, (results) => {
          completed++;
          
          if (results && results[0] && results[0].result && results[0].result.success) {
            successful++;
            syncResults.push({
              tabId: tab.id,
              success: true,
              url: tab.url,
              domain: results[0].result.domain
            });
          } else {
            let errorMsg = "Unknown error";
            if (results && results[0] && results[0].result && results[0].result.error) {
              errorMsg = results[0].result.error;
            } else if (chrome.runtime.lastError) {
              errorMsg = chrome.runtime.lastError.message;
            }
            syncResults.push({
              tabId: tab.id,
              success: false,
              url: tab.url,
              error: errorMsg
            });
          }
          
          // When all operations are complete, respond
          if (completed === trustedTabs.length && sendResponse) {
            sendResponse({
              success: successful > 0,
              message: `Synced to ${successful}/${trustedTabs.length} tabs`,
              details: syncResults
            });
          }
        });
      });
    });
  });
}

// Start polling local storage every 500ms
setInterval(pollLocalStorage, 500);

// Initialize on extension install/update
chrome.runtime.onInstalled.addListener(() => {
  // Initialize extension settings, including empty allowed domains list if not already set
  chrome.storage.local.get('allowedDomains', function(result) {
    if (!result.allowedDomains) {
      chrome.storage.local.set({ allowedDomains: [] });
    }
  });
});

// Add this new listener to detect tab focus changes

// Listen for tab activation (tab switching)
chrome.tabs.onActivated.addListener((activeInfo) => {
  console.log("Tab activated:", activeInfo.tabId);
  // When tab changes, check if permissions are needed
  checkAndSetSidePanelPage();
});

// Listen for tab URL changes
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Only trigger when the tab has finished loading and is the active tab
  if (changeInfo.status === 'complete') {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (tabs[0] && tabs[0].id === tabId) {
        console.log("Active tab updated:", tab.url);
        // When active tab URL changes, check if permissions are needed
        checkAndSetSidePanelPage();
      }
    });
  }
});
