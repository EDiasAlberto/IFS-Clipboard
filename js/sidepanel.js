document.addEventListener("DOMContentLoaded", function () {
  // Reference to the table container
  const tableContainer = document.getElementById("clipboard-data-table");

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
  }

  // Function to check for updates in local storage
  function checkLocalStorage() {
    chrome.storage.local.get(
      "IFS-Aurena-CopyPasteRecordStorage",
      function (result) {
        const records = result["IFS-Aurena-CopyPasteRecordStorage"];
        if (records) {
          renderTable(JSON.parse(records));
        } else {
          tableContainer.innerHTML = "<p>No records found in storage</p>";
        }
      },
    );
  }

  // Initial check
  checkLocalStorage();

  // Set up polling every 500ms
  setInterval(checkLocalStorage, 500);
});
