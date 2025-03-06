/**
 * Debugging utilities for IFS Clipboard Extension
 */

class DebugUtils {
  /**
   * Log a message with contextual information
   * @param {string} context - The context of the message
   * @param {any} message - The message to log
   * @param {boolean} isError - Whether this is an error message
   */
  static log(context, message, isError = false) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}][${context}] ${message}`;
    
    if (isError) {
      console.error(logEntry);
    } else {
      console.log(logEntry);
    }
  }
  
  /**
   * Test clipboard sync between domains
   * @returns {Promise} - Promise that resolves with test results
   */
  static testSyncBetweenDomains() {
    return new Promise((resolve, reject) => {
      DebugUtils.log("Sync Test", "Starting cross-domain sync test");
      
      // Get allowed domains
      chrome.storage.local.get('allowedDomains', function(result) {
        const allowedDomains = result.allowedDomains || [];
        DebugUtils.log("Sync Test", `Allowed domains: ${JSON.stringify(allowedDomains)}`);
        
        // Get all tabs
        chrome.tabs.query({}, (tabs) => {
          DebugUtils.log("Sync Test", `Found ${tabs.length} tabs`);
          
          // Filter to tabs with allowed domains
          const trustedTabs = tabs.filter(tab => {
            if (!tab.url) return false;
            
            try {
              const url = new URL(tab.url);
              const hostname = url.hostname;
              
              for (const domain of allowedDomains) {
                if (hostname.includes(domain) || domain.includes(hostname)) {
                  return true;
                }
              }
              return false;
            } catch (e) {
              return false;
            }
          });
          
          DebugUtils.log("Sync Test", `Found ${trustedTabs.length} trusted tabs`);
          
          if (trustedTabs.length === 0) {
            resolve({ success: false, message: "No trusted tabs found" });
            return;
          }
          
          // Create test data
          const testData = {
            testId: `test-${Date.now()}`,
            timestamp: new Date().toISOString(),
            message: "This is a sync test"
          };
          
          const testDataString = JSON.stringify(testData);
          
          // Try to sync to all trusted tabs
          let completed = 0;
          let results = [];
          
          trustedTabs.forEach(tab => {
            DebugUtils.log("Sync Test", `Testing tab ${tab.id}: ${tab.url}`);
            
            chrome.scripting.executeScript({
              target: { tabId: tab.id },
              function: function(testDataStr) {
                try {
                  // Store test marker in localStorage
                  localStorage.setItem("IFS-Clipboard-SyncTest", testDataStr);
                  return { success: true, url: location.href, domain: location.hostname };
                } catch (error) {
                  return { success: false, url: location.href, error: error.message };
                }
              },
              args: [testDataString]
            }, (execResults) => {
              completed++;
              
              if (execResults && execResults[0] && execResults[0].result) {
                results.push(execResults[0].result);
              } else {
                results.push({ 
                  success: false, 
                  url: tab.url, 
                  error: chrome.runtime.lastError ? chrome.runtime.lastError.message : "Unknown error" 
                });
              }
              
              if (completed === trustedTabs.length) {
                const successful = results.filter(r => r.success).length;
                resolve({
                  success: successful > 0,
                  message: `Test completed: ${successful}/${trustedTabs.length} tabs synced successfully`,
                  results: results
                });
              }
            });
          });
        });
      });
    });
  }
}

// Export for use in other modules
window.DebugUtils = DebugUtils;