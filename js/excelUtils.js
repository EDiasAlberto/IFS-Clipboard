/**
 * Excel utility functions for importing and exporting data
 */

/**
 * Exports data to Excel with filename based on luname column
 * @param {Array<Object>} data - Array of objects to export
 * @returns {Promise<void>} - Promise that resolves when export is complete
 */
function exportToExcel(data) {
  return new Promise((resolve, reject) => {
    if (!data || data.length === 0) {
      reject(new Error("No clipboard data available to export"));
      return;
    }
    
    try {
      // Create a new workbook
      const wb = XLSX.utils.book_new();
      
      // Convert clipboard data to worksheet
      const ws = XLSX.utils.json_to_sheet(data);
      
      // Add the worksheet to the workbook
      XLSX.utils.book_append_sheet(wb, ws, "Clipboard Data");
      
      // Generate filename using luname if available
      let filename = "IFS_Clipboard_Export";
      
      // Check if the luname column exists in the first record
      if (data[0] && 'luname' in data[0]) {
        // Get the value from the first row's luname column
        const lunameValue = data[0]['luname'];
        
        if (lunameValue) {
          // Sanitize filename - remove characters that aren't safe for filenames
          const sanitizedLuname = String(lunameValue)
            .replace(/[\\/:*?"<>|]/g, '_') // Replace unsafe characters
            .replace(/\s+/g, '_')          // Replace whitespace with underscore
            .substring(0, 50);             // Limit length
          
          if (sanitizedLuname) {
            filename += `_${sanitizedLuname}`;
          }
        }
      }
      
      // Add timestamp for uniqueness
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      filename += `_${timestamp}.xlsx`;
      
      // Write the file
      XLSX.writeFile(wb, filename);
      
      console.log(`Excel export completed successfully as ${filename}`);
      resolve();
    } catch (error) {
      console.error("Error exporting to Excel:", error);
      reject(error);
    }
  });
}

/**
 * Imports data from Excel file
 * @returns {Promise<Array<Object>>} - Promise that resolves with the imported data
 */
function importFromExcel() {
  return new Promise((resolve, reject) => {
    // Create a hidden file input element
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.xlsx, .xls, .csv';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);

    // Trigger click on file input
    fileInput.click();

    /**
     * Handles the file selection event
     * @param {Event} e - The change event
     */
    fileInput.addEventListener('change', function(e) {
      const file = e.target.files[0];
      if (!file) {
        document.body.removeChild(fileInput);
        reject(new Error("No file selected"));
        return;
      }

      const reader = new FileReader();
      
      /**
       * Handles successful file load
       * @param {ProgressEvent} e - The load event
       */
      reader.onload = function(e) {
        try {
          // Parse workbook
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, {type: 'array'});
          
          // Get first sheet
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          
          // Convert to JSON
          const jsonData = XLSX.utils.sheet_to_json(worksheet, {header: 1});
          
          // Process the data
          const clipboardData = processExcelData(jsonData);
          
          // NEW CODE: Sync the imported data across tabs
          const jsonString = JSON.stringify(clipboardData);
          
          /**
           * Callback for tab query
           * @param {Array<chrome.tabs.Tab>} tabs - Array of tabs matching the query
           */
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs && tabs.length > 0) {
              const activeTab = tabs[0];
              
              /**
               * Function to retrieve metadata from active tab
               * @return {string|null} The metadata from localStorage or null
               */
              function getTabMetadata() {
                return localStorage.getItem("TcclClipboardMetadata");
              }
              
              /**
               * Callback for metadata retrieval
               * @param {Array} results - Results from script execution
               */
              chrome.scripting.executeScript({
                target: { tabId: activeTab.id },
                function: getTabMetadata
              }, (results) => {
                let metadata = null;
                if (results && results[0] && results[0].result) {
                  metadata = results[0].result;
                }
                
                /**
                 * Function to update localStorage in active tab
                 * @param {string} data - JSON string to store
                 * @param {string|null} meta - Metadata to store
                 * @return {boolean} Success status
                 */
                function updateActiveTabStorage(data, meta) {
                  try {
                    localStorage.setItem("IFS-Aurena-CopyPasteRecordStorage", data);
                    if (meta) {
                      localStorage.setItem("TcclClipboardMetadata", meta);
                    }
                    return true;
                  } catch (error) {
                    console.error("Error updating active tab after Excel import:", error);
                    return false;
                  }
                }
                
                // First sync to active tab immediately to prevent race conditions
                chrome.scripting.executeScript({
                  target: { tabId: activeTab.id },
                  function: updateActiveTabStorage,
                  args: [jsonString, metadata]
                });
                
                // Sync to all tabs using the background tab approach
                if (typeof window.syncClipboardViaBackgroundTab === "function") {
                  // Use the global sync function
                  window.syncClipboardViaBackgroundTab(jsonString, metadata);
                  console.log("Excel import synced across tabs using background tab sync");
                } else {
                  // Fall back to the service worker method
                  console.warn("Background tab sync function not available, using fallback method");
                  
                  /**
                   * Callback for sync response
                   * @param {Object} response - Response from service worker
                   */
                  function handleSyncResponse(response) {
                    console.log("Excel import sync status:", response?.message || "Unknown");
                  }
                  
                  // Use the message passing API to sync via service worker
                  chrome.runtime.sendMessage({
                    action: "syncClipboardData",
                    data: jsonString,
                    metadata: metadata
                  }, handleSyncResponse);
                }
              });
            }
          });
          
          // Resolve the promise with the processed data
          resolve(clipboardData);
        } catch (error) {
          console.error("Error importing from Excel:", error);
          reject(error);
        } finally {
          // Remove the file input element
          document.body.removeChild(fileInput);
        }
      };
      
      /**
       * Handles file read errors
       */
      reader.onerror = function() {
        document.body.removeChild(fileInput);
        reject(new Error("Failed to read the file"));
      };
      
      // Read the file as an array buffer
      reader.readAsArrayBuffer(file);
    });
  });
}

/**
 * Processes Excel data into clipboard format
 * @param {Array<Array>} jsonData - 2D array of Excel data (rows and columns)
 * @returns {Array<Object>} Processed data in clipboard format with named properties
 */
function processExcelData(jsonData) {
  if (!jsonData || jsonData.length < 2) {
    return [];
  }
  
  // Extract headers from first row
  const headers = jsonData[0];
  
  // Convert to clipboard data format
  const clipboardData = [];
  for (let i = 1; i < jsonData.length; i++) {
    const row = jsonData[i];
    if (row.length === 0) continue; // Skip empty rows
    
    const rowData = {};
    for (let j = 0; j < headers.length; j++) {
      if (headers[j]) { // Skip empty headers
        rowData[headers[j]] = j < row.length ? row[j] : "";
      }
    }
    clipboardData.push(rowData);
  }
  
  return clipboardData;
}

/**
 * Updates page's localStorage with the provided data
 * @param {string} jsonData - JSON string to store in localStorage
 * @returns {boolean} - Success status
 */
function updatePageLocalStorage(jsonData) {
  try {
    localStorage.setItem("IFS-Aurena-CopyPasteRecordStorage", jsonData);
    console.log("Successfully updated data in page localStorage");
    return true;
  } catch (error) {
    console.error("Failed to update page localStorage:", error);
    return false;
  }
}

// Export functions for use in other modules
window.ExcelUtils = {
  exportToExcel,
  importFromExcel,
  updatePageLocalStorage
};