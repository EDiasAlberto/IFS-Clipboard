# Zest IFS Clipboard Sync

Zest IFS Clipboard Sync is a Chrome extension designed to synchronize clipboard data across various instances of IFS databases (e.g., UAT, CFG, etc.). It features a history manager to restore previous clipboard entries, supports Excel sheet import/export, and synchronizes both Excel sheets and history management across tabs. Additionally, it includes domain management that restricts synchronization to approved domains.

## Features

- **Clipboard Synchronization:**  
  Automatically syncs your clipboard data across multiple IFS database instances.

- **History Manager:**  
  Maintains a history of clipboard entries, allowing you to restore previous data.

- **Excel Sheet Import/Export:**  
  Easily import data from, or export data to, Excel sheets.

- **Cross-Tab Synchronization:**  
  Ensures that both the Excel sheets and clipboard history are updated across all open tabs.

- **Domain Management:**  
  Provides a permission screen in the sidebar to "Allow" or "Deny" synchronization on any new domain.

## Installation

Follow these steps to load the extension as an unpacked extension in Chrome or Brave:

1. **Clone or Download the Repository:**
   ```bash
   git clone https://github.com/EDiasAlberto/IFS-Clipboard.git
   ```

2. **Open the Extensions Page:**
   - In Chrome or Brave, navigate to `chrome://extensions/`.

3. **Enable Developer Mode:**
   - Toggle the "Developer mode" switch in the upper right corner of the extensions page.

4. **Load the Unpacked Extension:**
   - Click on the "Load unpacked" button.
   - Select the directory where the repository was cloned or extracted.

## Usage Instructions

### Synchronizing Clipboard Data

1. **Copy Your Data:**
   - Simply copy any data to your clipboard as you normally would.
   
2. **Automatic Synchronization:**
   - The extension will synchronize this data across your IFS database instances.
   
3. **Known Issue:**
   - **Important:** Please wait for any tabs opened by the extension to be closed before copying new data or opening new tabs. This is a known issue and is currently being addressed.

### Managing Clipboard History

1. **Open History Manager:**
   - Click on the extension icon to open the history manager interface.

2. **Browse and Restore:**
   - Navigate through the list of previous clipboard entries.
   - Click on an entry to restore it as your current clipboard content.

### Excel Sheet Import/Export

1. **Access the Import/Export Section:**
   - Open the dedicated section within the extension interface for Excel sheet operations.

2. **Importing:**
   - Follow the on-screen instructions to import data from an Excel sheet.

3. **Exporting:**
   - Export your clipboard history or data to an Excel file using the provided options.

4. **Synchronization Across Tabs:**
   - Both Excel data and clipboard history are synchronized in real-time across all open tabs.

### Domain Management

1. **Permission Prompt:**
   - When a new domain is detected, the extension’s sidebar will display a permission screen.

2. **Allow or Deny:**
   - Choose "Allow" to enable synchronization for that domain.
   - Choose "Deny" to block synchronization on that domain.

## Known Issues & Troubleshooting

- **Tab Synchronization Issue:**  
  - **Known Issue:** If tabs opened by the extension are still open, do not copy new data or open new tabs until they have closed. This prevents potential synchronization errors.  
  - **Workaround:** Wait for the extension-managed tabs to close before proceeding with further actions.

- **General Troubleshooting:**
  - If you experience synchronization or data issues, try reloading the extension from `chrome://extensions/`.
  - Check the extension's console logs for errors to help diagnose the problem.
  - For additional support, review the [GitHub Issues](https://github.com/EDiasAlberto/IFS-Clipboard/issues) page for similar reports and potential fixes.

## License

This extension is proprietary.  
© EDiasAlberto, [2025].  
*Inspired by the "Techris IFS Clipboard Sync Extension".*

## Contributing

Contributions are welcome, please follow good practice with clear commit messages and incremental commits.

## More Information

For further details and updates, please visit the [GitHub repository](https://github.com/EDiasAlberto/IFS-Clipboard).
