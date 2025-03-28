"use strict";
// allows the user to open the sidepanel by clicking the extension icon
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

/**
 * Polls the active tab for local storage data if it's from a trusted domain
 * Checks current tab's URL against allowed domains and retrieves clipboard data if trusted
 */
function pollLocalStorage() {
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    if (
      tabs[0] &&
      tabs[0].url &&
      (tabs[0].url.startsWith("http://") || tabs[0].url.startsWith("https://"))
    ) {
      // Check if this is a trusted domain
      chrome.storage.local.get("allowedDomains", function (result) {
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
              function: getLocalStorageItems,
            });
          }
        } catch (e) {
          console.error("Error checking tab URL:", e);
        }
      });
    }
  });
}

/**
 * Retrieves clipboard storage data from the page's localStorage
 * Executed in the context of a web page via executeScript
 * @return {void} No return value, sends message to extension with storage data
 */
function getLocalStorageItems() {
  const recordsString = localStorage.getItem(
    "IFS-Aurena-CopyPasteRecordStorage",
  );
  const metadataString = localStorage.getItem("TcclClipboardMetadata");

  if (recordsString) {
    // Send the data to the service worker
    chrome.runtime.sendMessage({
      action: "localStoragePolled",
      data: recordsString,
      metadata: metadataString,
      timestamp: new Date().toISOString(),
      domain: location.hostname,
      url: location.href,
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
  path: "html/permission.html",
});

// Add a message listener to handle navigation requests from the permission page
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "checkPermission") {
    checkAndSetSidePanelPage();
  } else if (message.action === "domainPermissionGranted") {
    // Update the sidePanel to the main page after permission is granted
    chrome.sidePanel.setOptions({
      path: "html/sidepanel.html",
    });
    sendResponse({ success: true });
  }
  return true;
});

/**
 * Checks if the current active tab is from a trusted domain and sets appropriate sidepanel
 * @return {Promise<void>} A promise that resolves when the sidepanel is set
 */
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
    if (!currentTab.url || currentTab.url.startsWith("chrome://")) {
      console.log("Chrome URL detected, skipping permission check");
      chrome.sidePanel.setOptions({
        path: "html/sidepanel.html",
      });
      return;
    }

    // Extract just the domain part of the URL
    const url = new URL(currentTab.url);
    const domain = url.hostname;
    console.log("Current domain:", domain);

    // Get allowed domains
    const result = await chrome.storage.local.get("allowedDomains");
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
        path: "html/sidepanel.html",
      });
    } else {
      console.log("Loading permission page for untrusted domain");
      chrome.sidePanel.setOptions({
        path: "html/permission.html",
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

/**
 * Overrides localStorage.setItem method to monitor for clipboard data changes
 * Executed in the context of a web page via executeScript
 * @return {void} No return value, sends message to extension when clipboard data changes
 */
function watchStorageChanges() {
  // Save the original setItem method
  const originalSetItem = localStorage.setItem;

  // Override the setItem method
  localStorage.setItem = function (key, value) {
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
        url: location.href,
      });
    }
  };

  console.log(
    "[IFS Clipboard] Storage change monitor installed at:",
    location.href,
  );
}

// Modified message handler to handle storage updates and sync
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (
    message.action === "localStorageUpdated" ||
    message.action === "localStoragePolled"
  ) {
    // Storage object to update
    const storageData = {
      "IFS-Aurena-CopyPasteRecordStorage": message.data,
    };

    // Add metadata if available
    if (message.metadata) {
      storageData["TcclClipboardMetadata"] = message.metadata;
    }

    // First, check if this data is different from what's already stored
    chrome.storage.local.get(
      ["IFS-Aurena-CopyPasteRecordStorage"],
      function (result) {
        const currentData = result["IFS-Aurena-CopyPasteRecordStorage"];

        // Only proceed if data has changed or we're explicitly syncing
        if (
          currentData !== message.data ||
          message.action === "localStorageUpdated"
        ) {
          console.log(
            `Storage update from ${message.domain || "unknown"}, updating extension storage`,
          );

          // Store the data in Chrome's storage
          chrome.storage.local.set(storageData, () => {
            // Sync to other tabs if this was a user action or an explicit sync request
            if (message.action === "localStorageUpdated") {
              syncToAllTrustedTabs(
                message.data,
                message.metadata,
                sender.tab ? sender.tab.id : null,
              );
            }
          });
        }
      },
    );
  }

  // Handle the syncClipboardData message
  if (message.action === "syncClipboardData") {
    if (message.data) {
      // First, get metadata from extension storage
      chrome.storage.local.get(
        ["TcclClipboardMetadata"],
        function (metadataResult) {
          const metadata = metadataResult["TcclClipboardMetadata"];

          // Store in extension storage - already done, but ensure it's there
          chrome.storage.local.set(
            {
              "IFS-Aurena-CopyPasteRecordStorage": message.data,
            },
            () => {
              // Sync to all trusted tabs
              chrome.storage.local.get("allowedDomains", function (result) {
                const allowedDomains = result.allowedDomains || [];

                if (allowedDomains.length === 0) {
                  if (sendResponse)
                    sendResponse({
                      success: true,
                      message: "No trusted domains to sync to",
                    });
                  return;
                }

                // Get all tabs
                chrome.tabs.query({}, (tabs) => {
                  // Filter tabs matching trusted domains
                  const trustedTabs = tabs.filter((tab) => {
                    if (!tab.url) return false;
                    try {
                      const url = new URL(tab.url);
                      return allowedDomains.includes(url.hostname);
                    } catch (e) {
                      return false;
                    }
                  });

                  if (trustedTabs.length === 0) {
                    if (sendResponse)
                      sendResponse({
                        success: true,
                        message: "No matching tabs to sync to",
                      });
                    return;
                  }

                  // Track sync operations
                  let completed = 0;

                  // Update localStorage for each tab
                  trustedTabs.forEach((tab) => {
                    chrome.scripting.executeScript(
                      {
                        target: { tabId: tab.id },
                        function: function (data, meta) {
                          try {
                            localStorage.setItem(
                              "IFS-Aurena-CopyPasteRecordStorage",
                              data,
                            );

                            if (meta) {
                              localStorage.setItem(
                                "TcclClipboardMetadata",
                                meta,
                              );
                            }

                            return { success: true };
                          } catch (error) {
                            return { success: false };
                          }
                        },
                        args: [message.data, metadata], // Pass both data and metadata
                      },
                      () => {
                        completed++;

                        // When all operations are complete, respond
                        if (completed === trustedTabs.length && sendResponse) {
                          sendResponse({
                            success: true,
                            message: `Synced to ${trustedTabs.length} tabs`,
                          });
                        }
                      },
                    );
                  });
                });
              });
            },
          );
        },
      );
      return true; // Indicates async response
    }
  }

  // Handle other message types (keep your existing handlers)
  if (message.action === "checkPermission") {
    checkAndSetSidePanelPage();
  } else if (message.action === "domainPermissionGranted") {
    // Update the sidePanel to the main page after permission is granted
    chrome.sidePanel.setOptions({
      path: "html/sidepanel.html",
    });
    sendResponse({ success: true });
  }

  return true;
});

// Inject the storage watcher when a tab's URL matches an allowed domain
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (
    changeInfo.status === "complete" &&
    tab.url &&
    (tab.url.startsWith("http://") || tab.url.startsWith("https://"))
  ) {
    try {
      const url = new URL(tab.url);
      chrome.storage.local.get("allowedDomains", function (result) {
        const allowedDomains = result.allowedDomains || [];
        let isTrusted = false;

        for (const domain of allowedDomains) {
          if (url.hostname.includes(domain) || domain.includes(url.hostname)) {
            isTrusted = true;
            break;
          }
        }

        if (isTrusted) {
          console.log(
            `Injecting storage watcher into trusted tab: ${tab.id} (${url.hostname})`,
          );

          // Inject the storage watcher
          chrome.scripting
            .executeScript({
              target: { tabId: tabId },
              function: watchStorageChanges,
            })
            .then(() => {
              // After injecting the watcher, also sync the current clipboard data to this tab
              chrome.storage.local.get(
                ["IFS-Aurena-CopyPasteRecordStorage", "TcclClipboardMetadata"],
                function (result) {
                  const clipboardData =
                    result["IFS-Aurena-CopyPasteRecordStorage"];
                  const metadata = result["TcclClipboardMetadata"];

                  var SyncMetadata = metadata ? metadata : null;
                  if (clipboardData) {
                    chrome.scripting.executeScript({
                      target: { tabId: tabId },
                      function: function (data, meta) {
                        try {
                          localStorage.setItem(
                            "IFS-Aurena-CopyPasteRecordStorage",
                            data,
                          );

                          if (meta) {
                            localStorage.setItem("TcclClipboardMetadata", meta);
                          }

                          console.log(
                            "[IFS Clipboard] Data synced on tab initialization",
                          );
                          return true;
                        } catch (error) {
                          console.error(
                            "[IFS Clipboard] Failed to sync on init:",
                            error,
                          );
                          return false;
                        }
                      },
                      args: [clipboardData, SyncMetadata],
                    });
                  }
                },
              );
            })
            .catch((error) => {
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
        "IFS-Aurena-CopyPasteRecordStorage": message.data,
      };

      if (message.metadata) {
        storageData["TcclClipboardMetadata"] = message.metadata;
      }

      chrome.storage.local.set(storageData, () => {
        syncToAllTrustedTabs(
          message.data,
          message.metadata,
          null,
          sendResponse,
        );
      });

      return true; // Indicates async response
    }
  }
  // Other handlers...
});

/**
 * Syncs clipboard data to all tabs from trusted domains
 * @param {string} clipboardData - The clipboard data to sync
 * @param {string|null} metadata - The metadata associated with the clipboard data
 * @param {number|null} sourceTabId - The ID of the tab that triggered the sync (to avoid syncing back to it)
 * @param {function|null} sendResponse - Callback function to send response to the message sender
 * @return {void} No direct return value, uses sendResponse callback for async response
 */
function syncToAllTrustedTabs(
  clipboardData,
  metadata,
  sourceTabId,
  sendResponse = null
) {
  // Use the shared sync function with direct injection (default)
  ClipboardSync.syncClipboardToTrustedDomains(clipboardData, metadata, {
    sourceTabId: sourceTabId,
    useBackgroundTabs: false,
    onComplete: function(results) {
      if (sendResponse) {
        sendResponse({
          success: results.success,
          message: results.message,
          details: results.details
        });
      }
    }
  });
}

// Start polling local storage every 500ms
setInterval(pollLocalStorage, 500);

// Initialize on extension install/update
chrome.runtime.onInstalled.addListener(() => {
  // Initialize extension settings, including empty allowed domains list if not already set
  chrome.storage.local.get("allowedDomains", function (result) {
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
  if (changeInfo.status === "complete") {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (tabs[0] && tabs[0].id === tabId) {
        console.log("Active tab updated:", tab.url);
        // When active tab URL changes, check if permissions are needed
        checkAndSetSidePanelPage();
      }
    });
  }
});

// Add this code at the end of your service-worker.js file

// Listen for extension suspension (occurs when browser is closing)
chrome.runtime.onSuspend.addListener(() => {
  console.log("Browser closing - clearing clipboard data");
  
  // Clear data from Chrome's storage
  chrome.storage.local.set({
    "IFS-Aurena-CopyPasteRecordStorage": "[]",
    "TcclClipboardMetadata": null,
    "lastClipboardClear": new Date().toISOString()
  });
  
  // Attempt to clear data from all trusted tabs
  // This is a best-effort operation as we have limited time during suspension
  try {
    // Get allowed domains
    chrome.storage.local.get("allowedDomains", function(result) {
      const allowedDomains = result.allowedDomains || [];
      
      if (allowedDomains.length > 0) {
        // Get all tabs
        chrome.tabs.query({}, function(tabs) {
          // Filter to tabs from trusted domains
          const trustedTabs = tabs.filter(tab => {
            if (!tab.url) return false;
            try {
              const url = new URL(tab.url);
              for (const domain of allowedDomains) {
                if (url.hostname.includes(domain) || domain.includes(url.hostname)) {
                  return true;
                }
              }
              return false;
            } catch (e) {
              return false;
            }
          });
          
          // Clear clipboard data in each trusted tab
          trustedTabs.forEach(tab => {
            chrome.scripting.executeScript({
              target: { tabId: tab.id },
              function: function() {
                try {
                  // Clear clipboard data
                  localStorage.removeItem("IFS-Aurena-CopyPasteRecordStorage");
                  localStorage.removeItem("TcclClipboardMetadata");
                  
                  // Or set to empty array if complete removal not desired
                  // localStorage.setItem("IFS-Aurena-CopyPasteRecordStorage", "[]");
                  
                  return true;
                } catch (e) {
                  return false;
                }
              }
            });
          });
        });
      }
    });
  } catch (error) {
    console.error("Error clearing clipboard data on browser close:", error);
  }
});

// Add a handler for browser startup to check if clipboard was cleared
chrome.runtime.onStartup.addListener(() => {
  console.log("Browser starting - checking clipboard status");
  
  // Check if we have a record of clearing the clipboard on last shutdown
  chrome.storage.local.get("lastClipboardClear", function(result) {
    if (result.lastClipboardClear) {
      console.log("Clipboard was cleared on last shutdown at:", result.lastClipboardClear);
    } else {
      console.log("No record of clipboard clearing on previous shutdown");
    }
  });
});
