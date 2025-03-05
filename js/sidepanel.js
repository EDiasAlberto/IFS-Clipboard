document.addEventListener("DOMContentLoaded", function () {
  // Reference to containers
  const tableContainer = document.getElementById("clipboard-data-table");
  const historyContainer = document.getElementById("history-container");
  
  // Keep track of previous records for history
  let previousRecords = null;
  let historyItems = [];
  const MAX_HISTORY_ITEMS = 10;
  
  // Function to render table with data from storage
  function renderTable(records) {
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

    // Create data rows
    records.forEach((record) => {
      tableHTML += "<tr>";
      headers.forEach((header) => {
        const cellValue = record[header] !== undefined ? record[header] : "";
        tableHTML += `<td style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">${cellValue}</td>`;
      });
      tableHTML += "</tr>";
    });

    tableHTML += "</table>";
    tableContainer.innerHTML = tableHTML;
    
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
    
    // Re-render the table with the restored data
    renderTable(historyData);
    
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
      
      historyHTML += `
        <div class="history-item">
          <div class="history-header" data-expand="${expandId}">
            <div class="history-timestamp">${item.timestamp}</div>
            <div class="history-content">${item.summary}</div>
            <div class="restore-btn" id="${restoreId}">Restore</div>
            <div class="expand-icon expand-icon-down"></div>
          </div>
          <div id="${expandId}" class="history-details" style="display: none;">
            ${createHistoryDetailsTable(item.data)}
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
  }
  
  // Function to create a table for history details
  function createHistoryDetailsTable(records) {
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
    
    // Create data rows
    records.forEach((record) => {
      tableHTML += "<tr>";
      headers.forEach((header) => {
        const cellValue = record[header] !== undefined ? record[header] : "";
        tableHTML += `<td style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd; font-size: 0.9em;">${cellValue}</td>`;
      });
      tableHTML += "</tr>";
    });
    
    tableHTML += "</table>";
    return tableHTML;
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
