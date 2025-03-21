/**
 * SyncManager for IFS Clipboard Extension
 * Handles cross-instance synchronization between different IFS environments
 */

class SyncManager {
  /**
   * Initialize a new SyncManager instance
   * Sets up event listeners for tab changes
   */
  constructor() {
    // Initialize tab change listener
    this.setupTabChangeListener();
  }

  /**
   * Set up listeners for tab changes and activations
   * Monitors when users switch between tabs or when tab content changes
   */
  setupTabChangeListener() {
    /**
     * Handler for tab activation events
     * @param {Object} activeInfo - Information about the activated tab
     * @param {number} activeInfo.tabId - ID of the activated tab
     * @param {number} activeInfo.windowId - ID of the window containing the tab
     * @listens chrome.tabs.onActivated
     */
    const handleTabActivation = (activeInfo) => {
      this.handleTabChange(activeInfo.tabId);
    };

    /**
     * Handler for tab update events
     * @param {number} tabId - ID of the updated tab
     * @param {Object} changeInfo - Information about the change
     * @param {string} [changeInfo.status] - Loading status of the tab
     * @param {chrome.tabs.Tab} tab - The updated tab object
     * @listens chrome.tabs.onUpdated
     */
    const handleTabUpdate = (tabId, changeInfo, tab) => {
      if (changeInfo.status === "complete" && this.isIfsUrl(tab.url)) {
        this.handleTabChange(tabId);
      }
    };

    // Listen for tab activation changes
    chrome.tabs.onActivated.addListener(handleTabActivation);

    // Listen for tab URL changes
    chrome.tabs.onUpdated.addListener(handleTabUpdate);
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
    /**
     * Callback for tab retrieval
     * @param {chrome.tabs.Tab} tab - The retrieved tab object
     */
    const onTabRetrieved = (tab) => {
      if (!tab || !this.isIfsUrl(tab.url)) {
        return; // Not an IFS tab
      }

      /**
       * Callback for storage retrieval
       * @param {Object} result - Storage items retrieved
       * @param {string} [result.IFS-Aurena-CopyPasteRecordStorage] - Clipboard data
       * @param {string} [result.TcclClipboardMetadata] - Metadata
       */
      const onStorageRetrieved = (result) => {
        const records = result["IFS-Aurena-CopyPasteRecordStorage"];
        const metadata = result["TcclClipboardMetadata"];

        if (!records) return; // No data to sync

        // Sync the data and metadata to the newly active tab
        this.syncToTab(tabId, records, metadata);
      };

      // Get the current clipboard data and metadata from extension storage
      chrome.storage.local.get(
        ["IFS-Aurena-CopyPasteRecordStorage", "TcclClipboardMetadata"],
        onStorageRetrieved
      );
    };

    chrome.tabs.get(tabId, onTabRetrieved);
  }

  /**
   * Sync clipboard data to a specific tab
   * @param {number} tabId - Tab ID to sync to
   * @param {string} jsonData - JSON string data to sync
   * @param {string} metadata - Metadata to sync
   */
  syncToTab(tabId, jsonData, metadata) {
    metadata = metadata ? JSON.parse(metadata) : null;

    /**
     * Function executed in tab context to update localStorage
     * @param {string} data - JSON string to store
     * @param {Object|null} meta - Metadata to store
     * @returns {boolean} Success status
     */
    function updateTabStorage(data, meta) {
      try {
        localStorage.setItem("IFS-Aurena-CopyPasteRecordStorage", data);

        if (meta) {
          localStorage.setItem("TcclClipboardMetadata", meta);
        }

        console.log(
          "[IFS Clipboard Sync] Successfully synced clipboard data to this environment"
        );
        return true;
      } catch (error) {
        console.error("[IFS Clipboard Sync] Failed to sync data:", error);
        return false;
      }
    }

    /**
     * Callback after executing script in tab
     * @param {Array} results - Results from script execution
     */
    const onScriptExecuted = (results) => {
      if (results && results[0] && results[0].result) {
        console.log("Cross-instance sync successful to tab", tabId);
      } else {
        console.error("Cross-instance sync failed for tab", tabId);
      }
    };

    chrome.scripting.executeScript(
      {
        target: { tabId: tabId },
        function: updateTabStorage,
        args: [jsonData, metadata]
      },
      onScriptExecuted
    );
  }

  /**
   * Manually trigger a sync to the currently active tab
   * @returns {Promise<void>} - Promise that resolves when sync is complete
   */
  syncToActiveTab() {
    return new Promise((resolve, reject) => {
      /**
       * Callback for active tab query
       * @param {Array<chrome.tabs.Tab>} tabs - Array of tabs matching the query
       */
      const onTabsRetrieved = (tabs) => {
        if (!tabs || tabs.length === 0) {
          reject(new Error("No active tab found"));
          return;
        }

        const activeTab = tabs[0];
        if (!this.isIfsUrl(activeTab.url)) {
          reject(new Error("Active tab is not an IFS environment"));
          return;
        }

        /**
         * Callback for storage retrieval
         * @param {Object} result - Storage items retrieved
         * @param {string} [result.IFS-Aurena-CopyPasteRecordStorage] - Clipboard data
         * @param {string} [result.TcclClipboardMetadata] - Metadata
         */
        const onStorageRetrieved = (result) => {
          const records = result["IFS-Aurena-CopyPasteRecordStorage"];
          const metadata = result["TcclClipboardMetadata"];

          if (!records) {
            reject(new Error("No clipboard data to sync"));
            return;
          }

          this.syncToTab(activeTab.id, records, metadata);
          resolve();
        };

        chrome.storage.local.get(
          ["IFS-Aurena-CopyPasteRecordStorage", "TcclClipboardMetadata"],
          onStorageRetrieved
        );
      };

      chrome.tabs.query({ active: true, currentWindow: true }, onTabsRetrieved);
    });
  }

  /**
   * Create a notification to show sync status
   * @param {boolean} success - Whether sync was successful
   * @param {string} [environment=''] - Environment name (if available)
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

