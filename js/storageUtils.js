/**
 * Storage Utilities for IFS Clipboard Extension
 * Handles synchronized storage operations across trusted domains
 */

class StorageUtils {
  /**
   * Updates storage across all trusted domains
   * @param {string} jsonData - JSON string to store
   * @returns {Promise} - Promise that resolves when sync is complete
   */
  static updateAcrossTrustedDomains(jsonData) {
    return new Promise((resolve, reject) => {
      try {
        // First, get metadata from the active tab
        /**
         * Query callback for retrieving active tab
         * @param {chrome.tabs.Tab[]} tabs - Array of tabs matching the query
         */
        chrome.tabs.query(
          { active: true, currentWindow: true },
          function (tabs) {
            if (!tabs || tabs.length === 0) {
              console.warn("No active tab found for metadata retrieval");
              StorageUtils._performStorageSync(jsonData, null, resolve, reject);
              return;
            }

            const activeTab = tabs[0];

            // Skip non-http tabs for metadata retrieval
            if (
              !activeTab.url ||
              (!activeTab.url.startsWith("http://") &&
                !activeTab.url.startsWith("https://"))
            ) {
              StorageUtils._performStorageSync(jsonData, null, resolve, reject);
              return;
            }

            /**
             * Function executed in tab context to retrieve metadata
             * @return {string|null} The metadata string from localStorage or null
             */
            function getMetadataFromTab() {
              // Get the metadata if it exists
              const metadata = localStorage.getItem("TcclClipboardMetadata");
              return metadata;
            }

            chrome.scripting.executeScript(
              {
                target: { tabId: activeTab.id },
                function: getMetadataFromTab,
              },
              /**
               * Callback handling metadata retrieval results
               * @param {Array} results - Results from script execution
               */
              (results) => {
                let metadata = null;
                if (results && results[0] && results[0].result) {
                  metadata = results[0].result;
                }

                // Now proceed with the regular storage sync
                StorageUtils._performStorageSync(
                  jsonData,
                  metadata,
                  resolve,
                  reject,
                );
              },
            );
          },
        );
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Internal method to perform the actual sync operation
   * @param {string} jsonData - JSON string clipboard data to sync
   * @param {string} metadata - Metadata string to sync
   * @param {Function} resolve - Promise resolve function
   * @param {Function} reject - Promise reject function
   * @private
   */
  static _performStorageSync(jsonData, metadata, resolve, reject) {
    // First, update the extension's storage with both clipboard data and metadata
    const storageData = {
      "IFS-Aurena-CopyPasteRecordStorage": jsonData,
    };

    if (metadata) {
      storageData["TcclClipboardMetadata"] = metadata;
    }

    /**
     * Callback after setting local storage
     */
    chrome.storage.local.set(storageData, () => {
      if (chrome.runtime.lastError) {
        reject(
          new Error(
            `Extension storage error: ${chrome.runtime.lastError.message}`,
          ),
        );
        return;
      }

      /**
       * Callback after retrieving allowed domains
       * @param {Object} result - Storage result containing allowedDomains
       */
      chrome.storage.local.get("allowedDomains", function (result) {
        const allowedDomains = result.allowedDomains || [];

        if (allowedDomains.length === 0) {
          resolve({ success: true, message: "No trusted domains to sync to" });
          return;
        }

        /**
         * Callback after querying all tabs
         * @param {chrome.tabs.Tab[]} tabs - Array of all browser tabs
         */
        chrome.tabs.query({}, (tabs) => {
          console.log("Found total tabs:", tabs.length);

          /**
           * Filter function to identify trusted tabs
           * @param {chrome.tabs.Tab} tab - Tab to check if trusted
           * @return {boolean} True if the tab is from a trusted domain
           */
          const trustedTabsFilter = (tab) => {
            if (
              !tab.url ||
              (!tab.url.startsWith("http://") &&
                !tab.url.startsWith("https://"))
            ) {
              return false;
            }

            try {
              const url = new URL(tab.url);
              const hostname = url.hostname;

              // More detailed logging
              console.log(
                `Checking tab ${tab.id} with URL: ${url.href}, hostname: ${hostname}`,
              );

              for (const domain of allowedDomains) {
                // Use includes instead of exact match for subdomains
                if (hostname.includes(domain) || domain.includes(hostname)) {
                  console.log(
                    `Tab ${tab.id} is trusted - matches domain: ${domain}`,
                  );
                  return true;
                }
              }

              console.log(`Tab ${tab.id} is not trusted`);
              return false;
            } catch (e) {
              console.error(`Error checking tab ${tab.id}:`, e);
              return false;
            }
          };

          // Filter tabs matching trusted domains
          const trustedTabs = tabs.filter(trustedTabsFilter);

          console.log("Trusted tabs found:", trustedTabs.length);

          if (trustedTabs.length === 0) {
            resolve({ success: true, message: "No matching tabs to sync to" });
            return;
          }

          // Track sync operations
          let completed = 0;
          let successful = 0;
          let syncResults = [];

          var SyncMetadata = metadata ? metadata : null;
          console.log(SyncMetadata);

          /**
           * Function executed in tab context to update localStorage
           * @param {string} data - The clipboard data to store
           * @param {Object|null} meta - The metadata to store
           * @return {Object} Result object indicating success/failure and details
           */
          function updateTabStorage(data, meta) {
            try {
              // Update the clipboard data
              localStorage.setItem("IFS-Aurena-CopyPasteRecordStorage", data);

              // Update metadata if provided
              if (meta) {
                localStorage.setItem("TcclClipboardMetadata", meta);
              }

              return {
                success: true,
                domain: location.hostname,
                url: location.href,
              };
            } catch (error) {
              console.error("Storage update failed:", error);
              return {
                success: false,
                error: error.message,
                url: location.href,
              };
            }
          }

          // Update localStorage for each tab
          trustedTabs.forEach((tab) => {
            console.log(
              `Attempting to sync to tab ${tab.id} with URL: ${tab.url}`,
            );

            chrome.scripting.executeScript(
              {
                target: { tabId: tab.id },
                function: updateTabStorage,
                args: [jsonData, SyncMetadata],
              },
              /**
               * Callback after executing script in a tab
               * @param {Array} results - Results from script execution
               */
              (results) => {
                completed++;

                if (
                  results &&
                  results[0] &&
                  results[0].result &&
                  results[0].result.success
                ) {
                  successful++;
                  syncResults.push({
                    tabId: tab.id,
                    success: true,
                    url: tab.url,
                    domain: results[0].result.domain,
                  });
                  console.log(
                    `Sync successful for tab ${tab.id} (${results[0].result.domain})`,
                  );
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
                  syncResults.push({
                    tabId: tab.id,
                    success: false,
                    url: tab.url,
                    error: errorMsg,
                  });
                  console.error(`Sync failed for tab ${tab.id}: ${errorMsg}`);
                }

                // When all operations are complete, resolve the promise
                if (completed === trustedTabs.length) {
                  resolve({
                    success: successful > 0,
                    message: `Synced to ${successful}/${trustedTabs.length} tabs`,
                    syncedCount: successful,
                    totalTabs: trustedTabs.length,
                    details: syncResults,
                  });
                }
              },
            );
          });
        });
      });
    });
  }
}

// Export for use in other modules
window.StorageUtils = StorageUtils;
