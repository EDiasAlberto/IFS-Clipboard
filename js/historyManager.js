/**
 * History Manager for IFS Clipboard Extension
 * Handles the storage and display of clipboard history
 */

class HistoryManager {
  constructor(historyContainer, renderCallback) {
    this.historyContainer = historyContainer;
    this.renderCallback = renderCallback;
    this.previousRecords = null;
    this.historyItems = [];
    this.MAX_HISTORY_ITEMS = 10;
    this.expandedHistoryTables = new Set();
    this.currentRecords = null; // Track current clipboard state
  }
  
  /**
   * Update history when records change
   * @param {Array} records - Current clipboard records
   */
  updateHistory(records) {
    // Save the current records
    this.currentRecords = records;
    
    // Convert records to string for comparison
    const recordsString = JSON.stringify(records);
    
    // Check if records have changed
    if (this.previousRecords !== null && recordsString !== this.previousRecords) {
      // Create a new history item
      const timestamp = new Date().toLocaleString();
      
      // Parse the previous records to display
      const prevRecordsObj = JSON.parse(this.previousRecords);
      
      // Create a summary of the previous state
      let summary = "";
      if (prevRecordsObj && prevRecordsObj.length > 0) {
        summary = `${prevRecordsObj.length} record(s)`;
      } else {
        summary = "Empty records";
      }
      
      // Add to history
      this.historyItems.unshift({
        timestamp,
        summary,
        data: prevRecordsObj
      });
      
      // Limit history size
      if (this.historyItems.length > this.MAX_HISTORY_ITEMS) {
        this.historyItems.pop();
      }
      
      // Update history display
      this.renderHistory();
    } else if (this.previousRecords === null) {
      // First time - just render the history with the current data
      this.renderHistory();
    }
    
    // Update previous records
    this.previousRecords = recordsString;
  }
  
  /**
   * Restore a previous clipboard state
   * @param {Array} historyData - Data to restore
   * @returns {Promise} - Promise that resolves when restoration is complete
   */
  restoreFromHistory(historyData) {
    if (!historyData) return Promise.reject(new Error("No history data"));
    
    return new Promise((resolve, reject) => {
      try {
        // Get current metadata before restoring from history
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (!tabs || tabs.length === 0) {
            // No active tab, proceed without metadata
            this.continueRestore(historyData, null, resolve, reject);
            return;
          }
          
          const activeTab = tabs[0];
          
          // Try to get metadata from the active tab
          chrome.scripting.executeScript({
            target: { tabId: activeTab.id },
            function: function() {
              return localStorage.getItem("TcclClipboardMetadata");
            }
          }, (results) => {
            let metadata = null;
            if (results && results[0] && results[0].result) {
              metadata = results[0].result;
            }
            
            this.continueRestore(historyData, metadata, resolve, reject);
          });
        });
      } catch (err) {
        reject(err);
      }
    });
  }
  
  // Helper method to continue the restore process with metadata
  continueRestore(historyData, metadata, resolve, reject) {
    // Sync data across all trusted domains
    const jsonString = JSON.stringify(historyData);
    StorageUtils.updateAcrossTrustedDomains(jsonString)
      .then(result => {
        // Call the render callback with the restored data
        if (this.renderCallback) {
          this.renderCallback(historyData);
        }
        console.log("Restored clipboard state from history", historyData);
        console.log(`Sync status: ${result.message}`);
        resolve(historyData);
      })
      .catch(err => {
        console.error("Sync error during history restore:", err);
        // Still resolve since the local restore worked
        if (this.renderCallback) {
          this.renderCallback(historyData);
        }
        resolve(historyData);
      });
  }
  
  /**
   * Create a table for history details
   * @param {Array} records - Records to display
   * @param {Number} historyIndex - Index of the history item
   * @returns {String} - HTML for the table
   */
  createHistoryDetailsTable(records, historyIndex) {
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
      const isExpanded = this.expandedHistoryTables.has(historyTableId);
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
      const isExpanded = this.expandedHistoryTables.has(historyTableId);
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
  
  /**
   * Render history items in the container
   */
  renderHistory() {
    // Start with an empty history container
    let historyHTML = '';
    
    // First, add the current records section if we have current records
    if (this.currentRecords && this.currentRecords.length > 0) {
      const currentExpandId = 'current-record-expand';
      const currentTableId = 'current-record-table';
      
      // Check if this section was expanded
      const wasCurrentExpanded = document.getElementById(currentExpandId)?.style.display === 'block';
      
      historyHTML += `
        <div class="history-item current-record">
          <div class="history-header" data-expand="${currentExpandId}">
            <div class="history-timestamp">CURRENT VERSION</div>
            <div class="history-content">${this.currentRecords.length} record(s)</div>
            <div class="current-version-badge">Current</div>
            <div class="expand-icon ${wasCurrentExpanded ? 'expand-icon-up' : 'expand-icon-down'}"></div>
          </div>
          <div id="${currentExpandId}" class="history-details" style="display: ${wasCurrentExpanded ? 'block' : 'none'};">
            ${this.createHistoryDetailsTable(this.currentRecords, 'current')}
          </div>
        </div>
      `;
    }
    
    // Then add regular history items
    if (this.historyItems.length === 0) {
      if (!this.currentRecords || this.currentRecords.length === 0) {
        historyHTML = "<p>No history available yet</p>";
      }
    } else {
      this.historyItems.forEach((item, index) => {
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
              ${this.createHistoryDetailsTable(item.data, index)}
            </div>
          </div>
        `;
      });
    }
    
    this.historyContainer.innerHTML = historyHTML;
    
    // Add click handlers
    this.addEventListeners();
  }
  
  /**
   * Add event listeners to history elements
   */
  addEventListeners() {
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
    
    // Add click handlers for restore buttons (only for actual history items, not current)
    this.historyItems.forEach((item, index) => {
      const restoreBtn = document.getElementById(`history-restore-${index}`);
      if (restoreBtn) {
        restoreBtn.addEventListener('click', (e) => {
          e.stopPropagation(); // Prevent triggering the expand/collapse
          this.restoreFromHistory(item.data);
        });
      }
    });
    
    // Add click handlers for the Show More buttons in history tables
    document.querySelectorAll('.show-more-history-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent event bubbling
        
        const hiddenRows = document.getElementById(btn.dataset.target);
        const historyId = btn.dataset.historyId;
        
        if (hiddenRows.style.display === "none") {
          // Show the hidden rows
          hiddenRows.style.display = "table-row-group";
          btn.textContent = "Show Less";
          this.expandedHistoryTables.add(historyId);
        } else {
          // Hide the rows again
          hiddenRows.style.display = "none";
          const rowCount = hiddenRows.querySelectorAll('tr').length;
          btn.textContent = `Show More (${rowCount} more rows)`;
          this.expandedHistoryTables.delete(historyId);
        }
      });
    });
  }
  
  /**
   * Initialize history if needed
   */
  initHistory() {
    if (this.previousRecords === null) {
      this.previousRecords = "[]";
    }
  }
}

// Export the HistoryManager class
window.HistoryManager = HistoryManager;