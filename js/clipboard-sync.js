/**
 * Shared utility for syncing clipboard data across trusted domains
 */

/**
 * Syncs clipboard data to all trusted domains
 * @param {string} records - JSON string of clipboard records
 * @param {string|null} metadata - JSON string of clipboard metadata
 * @param {Object} options - Additional sync options
 * @param {number|null} [options.sourceTabId] - ID of the tab that triggered the sync (to avoid loops)
 * @param {boolean} [options.useBackgroundTabs=false] - Whether to use background tabs for syncing
 * @param {function|null} [options.onComplete] - Callback when sync is complete
 * @returns {Promise<Object>} Results of the sync operation
 */
function syncClipboardToTrustedDomains(records, metadata, options = {}) {
  const {
    sourceTabId = null,
    useBackgroundTabs = false,
    onComplete = null,
  } = options;

  // Set sync status
  const syncResult = {
    success: false,
    message: "",
    details: [],
  };

  // First get all trusted domains
  return new Promise((resolve) => {
    chrome.storage.local.get("allowedDomains", function (result) {
      const allowedDomains = result.allowedDomains || [];
      console.log("Syncing to allowed domains:", allowedDomains);

      if (allowedDomains.length === 0) {
        syncResult.message = "No trusted domains to sync to";
        if (onComplete) onComplete(syncResult);
        resolve(syncResult);
        return;
      }

      // Get all tabs to find ones that match our trusted domains
      chrome.tabs.query({}, function (tabs) {
        // Filter for trusted tabs
        const trustedTabs = tabs.filter((tab) => {
          // Skip the source tab that triggered this update
          if (sourceTabId && tab.id === sourceTabId) return false;

          if (
            !tab.url ||
            (!tab.url.startsWith("http://") && !tab.url.startsWith("https://"))
          ) {
            return false;
          }

          try {
            const url = new URL(tab.url);
            const hostname = url.hostname;

            // Check if tab belongs to a trusted domain
            for (const domain of allowedDomains) {
              if (hostname.includes(domain) || domain.includes(hostname)) {
                // Skip tabs that already have our sync fragment when using background tabs
                if (
                  useBackgroundTabs &&
                  tab.url.includes("#ifs-clipboard-sync")
                ) {
                  return false;
                }
                return true;
              }
            }
            return false;
          } catch (e) {
            return false;
          }
        });

        // If no trusted tabs, exit
        if (trustedTabs.length === 0) {
          syncResult.message = "No trusted tabs to sync to";
          if (onComplete) onComplete(syncResult);
          resolve(syncResult);
          return;
        }

        // Track sync operations
        let syncOperationsTotal = trustedTabs.length;
        let syncOperationsCompleted = 0;
        let syncOperationsSuccessful = 0;

        // Process each trusted tab
        trustedTabs.forEach((tab) => {
          if (useBackgroundTabs) {
            // Create a new URL with our sync fragment
            const syncUrl = tab.url + "/#ifs-clipboard-sync";

            // Create a background tab with the sync URL
            chrome.tabs.create(
              { url: syncUrl, active: false },
              function (newTab) {
                // Execute script to update localStorage in this background tab
                chrome.scripting.executeScript(
                  {
                    target: { tabId: newTab.id },
                    function: function (data, meta) {
                      try {
                        // Update localStorage with our data
                        localStorage.setItem(
                          "IFS-Aurena-CopyPasteRecordStorage",
                          " " + data,
                        );
                        if (meta) {
                          localStorage.setItem("TcclClipboardMetadata", meta);
                        }
                        console.log(
                          "[IFS Clipboard] Sync completed via background tab",
                        );
                        return true;
                      } catch (error) {
                        console.error(
                          "[IFS Clipboard] Background tab sync failed:",
                          error,
                        );
                        return false;
                      }
                    },
                    args: [records, metadata],
                  },
                  () => {
                    chrome.tabs.remove(newTab.id, function () {
                      syncOperationsCompleted++;
                      syncOperationsSuccessful++;

                      syncResult.details.push({
                        tabId: tab.id,
                        newTabId: newTab.id,
                        success: true,
                        url: tab.url,
                        method: "backgroundTab",
                      });

                      // Check if all operations are complete
                      if (syncOperationsCompleted === syncOperationsTotal) {
                        finalizeSyncOperation();
                      }
                    });
                  },
                );
              },
            );
          } else {
            // Direct injection approach
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
                      localStorage.setItem("TcclClipboardMetadata", meta);
                    }
                    console.log(
                      "[IFS Clipboard] Data synced successfully at:",
                      location.href,
                    );
                    return {
                      success: true,
                      domain: location.hostname,
                      url: location.href,
                    };
                  } catch (error) {
                    console.error("[IFS Clipboard] Sync failed:", error);
                    return {
                      success: false,
                      error: error.message,
                      url: location.href,
                    };
                  }
                },
                args: [records, metadata],
              },
              (results) => {
                syncOperationsCompleted++;
                let tabResult = {
                  tabId: tab.id,
                  success: false,
                  url: tab.url,
                  method: "directInjection",
                };

                if (
                  results &&
                  results[0] &&
                  results[0].result &&
                  results[0].result.success
                ) {
                  syncOperationsSuccessful++;
                  tabResult.success = true;
                  tabResult.domain = results[0].result.domain;
                } else {
                  let errorMsg = "Unknown error";
                  if (
                    results &&
                    results[0] &&
                    results[0].result &&
                    results[0].result.error
                  ) {
                    errorMsg = results[0].result.error;
                  } else if (chrome.runtime.lastError) {
                    errorMsg = chrome.runtime.lastError.message;
                  }
                  tabResult.error = errorMsg;
                }

                syncResult.details.push(tabResult);

                // Check if all operations are complete
                if (syncOperationsCompleted === syncOperationsTotal) {
                  finalizeSyncOperation();
                }
              },
            );
          }
        });

        // Function to handle completion of all sync operations
        function finalizeSyncOperation() {
          syncResult.success = syncOperationsSuccessful > 0;
          syncResult.message = `Synced to ${syncOperationsSuccessful}/${syncOperationsTotal} tabs`;

          console.log("All sync operations completed:", syncResult);

          if (onComplete) {
            onComplete(syncResult);
          }

          resolve(syncResult);
        }
      });
    });
  });
}

// Export the function
if (typeof module !== "undefined" && module.exports) {
  module.exports = { syncClipboardToTrustedDomains };
} else {
  // For browser context
  window.ClipboardSync = { syncClipboardToTrustedDomains };
}

