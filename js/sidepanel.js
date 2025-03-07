document.addEventListener("DOMContentLoaded", function () {
  // Check if current site is allowed
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    const currentTab = tabs[0];
    if (currentTab && !currentTab.url.startsWith("chrome://")) {
      // Extract just the domain part of the URL
      const url = new URL(currentTab.url);
      const domain = url.hostname;

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

    // Add a flag to track if background sync is in progress
    let syncInProgress = false;
    // Add variable to store the polling interval
    let pollingInterval = null;

    // Initialize history manager
    const historyManager = new HistoryManager(historyContainer, renderTable);

    // Function to handle Excel export via the utility
    function handleExportToExcel() {
      ExcelUtils.exportToExcel(currentClipboardData).catch((error) => {
        alert("Failed to export data: " + error.message);
      });
    }

    // Add click event to export button
    exportButton.addEventListener("click", handleExportToExcel);

    // Function to handle Excel import via the utility
    function handleImportFromExcel() {
      ExcelUtils.importFromExcel()
        .then((clipboardData) => {
          // Update current clipboard data in memory
          currentClipboardData = clipboardData;

          // Update UI by rendering the table
          renderTable(clipboardData);

          // Sync to all trusted domains
          const jsonString = JSON.stringify(clipboardData);
          StorageUtils.updateAcrossTrustedDomains(jsonString)
            .then((result) => {
              console.log("Excel import completed successfully");
              console.log(`Sync status: ${result.message}`);
              alert(`Imported ${clipboardData.length} rows successfully`);
            })
            .catch((error) => {
              console.error("Sync error:", error);
              // Still show success since the import itself worked
              alert(
                `Imported ${clipboardData.length} rows successfully, but sync had issues`,
              );
            });
        })
        .catch((error) => {
          alert("Failed to import Excel data: " + error.message);
        });
    }

    // Add import button next to export button
    function addImportButton() {
      // Create import button with same styling as export
      const importButton = document.createElement("button");
      importButton.id = "import-excel";
      importButton.className = exportButton.className; // Use the same styling
      importButton.textContent = "Import Data";

      // Insert import button before export button
      exportButton.parentNode.insertBefore(importButton, exportButton);

      // Add margin between buttons
      exportButton.style.marginLeft = "10px";

      // Add event listener
      importButton.addEventListener("click", handleImportFromExcel);
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
            const cellValue =
              record[header] !== undefined ? record[header] : "";
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
        document
          .getElementById("show-more-btn")
          .addEventListener("click", function () {
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
      // Skip checking if a sync operation is in progress
      if (syncInProgress) {
        console.log("Sync in progress, skipping storage check");
        return;
      }

      chrome.storage.local.get(
        ["IFS-Aurena-CopyPasteRecordStorage", "TcclClipboardMetadata"],
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
                syncViaBackgroundTab(records, metadata);
              }
            } catch (e) {
              console.error("Error parsing records:", e);
              tableContainer.innerHTML = "<p>Error parsing records</p>";
            }
          } else if (currentClipboardData !== null) {
            // Only update if we previously had data but now don't
            tableContainer.innerHTML = "<p>No records found in storage</p>";
            currentClipboardData = null;
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

    // New function to sync data via a background tab
    function syncViaBackgroundTab(records, metadata) {
      // Set the flag to prevent polling
      syncInProgress = true;

      // First get all trusted domains
      chrome.storage.local.get("allowedDomains", function (result) {
        const allowedDomains = result.allowedDomains || [];

        if (allowedDomains.length === 0) {
          console.log("No trusted domains to sync to");
          syncInProgress = false; // Reset flag since we're done
          return;
        }

        // Get all tabs to find ones that match our trusted domains
        chrome.tabs.query({}, function (tabs) {
          const trustedTabs = tabs.filter((tab) => {
            if (
              !tab.url ||
              (!tab.url.startsWith("http://") &&
                !tab.url.startsWith("https://"))
            ) {
              return false;
            }

            try {
              const url = new URL(tab.url);
              const hostname = url.hostname;

              // Check if tab belongs to a trusted domain
              for (const domain of allowedDomains) {
                if (hostname.includes(domain) || domain.includes(hostname)) {
                  // Skip tabs that already have our sync fragment
                  if (tab.url.includes("#ifs-clipboard-sync")) {
                    return false;
                  }
                  return true;
                }
              }
              return false;
            } catch (e) {
              return false;
            }
          });

          // If no trusted tabs, reset flag and exit
          if (trustedTabs.length === 0) {
            console.log("No trusted tabs to sync to");
            syncInProgress = false;
            return;
          }

          // Track how many sync operations are completed
          let syncOperationsTotal = trustedTabs.length;
          let syncOperationsCompleted = 0;

          // Process each trusted tab
          trustedTabs.forEach((tab) => {
            // Create a new URL with our sync fragment
            const syncUrl = tab.url + "/#ifs-clipboard-sync";

            // Create a background tab with the sync URL
            chrome.tabs.create(
              { url: syncUrl, active: false },
              function (newTab) {
                // Execute script to update localStorage in this background tab
                chrome.scripting.executeScript(
                  {
                    target: { tabId: newTab.id },
                    function: function (data, meta) {
                      try {
                        // Update localStorage with our data
                        localStorage.setItem(
                          "IFS-Aurena-CopyPasteRecordStorage",
                          " " + data,
                        );
                        if (meta) {
                          localStorage.setItem("TcclClipboardMetadata", meta);
                        }
                        console.log(
                          "[IFS Clipboard] Sync completed via background tab",
                        );
                        return true;
                      } catch (error) {
                        console.error(
                          "[IFS Clipboard] Background tab sync failed:",
                          error,
                        );
                        return false;
                      }
                    },
                    args: [records, metadata],
                  },
                  () => {
                    // Wait a short time to ensure data is saved before closing
                    setTimeout(() => {
                      // Close the background tab
                      chrome.tabs.remove(newTab.id, function () {
                        console.log(`Background sync tab closed: ${newTab.id}`);

                        // Track completion and reset flag when all operations are done
                        syncOperationsCompleted++;
                        if (syncOperationsCompleted === syncOperationsTotal) {
                          console.log(
                            "All sync operations completed, resuming polling",
                          );
                          syncInProgress = false;
                        }
                      });
                    }, 500);
                  },
                );
              },
            );
          });
        });
      });
    }

    // Make the function available globally for HistoryManager
    window.syncClipboardViaBackgroundTab = function (recordsStr, metadata) {
      syncViaBackgroundTab(recordsStr, metadata);
    };

    function loadTrustedDomains() {
      const domainsContainer = document.getElementById("domains-container");

      chrome.storage.local.get("allowedDomains", function (result) {
        const allowedDomains = result.allowedDomains || [];

        if (allowedDomains.length === 0) {
          domainsContainer.innerHTML = "<p>No trusted domains added yet.</p>";
          return;
        }

        let domainsHtml = '<ul class="domains-list">';
        allowedDomains.forEach((domain) => {
          domainsHtml += `
            <li class="domain-item">
              <span class="domain-name">${domain}</span>
              <button class="domain-remove" data-domain="${domain}">Remove</button>
            </li>
          `;
        });
        domainsHtml += "</ul>";

        domainsContainer.innerHTML = domainsHtml;

        // Add event listeners for remove buttons
        document.querySelectorAll(".domain-remove").forEach((button) => {
          button.addEventListener("click", function () {
            const domainToRemove = this.getAttribute("data-domain");
            removeTrustedDomain(domainToRemove);
          });
        });
      });
    }

    function removeTrustedDomain(domain) {
      chrome.storage.local.get("allowedDomains", function (result) {
        const allowedDomains = result.allowedDomains || [];
        const updatedDomains = allowedDomains.filter((d) => d !== domain);

        chrome.storage.local.set(
          { allowedDomains: updatedDomains },
          function () {
            console.log("Domain removed from trusted list:", domain);
            loadTrustedDomains(); // Reload the list
          },
        );
      });
    }

    // Call this in your initialization
    loadTrustedDomains();

    // Initial check
    checkLocalStorage();

    // Set up polling with the ability to be paused
    pollingInterval = setInterval(checkLocalStorage, 500);
  }
});
