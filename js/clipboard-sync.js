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

      // Get all tabs
      chrome.tabs.query({}, function (tabs) {
        // Skip tabs with sync fragment to avoid loops
        const filteredTabs = tabs.filter(tab => {
          return tab.url && 
                 (tab.url.startsWith("http://") || tab.url.startsWith("https://")) &&
                 (!useBackgroundTabs || !tab.url.includes("#ifs-clipboard-sync"));
        });

        
        // Group tabs by domain
        const domainTabsMap = new Map();
        
        // Process each trusted domain
        let syncOperationsTotal = 0;
        let syncOperationsCompleted = 0;
        let syncOperationsSuccessful = 0;
        
        // Build domain-to-tabs mapping
        allowedDomains.forEach(domain => {
          const domainLower = domain.toLowerCase();
          const matchingTabs = filteredTabs.filter(tab => {
            try {
              const url = new URL(tab.url);
              const hostname = url.hostname.toLowerCase();
              return hostname.includes(domainLower) || domainLower.includes(hostname);
            } catch (e) {
              return false;
            }
          });
          
          if (matchingTabs.length > 0) {
            domainTabsMap.set(domain, matchingTabs);
            // Add to total operations counter
            syncOperationsTotal += Math.min(2, matchingTabs.length); // Count at most 2 operations per domain
          }
        });
        
        // If no tabs match any trusted domain
        if (domainTabsMap.size === 0) {
          syncResult.message = "No trusted tabs to sync to";
          if (onComplete) onComplete(syncResult);
          resolve(syncResult);
          return;
        }
        
        // Now process each domain's tabs
        domainTabsMap.forEach((domainTabs, domain) => {
          console.log("UPDATING THE FOLLOWING TABS: ", domainTabs);
          if (domainTabs.length >= 2) {
            // Case: 2+ tabs exist for this domain
            // Update first tab with normal data
            updateTabStorage(domainTabs[0], records, metadata, false).then(result => {
              syncOperationsCompleted++;
              if (result.success) syncOperationsSuccessful++;
              syncResult.details.push(result);
              
              // Update second tab with space-prefixed data
              return updateTabStorage(domainTabs[1], records, metadata, true);
            }).then(result => {
              syncOperationsCompleted++;
              if (result.success) syncOperationsSuccessful++;
              syncResult.details.push(result);
              
              checkCompletion();
            }).catch(error => {
              console.error("Error updating domain tabs:", error);
              syncOperationsCompleted += 2; // Count both operations as completed
              syncResult.details.push({
                domain: domain,
                success: false,
                error: error.message,
                method: "directInjection"
              });
              
              checkCompletion();
            });
          } else {
            // Case: Only 1 tab exists for this domain
            if (useBackgroundTabs && domainTabs[0].id !== sourceTabId) {
              // Create a background tab, update it, and close it
              createAndUpdateBackgroundTab(domain, domainTabs[0].url, records, metadata).then(result => {
                syncOperationsCompleted++;
                if (result.success) syncOperationsSuccessful++;
                syncResult.details.push(result);
                
                checkCompletion();
              });
            } else {
              // Direct injection to the single tab
              updateTabStorage(domainTabs[0], records, metadata, false).then(result => {
                syncOperationsCompleted++;
                if (result.success) syncOperationsSuccessful++;
                syncResult.details.push(result);
                
                checkCompletion();
              });
            }
          }
        });
        
        // Helper function to check if all operations are done
        function checkCompletion() {
          if (syncOperationsCompleted >= syncOperationsTotal) {
            finalizeSyncOperation();
          }
        }
        
        // Helper function to update storage in a tab
        function updateTabStorage(tab, data, meta, addSpace) {
          return new Promise((resolve) => {
            chrome.scripting.executeScript({
              target: { tabId: tab.id },
              function: function(data, meta, addSpace) {
                try {
                  // Add space to data if requested
                  const dataToStore = addSpace ? " " + data : data;
                  
                  localStorage.setItem("IFS-Aurena-CopyPasteRecordStorage", dataToStore);
                  if (meta) {
                    localStorage.setItem("TcclClipboardMetadata", meta);
                  }
                  console.log("[IFS Clipboard] Data synced successfully at:", location.href);
                  return {
                    success: true,
                    domain: location.hostname,
                    url: location.href
                  };
                } catch (error) {
                  console.error("[IFS Clipboard] Sync failed:", error);
                  return {
                    success: false,
                    error: error.message,
                    url: location.href
                  };
                }
              },
              args: [data, meta, addSpace]
            }, (results) => {
              let tabResult = {
                tabId: tab.id,
                url: tab.url,
                method: "directInjection",
                success: false
              };
              
              if (results && results[0] && results[0].result) {
                const scriptResult = results[0].result;
                if (scriptResult.success) {
                  tabResult.success = true;
                  tabResult.domain = scriptResult.domain;
                } else {
                  tabResult.error = scriptResult.error || "Unknown error";
                }
              } else if (chrome.runtime.lastError) {
                tabResult.error = chrome.runtime.lastError.message;
              }
              
              resolve(tabResult);
            });
          });
        }
        
        // Helper function to create, update and close a background tab
        function createAndUpdateBackgroundTab(domain, baseUrl, data, meta) {
          console.log("SYNCING BACKGROUND TAB:", domain, baseUrl);
          return new Promise((resolve) => {
            // Use a minimal URL (favicon or other lightweight resource)
            const targetUrl = baseUrl 
              ? new URL(baseUrl).origin + "/favicon.ico" 
              : `https://${domain}/favicon.ico`;
            
            const syncUrl = targetUrl + `?sync=true&t=${Date.now()}#ifs-clipboard-sync`;
            
            let operationCompleted = false;
            
            // Create the tab
            chrome.tabs.create({ url: syncUrl, active: false }, function(newTab) {
              // Use webNavigation for earlier script execution
              const navListener = function(details) {
                if (details.tabId === newTab.id && details.frameId === 0 && !operationCompleted) {
                  // Execute as soon as navigation is committed (before "complete")
                  chrome.scripting.executeScript({
                    target: { tabId: newTab.id },
                    function: function(data, meta) {
                      try {
                        localStorage.setItem("IFS-Aurena-CopyPasteRecordStorage", data);
                        if (meta) {
                          localStorage.setItem("TcclClipboardMetadata", meta);
                        }
                        return true;
                      } catch (e) {
                        return false;
                      }
                    },
                    args: [data, meta]
                  }, (results) => {
                    const success = results && results[0] && results[0].result === true;
                    
                    if (success) {
                      // If successful, mark completed and close tab
                      operationCompleted = true;
                      chrome.webNavigation.onCommitted.removeListener(navListener);
                      
                      chrome.tabs.remove(newTab.id, () => {
                        resolve({
                          domain: domain,
                          success: true,
                          method: "earlyNavigation"
                        });
                      });
                    }
                    // If not successful, we'll let the other listeners try again
                  });
                }
              };
              
              chrome.webNavigation.onCommitted.addListener(navListener);
              
              // Keep the existing complete listener as a fallback
              const tabUpdateListener = function(tabId, changeInfo, tab) {
                // Only proceed if this is our tab and it's done loading
                if (tabId === newTab.id && changeInfo.status === 'complete' && !operationCompleted) {
                  // Remove listener to avoid duplicate processing
                  chrome.tabs.onUpdated.removeListener(tabUpdateListener);
                  
                  // Now inject script to set localStorage directly (no iframe needed)
                  chrome.scripting.executeScript({
                    target: { tabId: newTab.id },
                    function: function(data, meta) {
                      try {
                        // Set the data directly in this tab
                        localStorage.setItem("IFS-Aurena-CopyPasteRecordStorage", data);
                        if (meta) {
                          localStorage.setItem("TcclClipboardMetadata", meta);
                        }
                        
                        // Add timestamp for tracking
                        localStorage.setItem("IFS-Clipboard-SyncTimestamp", Date.now().toString());
                        
                        // Verify the data was actually stored
                        const verifyData = localStorage.getItem("IFS-Aurena-CopyPasteRecordStorage");
                        if (verifyData !== data) {
                          throw new Error("Data verification failed - written data doesn't match");
                        }
                        
                        return {
                          success: true,
                          message: "Storage updated successfully"
                        };
                      } catch (error) {
                        console.error("[IFS Clipboard] Direct sync failed:", error);
                        return {
                          success: false,
                          error: error.message
                        };
                      }
                    },
                    args: [data, meta]
                  }, (results) => {
                    // Mark as completed to prevent multiple executions
                    operationCompleted = true;
                    
                    // Determine if the operation was successful
                    const success = results && results[0] && results[0].result && results[0].result.success;
                    const errorMsg = results && results[0] && results[0].result && results[0].result.error;
                    
                    // Close the tab and return result
                    chrome.tabs.remove(newTab.id, () => {
                      resolve({
                        domain: domain,
                        newTabId: newTab.id,
                        success: success,
                        url: targetUrl,
                        error: !success ? (errorMsg || "Script execution failed") : undefined,
                        method: "directBackgroundTab"
                      });
                    });
                  });
                }
              };
              
              // Add the listener for tab updates
              chrome.tabs.onUpdated.addListener(tabUpdateListener);
              
              // Set a timeout to prevent hanging
              setTimeout(() => {
                if (!operationCompleted) {
                  // Remove listener if we're timing out
                  chrome.tabs.onUpdated.removeListener(tabUpdateListener);
                  operationCompleted = true;
                  
                  // Attempt one last execution before closing
                  chrome.scripting.executeScript({
                    target: { tabId: newTab.id },
                    function: function(data, meta) {
                      try {
                        localStorage.setItem("IFS-Aurena-CopyPasteRecordStorage", data);
                        if (meta) {
                          localStorage.setItem("TcclClipboardMetadata", meta);
                        }
                        return true;
                      } catch (e) {
                        return false;
                      }
                    },
                    args: [data, meta]
                  }, (results) => {
                    const lastAttemptSuccess = results && results[0] && results[0].result === true;
                    
                    chrome.tabs.remove(newTab.id, () => {
                      resolve({
                        domain: domain,
                        newTabId: newTab.id,
                        success: lastAttemptSuccess,
                        url: targetUrl,
                        error: !lastAttemptSuccess ? "Operation timed out, final attempt " + 
                          (lastAttemptSuccess ? "succeeded" : "failed") : undefined,
                        method: "directBackgroundTab"
                      });
                    });
                  });
                }
              }, 10000); // 10 second timeout
            });
          });
        }
        
        // Handle completion of all sync operations
        function finalizeSyncOperation() {
          syncResult.success = syncOperationsSuccessful > 0;
          syncResult.message = `Synced to ${syncOperationsSuccessful}/${syncOperationsTotal} operations across ${domainTabsMap.size} domains`;
          
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

