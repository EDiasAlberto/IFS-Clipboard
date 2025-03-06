document.addEventListener("DOMContentLoaded", function () {
  // Check if current site is allowed
  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    const currentTab = tabs[0];
    if (currentTab && !currentTab.url.startsWith('chrome://')) {
      const url = new URL(currentTab.url);
      const domain = url.hostname;
      
      chrome.storage.local.get('allowedDomains', function(result) {
        const allowedDomains = result.allowedDomains || [];
        
        if (!allowedDomains.includes(domain)) {
          // If somehow reached this page without permission, redirect back
          window.location.href = '/html/permission.html';
          return;
        }
        
        // Continue with the rest of your sidepanel initialization
        initializeSidePanel();
      });
    } else {
      // For chrome:// URLs or when no tab is active
      initializeSidePanel();
    }
  });
  
  // Wrap all your existing initialization code in this function
  function initializeSidePanel() {
    // Reference to containers
    const tableContainer = document.getElementById("clipboard-data-table");
    const historyContainer = document.getElementById("history-container");
    const exportButton = document.getElementById("export-excel");
    
    // Current clipboard data
    let currentClipboardData = null;
    
    // Track expanded state of main table
    let mainTableExpanded = false;
    
    // Initialize history manager
    const historyManager = new HistoryManager(historyContainer, renderTable);
    
    // Function to handle Excel export via the utility
    function handleExportToExcel() {
      ExcelUtils.exportToExcel(currentClipboardData)
        .catch(error => {
          alert("Failed to export data: " + error.message);
        });
    }
    
    // Add click event to export button
    exportButton.addEventListener("click", handleExportToExcel);
    
    // Function to handle Excel import via the utility
    function handleImportFromExcel() {
      ExcelUtils.importFromExcel()
        .then(clipboardData => {
          // Update current clipboard data in memory
          currentClipboardData = clipboardData;
          
          // Update UI by rendering the table
          renderTable(clipboardData);
          
          // Store data in Chrome storage
          const jsonString = JSON.stringify(clipboardData);
          chrome.storage.local.set({
            "IFS-Aurena-CopyPasteRecordStorage": jsonString
          });
          
          // Also update the website's localStorage
          chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            if (tabs[0]) {
              chrome.scripting.executeScript({
                target: { tabId: tabs[0].id },
                function: ExcelUtils.updatePageLocalStorage,
                args: [jsonString]
              });
            }
          });
          
          console.log("Excel import completed successfully");
          alert(`Imported ${clipboardData.length} rows successfully`);
        })
        .catch(error => {
          alert("Failed to import Excel data: " + error.message);
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
      importButton.addEventListener('click', handleImportFromExcel);
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
      records.slice(0, initialRowsToShow).forEach((record) => {
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
        records.slice(initialRowsToShow).forEach((record) => {
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
      historyManager.updateHistory(records);
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
            historyManager.initHistory();
          }
        }
      );
    }

    // Initial check
    checkLocalStorage();

    // Set up polling every 500ms
    setInterval(checkLocalStorage, 500);
  }
});
