document.addEventListener("DOMContentLoaded", function () {
  // Reference to containers
  const tableContainer = document.getElementById("clipboard-data-table");
  const historyContainer = document.getElementById("history-container");
  const exportButton = document.getElementById("export-excel");
  
  // Keep track of previous records for history
  let previousRecords = null;
  let historyItems = [];
  const MAX_HISTORY_ITEMS = 10;
  
  // Current clipboard data
  let currentClipboardData = null;
  
  // Track expanded state of tables
  let mainTableExpanded = false;
  let expandedHistoryTables = new Set();
  
  // Function to export data to Excel
  function exportToExcel() {
    if (!currentClipboardData || currentClipboardData.length === 0) {
      alert("No clipboard data available to export");
      return;
    }
    
    try {
      // Create a new workbook
      const wb = XLSX.utils.book_new();
      
      // Convert clipboard data to worksheet
      const ws = XLSX.utils.json_to_sheet(currentClipboardData);
      
      // Add the worksheet to the workbook
      XLSX.utils.book_append_sheet(wb, ws, "Clipboard Data");
      
      // Generate Excel file with current timestamp in filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      XLSX.writeFile(wb, `IFS_Clipboard_Export_${timestamp}.xlsx`);
      
      console.log("Excel export completed successfully");
    } catch (error) {
      console.error("Error exporting to Excel:", error);
      alert("Failed to export data: " + error.message);
    }
  }
  
  // Add click event to export button
  exportButton.addEventListener("click", exportToExcel);
  
  // Function to import data from Excel file
  function importFromExcel() {
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
      if (!file) return;

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
            alert("The Excel file appears to be empty");
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
          
          // Update current clipboard data
          currentClipboardData = clipboardData;
          
          // Update the UI
          renderTable(clipboardData);
          
          console.log("Excel import completed successfully");
          alert(`Imported ${clipboardData.length} rows successfully`);
        } catch (error) {
          console.error("Error importing from Excel:", error);
          alert("Failed to import Excel data: " + error.message);
        } finally {
          // Remove the file input element
          document.body.removeChild(fileInput);
        }
      };
      
      reader.onerror = function() {
        alert("Failed to read the file");
        document.body.removeChild(fileInput);
      };
      
      // Read the file as an array buffer
      reader.readAsArrayBuffer(file);
    });
  }

  // Add import button next to export button
  function addImportButton() {
    // Create import button with same styling as export
    const importButton = document.createElement('button');
    importButton.id = 'import-excel';
    importButton.className = exportButton.className; // Use the same styling
    importButton.textContent = 'Import Data';
    
    // Insert import button before export button
    exportButton.parentNode.insertBefore(importButton, exportButton);
    
    // Add margin between buttons
    exportButton.style.marginLeft = '10px';
    
    // Add event listener
    importButton.addEventListener('click', importFromExcel);
  }

  // Add import button
  addImportButton();
  
  // Function to render table with data from storage
  function renderTable(records) {
    // Store the current data for export functionality
    currentClipboardData = records;
    
    if (!records || records.length === 0) {
      tableContainer.innerHTML = "<p>No clipboard records found</p>";
      return;
    }

    // Get the keys from the first record to use as headers
    const headers = Object.keys(records[0]);
    
    // Create table HTML
    let tableHTML = '<table style="width:100%; border-collapse: collapse;">';
    
    // Create header row
    tableHTML += "<tr>";
    headers.forEach((header) => {
      tableHTML += `<th style="padding: 8px; text-align: left; border-bottom: 2px solid #ddd;">${header}</th>`;
    });
    tableHTML += "</tr>";
    
    // Determine if we need to show the "Show More" button
    const initialRowsToShow = 3;
    const needsShowMore = records.length > initialRowsToShow;
    
    // Create data rows for the initial visible set
    records.slice(0, initialRowsToShow).forEach((record, index) => {
      tableHTML += "<tr>";
      headers.forEach((header) => {
        const cellValue = record[header] !== undefined ? record[header] : "";
        tableHTML += `<td style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">${cellValue}</td>`;
      });
      tableHTML += "</tr>";
    });
    
    // Create data rows for the hidden set (with a different class)
    if (needsShowMore) {
      // Use the saved expanded state to determine initial display
      const hiddenStyle = mainTableExpanded ? "table-row-group" : "none";
      tableHTML += `<tbody id="hidden-rows" style="display: ${hiddenStyle};">`;
      records.slice(initialRowsToShow).forEach((record, index) => {
        tableHTML += "<tr>";
        headers.forEach((header) => {
          const cellValue = record[header] !== undefined ? record[header] : "";
          tableHTML += `<td style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">${cellValue}</td>`;
        });
        tableHTML += "</tr>";
      });
      tableHTML += `</tbody>`;
    }
    
    // Close the table
    tableHTML += "</table>";
    
    // Add a "Show More" button if needed
    if (needsShowMore) {
      const buttonText = mainTableExpanded ? 
        "Show Less" : 
        `Show More (${records.length - initialRowsToShow} more rows)`;
      
      tableHTML += `
        <div class="show-more-container">
          <button id="show-more-btn" class="show-more-btn">
            ${buttonText}
          </button>
        </div>
      `;
    }
    
    tableContainer.innerHTML = tableHTML;
    
    // Add event listener to the Show More button
    if (needsShowMore) {
      document.getElementById("show-more-btn").addEventListener("click", function() {
        const hiddenRows = document.getElementById("hidden-rows");
        const showMoreBtn = document.getElementById("show-more-btn");
        
        if (hiddenRows.style.display === "none") {
          // Show the hidden rows
          hiddenRows.style.display = "table-row-group";
          showMoreBtn.textContent = "Show Less";
          mainTableExpanded = true;
        } else {
          // Hide the rows again
          hiddenRows.style.display = "none";
          showMoreBtn.textContent = `Show More (${records.length - initialRowsToShow} more rows)`;
          mainTableExpanded = false;
        }
      });
    } else {
      // Reset expanded state if there are no rows to show
      mainTableExpanded = false;
    }
    
    // Update history if records have changed
    updateHistory(records);
  }
  
  // Function to update history when records change
  function updateHistory(records) {
    // Convert records to string for comparison
    const recordsString = JSON.stringify(records);
    
    // Check if records have changed
    if (previousRecords !== null && recordsString !== previousRecords) {
      // Create a new history item
      const timestamp = new Date().toLocaleString();
      
      // Parse the previous records to display
      const prevRecordsObj = JSON.parse(previousRecords);
      
      // Create a summary of the previous state
      let summary = "";
      if (prevRecordsObj && prevRecordsObj.length > 0) {
        summary = `${prevRecordsObj.length} record(s)`;
      } else {
        summary = "Empty records";
      }
      
      // Add to history
      historyItems.unshift({
        timestamp,
        summary,
        data: prevRecordsObj
      });
      
      // Limit history size
      if (historyItems.length > MAX_HISTORY_ITEMS) {
        historyItems.pop();
      }
      
      // Update history display
      renderHistory();
    }
    
    // Update previous records
    previousRecords = recordsString;
  }
  
  // Function to restore clipboard state from history
  function restoreFromHistory(historyData) {
    if (!historyData) return;
    
    // Store the data in Chrome's storage
    chrome.storage.local.set({
      "IFS-Aurena-CopyPasteRecordStorage": JSON.stringify(historyData)
    });
    
    // Update the actual webpage's localStorage too
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (tabs[0]) {
        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          function: updatePageLocalStorage,
          args: [JSON.stringify(historyData)]
        });
      }
    });
    
    // Re-render the table with the restored data
    renderTable(historyData);
    
    console.log("Restored clipboard state from history", historyData);
  }
  
  // This function runs in the context of the webpage
  function updatePageLocalStorage(jsonData) {
    try {
      localStorage.setItem("IFS-Aurena-CopyPasteRecordStorage", jsonData);
      console.log("Successfully restored data to page localStorage");
      return true;
    } catch (error) {
      console.error("Failed to update page localStorage:", error);
      return false;
    }
  }
  
  // Function to create a table for history details
  function createHistoryDetailsTable(records, historyIndex) {
    if (!records || records.length === 0) {
      return "<p>No records in this history item</p>";
    }
    
    // Get the keys from the first record to use as headers
    const headers = Object.keys(records[0]);
    
    // Create table HTML
    let tableHTML = '<table style="width:100%; border-collapse: collapse; margin-top: 8px;">';
    
    // Create header row
    tableHTML += "<tr>";
    headers.forEach((header) => {
      tableHTML += `<th style="padding: 8px; text-align: left; border-bottom: 2px solid #ddd; font-size: 0.9em;">${header}</th>`;
    });
    tableHTML += "</tr>";
    
    // Determine if we need to show the "Show More" button
    const initialRowsToShow = 3;
    const needsShowMore = records.length > initialRowsToShow;
    const historyTableId = `history-table-${historyIndex}`;
    
    // Create data rows for the initial visible set
    records.slice(0, initialRowsToShow).forEach((record) => {
      tableHTML += "<tr>";
      headers.forEach((header) => {
        const cellValue = record[header] !== undefined ? record[header] : "";
        tableHTML += `<td style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd; font-size: 0.9em;">${cellValue}</td>`;
      });
      tableHTML += "</tr>";
    });
    
    // Create data rows for the hidden set
    if (needsShowMore) {
      // Check if this history table should be expanded
      const isExpanded = expandedHistoryTables.has(historyTableId);
      const hiddenStyle = isExpanded ? "table-row-group" : "none";
      
      tableHTML += `<tbody id="hidden-${historyTableId}" style="display: ${hiddenStyle};">`;
      records.slice(initialRowsToShow).forEach((record) => {
        tableHTML += "<tr>";
        headers.forEach((header) => {
          const cellValue = record[header] !== undefined ? record[header] : "";
          tableHTML += `<td style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd; font-size: 0.9em;">${cellValue}</td>`;
        });
        tableHTML += "</tr>";
      });
      tableHTML += `</tbody>`;
    }
    
    // Close the table
    tableHTML += "</table>";
    
    // Add a "Show More" button if needed
    if (needsShowMore) {
      const isExpanded = expandedHistoryTables.has(historyTableId);
      const buttonText = isExpanded ? 
        "Show Less" : 
        `Show More (${records.length - initialRowsToShow} more rows)`;
      
      tableHTML += `
        <div class="show-more-container">
          <button class="show-more-btn show-more-history-btn" 
                  data-target="hidden-${historyTableId}"
                  data-history-id="${historyTableId}">
            ${buttonText}
          </button>
        </div>
      `;
    }
    
    return tableHTML;
  }
  
  // Function to render history items
  function renderHistory() {
    if (historyItems.length === 0) {
      historyContainer.innerHTML = "<p>No history available yet</p>";
      return;
    }
    
    let historyHTML = '';
    
    historyItems.forEach((item, index) => {
      // Create a unique ID for the expandable content
      const expandId = `history-expand-${index}`;
      const restoreId = `history-restore-${index}`;
      const historyTableId = `history-table-${index}`;
      
      // Check if this history item was expanded
      const wasExpanded = document.getElementById(expandId)?.style.display === 'block';
      
      historyHTML += `
        <div class="history-item">
          <div class="history-header" data-expand="${expandId}">
            <div class="history-timestamp">${item.timestamp}</div>
            <div class="history-content">${item.summary}</div>
            <div class="restore-btn" id="${restoreId}">Restore</div>
            <div class="expand-icon ${wasExpanded ? 'expand-icon-up' : 'expand-icon-down'}"></div>
          </div>
          <div id="${expandId}" class="history-details" style="display: ${wasExpanded ? 'block' : 'none'};">
            ${createHistoryDetailsTable(item.data, index)}
          </div>
        </div>
      `;
    });
    
    historyContainer.innerHTML = historyHTML;
    
    // Add click handlers for expandable history items
    document.querySelectorAll('.history-header').forEach((header) => {
      header.addEventListener('click', (e) => {
        // Don't expand if clicked on the restore button
        if (e.target.classList.contains('restore-btn')) return;
        
        const expandId = header.dataset.expand;
        const detailsElement = document.getElementById(expandId);
        const expandIcon = header.querySelector('.expand-icon');
        
        if (detailsElement.style.display === 'none') {
          detailsElement.style.display = 'block';
          expandIcon.classList.remove('expand-icon-down');
          expandIcon.classList.add('expand-icon-up');
        } else {
          detailsElement.style.display = 'none';
          expandIcon.classList.remove('expand-icon-up');
          expandIcon.classList.add('expand-icon-down');
        }
      });
    });
    
    // Add click handlers for restore buttons
    historyItems.forEach((item, index) => {
      const restoreBtn = document.getElementById(`history-restore-${index}`);
      restoreBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent triggering the expand/collapse
        restoreFromHistory(item.data);
      });
    });
    
    // Add click handlers for the Show More buttons in history tables
    document.querySelectorAll('.show-more-history-btn').forEach((btn) => {
      btn.addEventListener('click', function(e) {
        e.stopPropagation(); // Prevent event bubbling
        
        const hiddenRows = document.getElementById(btn.dataset.target);
        const historyId = btn.dataset.historyId;
        
        if (hiddenRows.style.display === "none") {
          // Show the hidden rows
          hiddenRows.style.display = "table-row-group";
          btn.textContent = "Show Less";
          expandedHistoryTables.add(historyId);
        } else {
          // Hide the rows again
          hiddenRows.style.display = "none";
          const rowCount = hiddenRows.querySelectorAll('tr').length;
          btn.textContent = `Show More (${rowCount} more rows)`;
          expandedHistoryTables.delete(historyId);
        }
      });
    });
  }

  // Function to check for updates in local storage
  function checkLocalStorage() {
    chrome.storage.local.get(
      "IFS-Aurena-CopyPasteRecordStorage",
      function (result) {
        const records = result["IFS-Aurena-CopyPasteRecordStorage"];
        if (records) {
          try {
            const parsedRecords = JSON.parse(records);
            renderTable(parsedRecords);
          } catch (e) {
            console.error("Error parsing records:", e);
            tableContainer.innerHTML = "<p>Error parsing records</p>";
          }
        } else {
          tableContainer.innerHTML = "<p>No records found in storage</p>";
          // Initialize history if no previous records
          if (previousRecords === null) {
            previousRecords = "[]";
          }
        }
      }
    );
  }

  // Initial check
  checkLocalStorage();

  // Set up polling every 500ms
  setInterval(checkLocalStorage, 500);
});
