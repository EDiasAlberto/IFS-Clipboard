/**
 * SyncManager for IFS Clipboard Extension
 * Handles cross-instance synchronization between different IFS environments
 */

class SyncManager {
  constructor() {
    // Initialize tab change listener
    this.setupTabChangeListener();
  }

  /**
   * Set up listeners for tab changes and activations
   */
  setupTabChangeListener() {
    // Listen for tab activation changes
    chrome.tabs.onActivated.addListener((activeInfo) => {
      this.handleTabChange(activeInfo.tabId);
    });

    // Listen for tab URL changes
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === "complete" && this.isIfsUrl(tab.url)) {
        this.handleTabChange(tabId);
      }
    });
  }

  /**
   * Check if a URL is an IFS cloud URL
   * @param {string} url - URL to check
   * @returns {boolean} - Whether it's an IFS URL
   */
  isIfsUrl(url) {
    if (!url) return false;
    try {
      const domain = new URL(url).hostname;
      return domain.includes("ifs.cloud");
    } catch (e) {
      return false;
    }
  }

  /**
   * Handle a tab change event
   * @param {number} tabId - ID of the newly active tab
   */
  handleTabChange(tabId) {
    chrome.tabs.get(tabId, (tab) => {
      if (!tab || !this.isIfsUrl(tab.url)) {
        return; // Not an IFS tab
      }

      // Get the current clipboard data and metadata from extension storage
      chrome.storage.local.get(
        ["IFS-Aurena-CopyPasteRecordStorage", "TcclClipboardMetadata"],
        (result) => {
          const records = result["IFS-Aurena-CopyPasteRecordStorage"];
          const metadata = result["TcclClipboardMetadata"];

          if (!records) return; // No data to sync

          // Sync the data and metadata to the newly active tab
          this.syncToTab(tabId, records, metadata);
        },
      );
    });
  }

  /**
   * Sync clipboard data to a specific tab
   * @param {number} tabId - Tab ID to sync to
   * @param {string} jsonData - JSON string data to sync
   * @param {string} metadata - Metadata to sync
   */
  syncToTab(tabId, jsonData, metadata) {
    metadata = metadata ? JSON.parse(metadata) : null;
    chrome.scripting.executeScript(
      {
        target: { tabId: tabId },
        function: function (data, meta) {
          try {
            localStorage.setItem("IFS-Aurena-CopyPasteRecordStorage", data);

            if (meta) {
              localStorage.setItem("TcclClipboardMetadata", meta);
            }

            console.log(
              "[IFS Clipboard Sync] Successfully synced clipboard data to this environment",
            );
            return true;
          } catch (error) {
            console.error("[IFS Clipboard Sync] Failed to sync data:", error);
            return false;
          }
        },
        args: [jsonData, metadata],
      },
      (results) => {
        if (results && results[0] && results[0].result) {
          console.log("Cross-instance sync successful to tab", tabId);
        } else {
          console.error("Cross-instance sync failed for tab", tabId);
        }
      },
    );
  }

  /**
   * Manually trigger a sync to the currently active tab
   * @returns {Promise} - Promise that resolves when sync is complete
   */
  syncToActiveTab() {
    return new Promise((resolve, reject) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs || tabs.length === 0) {
          reject(new Error("No active tab found"));
          return;
        }

        const activeTab = tabs[0];
        if (!this.isIfsUrl(activeTab.url)) {
          reject(new Error("Active tab is not an IFS environment"));
          return;
        }

        chrome.storage.local.get(
          ["IFS-Aurena-CopyPasteRecordStorage", "TcclClipboardMetadata"],
          (result) => {
            const records = result["IFS-Aurena-CopyPasteRecordStorage"];
            const metadata = result["TcclClipboardMetadata"];

            if (!records) {
              reject(new Error("No clipboard data to sync"));
              return;
            }

            this.syncToTab(activeTab.id, records, metadata);
            resolve();
          },
        );
      });
    });
  }

  /**
   * Create a notification to show sync status
   * @param {boolean} success - Whether sync was successful
   * @param {string} environment - Environment name (if available)
   */
  showSyncNotification(success, environment = "") {
    const envText = environment ? ` to ${environment}` : "";
    const title = success ? "Clipboard Sync Complete" : "Clipboard Sync Failed";
    const message = success
      ? `Clipboard data successfully synced${envText}`
      : `Failed to sync clipboard data${envText}`;

    // In a production extension, you might use chrome.notifications API
    console.log(`[IFS Clipboard] ${title}: ${message}`);

    // For now, just create a visual indicator in the extension UI
    const event = new CustomEvent("clipboard-sync", {
      detail: { success, message },
    });
    document.dispatchEvent(event);
  }
}

// Export the SyncManager class
window.SyncManager = SyncManager;

