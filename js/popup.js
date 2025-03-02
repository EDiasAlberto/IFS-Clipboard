// This script runs when the popup is opened
document.addEventListener("DOMContentLoaded", function () {
  const memoryContainer = document.getElementById("memory-container");

  // Function to fetch and display memory usage
  async function fetchMemoryUsage() {
    try {
      // Get the active tab
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      // Execute content script to get memory usage data
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
      memoryContainer.innerHTML = `<p class="status">Error: ${error.message}</p>`;
      console.error(error);
    }
  }

  // Initial fetch
  fetchMemoryUsage();

  // Set up interval to refresh data every 500ms
  const intervalId = setInterval(fetchMemoryUsage, 500);

  // Clear interval when popup is closed
  window.addEventListener("unload", function () {
    clearInterval(intervalId);
  });
});
