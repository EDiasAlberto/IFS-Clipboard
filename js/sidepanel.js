/**
 * Side panel implementation for IFS Clipboard Extension
 * Provides UI for viewing and managing clipboard data across trusted domains
 */

/**
 * Initialize the side panel when DOM is fully loaded
 * @listens DOMContentLoaded
 */
document.addEventListener("DOMContentLoaded", function () {
  /**
   * Check if current site is allowed to use the extension
   * Redirects to permission page if site is not trusted
   */
  chrome.tabs.query(
    { active: true, currentWindow: true },
    /**
     * Callback after retrieving the active tab
     * @param {Array<chrome.tabs.Tab>} tabs - Array of matching tabs (should be length 1)
     */
    function (tabs) {
      const currentTab = tabs[0];
      if (currentTab && !currentTab.url.startsWith("chrome://")) {
        // Extract just the domain part of the URL
        const url = new URL(currentTab.url);
        const domain = url.hostname;

        /**
         * Callback after retrieving allowed domains from storage
         * @param {Object} result - Storage result containing allowedDomains
         * @param {Array<string>} [result.allowedDomains] - List of allowed domains
         */
        chrome.storage.local.get("allowedDomains", function (result) {
          const allowedDomains = result.allowedDomains || [];

          if (!allowedDomains.includes(domain)) {
            // If somehow reached this page without permission, redirect back
            window.location.href = "/html/permission.html";
            return;
          }

          // Continue with the rest of your sidepanel initialization
          initializeSidePanel();
        });
      } else {
        // For chrome:// URLs or when no tab is active
        initializeSidePanel();
      }
    },
  );

  /**
   * Main function to initialize the side panel UI and functionality
   * Sets up event listeners, clipboard monitoring, and data display
   */
  function initializeSidePanel() {
    // Reference to containers and buttons
    const tableContainer = document.getElementById("clipboard-data-table");
    const historyContainer = document.getElementById("history-container");
    const exportButton = document.getElementById("export-excel");
    const importButton = document.getElementById("import-excel");
    const clearButton = document.getElementById("clear-clipboard");

    // Current clipboard data
    let currentClipboardData = null;

    // Track expanded state of main table
    let mainTableExpanded = false;

    // Add a flag to track if background sync is in progress
    let syncInProgress = false;
    // Add variable to store the polling interval
    let pollingInterval = null;

    // Initialize history manager
    const historyManager = new HistoryManager(historyContainer, renderTable);

    /**
     * Handles clearing the clipboard data
     * Removes data from storage and syncs the change across tabs
     * @listens click
     */
    function handleClearClipboard() {
      // Confirm before clearing
      if (confirm("Are you sure you want to clear all clipboard data?")) {
        // Set empty data
        currentClipboardData = [];
        
        // Update UI
        renderTable([]);
        
        // Create empty JSON string for syncing
        const emptyData = JSON.stringify([]);
        
        // Save to local storage first
        chrome.storage.local.set({ "IFS-Aurena-CopyPasteRecordStorage": emptyData }, function() {
          console.log("Clipboard data cleared locally");
          
          // Sync to all tabs
          syncViaBackgroundTab(emptyData, null);
          
          // Add to history with a special note
          historyManager.addHistoryItem({
            timestamp: new Date(),
            records: [],
            operation: "clear"
          });
        });
      }
    }
    
    // Add click event to clear button
    clearButton.addEventListener("click", handleClearClipboard);

    /**
     * Handles exporting current clipboard data to Excel
     * Uses the ExcelUtils utility to perform the export
     * @listens click
     */
    function handleExportToExcel() {
      ExcelUtils.exportToExcel(currentClipboardData).catch(
        /**
         * Error handler for export failures
         * @param {Error} error - The export error
         */
        (error) => {
          alert("Failed to export data: " + error.message);
        },
      );
    }

    // Add click event to export button
    exportButton.addEventListener("click", handleExportToExcel);

    /**
     * Handles importing clipboard data from Excel
     * Uses the ExcelUtils utility to perform the import
     * @listens click
     */
    function handleImportFromExcel() {
      ExcelUtils.importFromExcel()
        .then(
          /**
           * Success handler for import
           * @param {Array<Object>} clipboardData - The imported data
           */
          (clipboardData) => {
            // Update current clipboard data in memory
            currentClipboardData = clipboardData;

            // Update UI by rendering the table
            renderTable(clipboardData);

            // Sync to all trusted domains
            const jsonString = JSON.stringify(clipboardData);
            StorageUtils.updateAcrossTrustedDomains(jsonString)
              .then(
                /**
                 * Success handler for sync operation
                 * @param {Object} result - The sync result
                 * @param {boolean} result.success - Whether sync was successful
                 * @param {string} result.message - Status message
                 */
                (result) => {
                  console.log("Excel import completed successfully");
                  console.log(`Sync status: ${result.message}`);
                  alert(`Imported ${clipboardData.length} rows successfully`);
                },
              )
              .catch(
                /**
                 * Error handler for sync failures
                 * @param {Error} error - The sync error
                 */
                (error) => {
                  console.error("Sync error:", error);
                  // Still show success since the import itself worked
                  alert(
                    `Imported ${clipboardData.length} rows successfully, but sync had issues`,
                  );
                },
              );
          },
        )
        .catch(
          /**
           * Error handler for import failures
           * @param {Error} error - The import error
           */
          (error) => {
            alert("Failed to import Excel data: " + error.message);
          },
        );
    }

    // Add click event to import button
    importButton.addEventListener("click", handleImportFromExcel);

    /**
     * Renders the clipboard data table in the UI
     * Handles empty states, table headers, and "Show More" functionality
     * @param {Array<Object>} records - The clipboard records to display
     */
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
      headers.forEach(
        /**
         * Process each header for the table
         * @param {string} header - The header name
         */
        (header) => {
          tableHTML += `<th style="padding: 8px; text-align: left; border-bottom: 2px solid #ddd;">${header}</th>`;
        },
      );
      tableHTML += "</tr>";

      // Determine if we need to show the "Show More" button
      const initialRowsToShow = 3;
      const needsShowMore = records.length > initialRowsToShow;

      // Create data rows for the initial visible set
      records.slice(0, initialRowsToShow).forEach(
        /**
         * Process each record for the visible rows
         * @param {Object} record - The clipboard record
         */
        (record) => {
          tableHTML += "<tr>";
          headers.forEach(
            /**
             * Process each cell in the row
             * @param {string} header - The column header
             */
            (header) => {
              const cellValue =
                record[header] !== undefined ? record[header] : "";
              tableHTML += `<td style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">${cellValue}</td>`;
            },
          );
          tableHTML += "</tr>";
        },
      );

      // Create data rows for the hidden set (with a different class)
      if (needsShowMore) {
        // Use the saved expanded state to determine initial display
        const hiddenStyle = mainTableExpanded ? "table-row-group" : "none";
        tableHTML += `<tbody id="hidden-rows" style="display: ${hiddenStyle};">`;
        records.slice(initialRowsToShow).forEach(
          /**
           * Process each record for the hidden rows
           * @param {Object} record - The clipboard record
           */
          (record) => {
            tableHTML += "<tr>";
            headers.forEach(
              /**
               * Process each cell in the hidden row
               * @param {string} header - The column header
               */
              (header) => {
                const cellValue =
                  record[header] !== undefined ? record[header] : "";
                tableHTML += `<td style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">${cellValue}</td>`;
              },
            );
            tableHTML += "</tr>";
          },
        );
        tableHTML += `</tbody>`;
      }

      // Close the table
      tableHTML += "</table>";

      // Add a "Show More" button if needed
      if (needsShowMore) {
        const buttonText = mainTableExpanded
          ? "Show Less"
          : `Show More (${records.length - initialRowsToShow} more rows)`;

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
        document.getElementById("show-more-btn").addEventListener(
          "click",
          /**
           * Handles the show more/less button click
           * Toggles visibility of additional rows
           * @param {Event} event - Click event
           * @listens click
           */
          function () {
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
          },
        );
      } else {
        // Reset expanded state if there are no rows to show
        mainTableExpanded = false;
      }

      // Update history if records have changed
      historyManager.updateHistory(records);
    }

    /**
     * Checks for clipboard data updates in extension storage
     * Updates UI and syncs with other tabs when changes are detected
     */
    function checkLocalStorage() {
      // Skip checking if a sync operation is in progress
      if (syncInProgress) {
        console.log("Sync in progress, skipping storage check");
        return;
      }

      chrome.storage.local.get(
        ["IFS-Aurena-CopyPasteRecordStorage", "TcclClipboardMetadata"],
        /**
         * Callback after retrieving clipboard data from storage
         * @param {Object} result - Storage items retrieved
         * @param {string} [result.IFS-Aurena-CopyPasteRecordStorage] - Clipboard data JSON string
         * @param {string} [result.TcclClipboardMetadata] - Metadata JSON string
         */
        function (result) {
          const records = result["IFS-Aurena-CopyPasteRecordStorage"];
          const metadata = result["TcclClipboardMetadata"];

          if (records) {
            try {
              const parsedRecords = JSON.parse(records);

              // Compare with current data to avoid unnecessary updates
              const currentDataStr = JSON.stringify(currentClipboardData);
              const newDataStr = JSON.stringify(parsedRecords);

              // Only update if data has changed
              if (currentDataStr !== newDataStr) {
                console.log("Clipboard data changed, updating UI");

                // Store the current data for export functionality
                currentClipboardData = parsedRecords;

                // Update UI
                renderTable(parsedRecords);

                // Sync using background tab approach instead of direct sync
                if (!metadata) {
                  console.log("what is going on ");
                }
                syncViaBackgroundTab(records, metadata);
              }
            } catch (e) {
              console.error("Error parsing records:", e);
              tableContainer.innerHTML = "<p>Error parsing records</p>";
            }
          } else if (currentClipboardData !== null) {
            // Only update if we previously had data but now don't
            tableContainer.innerHTML = "<p>No records found in storage</p>";
            // Initialize history if no previous records
            historyManager.initHistory();
          } else if (!tableContainer.innerHTML) {
            // Initialize if table is empty
            tableContainer.innerHTML = "<p>No records found in storage</p>";
            // Initialize history if no previous records
            historyManager.initHistory();
          }
        },
      );
    }

    /**
     * Syncs clipboard data to all trusted domains using background tabs
     * Creates temporary tabs for each trusted domain to update their localStorage
     * @param {string} records - JSON string of clipboard records
     * @param {string} metadata - JSON string of clipboard metadata
     */
    function syncViaBackgroundTab(records, metadata) {
      // Set the flag to prevent polling
      syncInProgress = true;

      // Use the shared sync function with background tabs
      ClipboardSync.syncClipboardToTrustedDomains(records, metadata, {
        useBackgroundTabs: true,
        onComplete: function(results) {
          // Reset the flag when all operations are done
          console.log("Sync operations completed:", results);
          syncInProgress = false;
        }
      });
    }

    /**
     * Makes the background tab sync function available globally
     * Used by other modules like HistoryManager
     * @param {string} recordsStr - JSON string of clipboard records
     * @param {string} metadata - JSON string of clipboard metadata
     */
    window.syncClipboardViaBackgroundTab = function (recordsStr, metadata) {
      syncViaBackgroundTab(recordsStr, metadata);
    };

    /**
     * Loads and displays the list of trusted domains
     * Renders the domains with remove buttons
     */
    function loadTrustedDomains() {
      const domainsContainer = document.getElementById("domains-container");

      chrome.storage.local.get(
        "allowedDomains",
        /**
         * Callback after retrieving allowed domains
         * @param {Object} result - Storage result containing allowedDomains
         * @param {Array<string>} [result.allowedDomains] - List of allowed domains
         */
        function (result) {
          const allowedDomains = result.allowedDomains || [];

          if (allowedDomains.length === 0) {
            domainsContainer.innerHTML = "<p>No trusted domains added yet.</p>";
            return;
          }

          let domainsHtml = '<ul class="domains-list">';
          allowedDomains.forEach(
            /**
             * Process each domain for display
             * @param {string} domain - Domain name
             */
            (domain) => {
              domainsHtml += `
                <li class="domain-item">
                  <span class="domain-name">${domain}</span>
                  <button class="domain-remove" data-domain="${domain}">Remove</button>
                </li>
              `;
            },
          );
          domainsHtml += "</ul>";

          domainsContainer.innerHTML = domainsHtml;

          // Add event listeners for remove buttons
          document.querySelectorAll(".domain-remove").forEach(
            /**
             * Add click handler to each remove button
             * @param {HTMLElement} button - Remove button element
             */
            (button) => {
              button.addEventListener(
                "click",
                /**
                 * Handle click on remove domain button
                 * @param {Event} event - Click event
                 * @listens click
                 */
                function () {
                  const domainToRemove = this.getAttribute("data-domain");
                  removeTrustedDomain(domainToRemove);
                },
              );
            },
          );
        },
      );
    }

    /**
     * Removes a domain from the trusted domains list
     * Updates storage and refreshes the domains display
     * @param {string} domain - Domain to remove from trusted list
     */
    function removeTrustedDomain(domain) {
      chrome.storage.local.get(
        "allowedDomains",
        /**
         * Callback after retrieving allowed domains
         * @param {Object} result - Storage result containing allowedDomains
         * @param {Array<string>} [result.allowedDomains] - List of allowed domains
         */
        function (result) {
          const allowedDomains = result.allowedDomains || [];
          const updatedDomains = allowedDomains.filter(
            /**
             * Filter function to remove the specified domain
             * @param {string} d - Domain to check
             * @returns {boolean} Whether to keep this domain
             */
            (d) => d !== domain,
          );

          chrome.storage.local.set(
            { allowedDomains: updatedDomains },
            /**
             * Callback after saving updated domains
             */
            function () {
              console.log("Domain removed from trusted list:", domain);
              loadTrustedDomains(); // Reload the list
            },
          );
        },
      );
    }

    // Call this in your initialization
    loadTrustedDomains();

    // Initial check
    checkLocalStorage();

    // Set up polling with the ability to be paused
    pollingInterval = setInterval(checkLocalStorage, 500);
  }
});
