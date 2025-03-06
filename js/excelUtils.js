/**
 * Excel utility functions for importing and exporting data
 */

/**
 * Exports data to Excel
 * @param {Array} data - Array of objects to export
 * @returns {Promise} - Promise that resolves when export is complete
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
      
      // Generate Excel file with current timestamp in filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      XLSX.writeFile(wb, `IFS_Clipboard_Export_${timestamp}.xlsx`);
      
      console.log("Excel export completed successfully");
      resolve();
    } catch (error) {
      console.error("Error exporting to Excel:", error);
      reject(error);
    }
  });
}

/**
 * Imports data from Excel file
 * @returns {Promise} - Promise that resolves with the imported data
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

    // Handle file selection
    fileInput.addEventListener('change', function(e) {
      const file = e.target.files[0];
      if (!file) {
        document.body.removeChild(fileInput);
        reject(new Error("No file selected"));
        return;
      }

      const reader = new FileReader();
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
          
          // Extract headers from first row
          if (jsonData.length === 0) {
            reject(new Error("The Excel file appears to be empty"));
            document.body.removeChild(fileInput);
            return;
          }
          
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
          
          resolve(clipboardData);
        } catch (error) {
          console.error("Error importing from Excel:", error);
          reject(error);
        } finally {
          // Remove the file input element
          document.body.removeChild(fileInput);
        }
      };
      
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