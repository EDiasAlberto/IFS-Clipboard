/**
 * Popup script for IFS Clipboard Extension
 * Displays memory usage information from the active tab
 */

/**
 * Initialize the popup when DOM is fully loaded
 * @listens DOMContentLoaded
 */
document.addEventListener("DOMContentLoaded", function () {
  const memoryContainer = document.getElementById("memory-container");

  /**
   * Fetches and displays memory usage information from the active tab
   * Executes a content script to retrieve memory data
   * @async
   * @returns {Promise<void>} - Promise that resolves when memory data is displayed
   */
  async function fetchMemoryUsage() {
    try {
      /**
       * Get the active tab
       * @type {chrome.tabs.Tab}
       */
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      /**
       * Execute content script to get memory usage data
       * @type {Array<{result: string}>}
       */
      const result = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["/js/content.js"],
      });

      // Get the result from the content script
      const memoryData = result[0].result;

      if (memoryData) {
        memoryContainer.innerHTML = memoryData;
      } else {
        memoryContainer.innerHTML =
          '<p class="status">No memory usage information found on this page.</p>';
      }
    } catch (error) {
      /**
       * Display error message if fetching memory data fails
       * Common causes: content script cannot execute on certain pages (e.g., chrome://)
       */
      memoryContainer.innerHTML = `<p class="status">Error: ${error.message}</p>`;
      console.error("Error fetching memory usage:", error);
    }
  }

  // Initial fetch
  fetchMemoryUsage();

  /**
   * Polling interval ID for refreshing memory data
   * Stores reference to interval for cleanup on popup close
   * @type {number}
   */
  const intervalId = setInterval(fetchMemoryUsage, 500);

  /**
   * Clean up interval when popup is closed
   * Prevents continued execution after popup is closed
   * @listens unload
   */
  window.addEventListener("unload", function () {
    clearInterval(intervalId);
  });
});
