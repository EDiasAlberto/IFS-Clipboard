/**
 * Permission management for IFS Clipboard Extension
 * Handles UI for allowing/denying domains for clipboard sync
 */

/**
 * Initializes the permission UI and sets up event listeners
 * Executed when the DOM is fully loaded
 * @listens DOMContentLoaded
 */
document.addEventListener('DOMContentLoaded', function() {
  const allowButton = document.getElementById('allow-button');
  const denyButton = document.getElementById('deny-button');
  const siteUrlElement = document.getElementById('site-url');
  
  console.log("Permission page loaded, checking current tab");
  
  /**
   * Updates the permission UI based on the current tab
   * @param {chrome.tabs.Tab} tab - The tab object to extract information from
   */
  function updatePermissionUI(tab) {
    if (tab && tab.url && 
        !tab.url.startsWith('chrome://') && 
        !tab.url.startsWith('chrome-extension://')) {
      
      // Extract and display just the domain part of the URL
      const url = new URL(tab.url);
      const domain = url.hostname;
      siteUrlElement.textContent = domain;
      console.log("Updated domain for permission request:", domain);
      
      // Try to get the site favicon
      if (tab.favIconUrl) {
        document.getElementById('site-icon').src = tab.favIconUrl;
      } else {
        document.getElementById('site-icon').src = "/img/globe-icon.svg";
      }
      
      // Add IFS domain class if this is an IFS domain
      if (domain.includes('ifs.cloud')) {
        siteUrlElement.classList.add('ifs-domain');
      } else {
        siteUrlElement.classList.remove('ifs-domain');
      }
    } else {
      siteUrlElement.textContent = 'Unknown site';
      document.getElementById('site-icon').src = "/img/globe-icon.svg";
      siteUrlElement.classList.remove('ifs-domain');
      console.log("Unable to determine current site");
    }
  }
  
  /**
   * Callback that handles tab query results on page load
   * @param {Array<chrome.tabs.Tab>} tabs - Array of tab objects matching the query
   */
  function handleInitialTabQuery(tabs) {
    if (tabs && tabs.length > 0) {
      updatePermissionUI(tabs[0]);
    }
  }
  
  // Get current tab information when the page loads
  chrome.tabs.query({ active: true, currentWindow: true }, handleInitialTabQuery);
  
  /**
   * Handles tab activation events
   * @param {Object} activeInfo - Information about the activated tab
   * @param {number} activeInfo.tabId - ID of the activated tab
   * @listens chrome.tabs.onActivated
   */
  function handleTabActivation(activeInfo) {
    /**
     * Callback for tab.get operation
     * @param {chrome.tabs.Tab} tab - The retrieved tab object
     */
    function onTabRetrieved(tab) {
      updatePermissionUI(tab);
    }
    
    chrome.tabs.get(activeInfo.tabId, onTabRetrieved);
  }
  
  // Listen for tab changes and update the UI
  chrome.tabs.onActivated.addListener(handleTabActivation);
  
  /**
   * Handles tab update events (URL changes in the same tab)
   * @param {number} tabId - The ID of the updated tab
   * @param {Object} changeInfo - Information about the change
   * @param {chrome.tabs.Tab} tab - The updated tab object
   * @listens chrome.tabs.onUpdated
   */
  function handleTabUpdate(tabId, changeInfo, tab) {
    if (changeInfo.status === 'complete') {
      /**
       * Callback for active tab query
       * @param {Array<chrome.tabs.Tab>} tabs - Array of tab objects matching the query
       */
      function checkIfActiveTab(tabs) {
        if (tabs && tabs.length > 0 && tabs[0].id === tabId) {
          updatePermissionUI(tab);
        }
      }
      
      chrome.tabs.query({ active: true, currentWindow: true }, checkIfActiveTab);
    }
  }
  
  // Also listen for tab updates
  chrome.tabs.onUpdated.addListener(handleTabUpdate);
  
  /**
   * Handles click on the allow button
   * Adds current domain to trusted domains list
   * @listens click
   */
  function handleAllowClick() {
    /**
     * Callback for active tab query
     * @param {Array<chrome.tabs.Tab>} tabs - Array of tab objects matching the query
     */
    function processTrustedDomain(tabs) {
      const currentTab = tabs[0];
      if (currentTab && currentTab.url && 
          !currentTab.url.startsWith('chrome://') &&
          !currentTab.url.startsWith('chrome-extension://')) {
        
        // Extract just the domain part of the URL
        const url = new URL(currentTab.url);
        // Use the full hostname to ensure proper cross-domain matching
        const domain = url.hostname; 
        
        /**
         * Callback after retrieving allowed domains from storage
         * @param {Object} result - Storage result containing allowedDomains
         */
        function updateAllowedDomains(result) {
          const allowedDomains = result.allowedDomains || [];
          
          // Add domain if not already in list
          if (!allowedDomains.includes(domain)) {
            allowedDomains.push(domain);
            
            /**
             * Callback after saving updated domains list
             */
            function onDomainsSaved() {
              console.log('Domain added to trusted list:', domain);
              
              /**
               * Callback after sending permission granted message
               * @param {Object} response - Response from service worker
               */
              function onPermissionNotified(response) {
                console.log("Permission granted response:", response);
              }
              
              // Notify the service worker that permission has been granted
              chrome.runtime.sendMessage({
                action: "domainPermissionGranted", 
                domain: domain
              }, onPermissionNotified);
            }
            
            // Save updated list
            chrome.storage.local.set({allowedDomains: allowedDomains}, onDomainsSaved);
          } else {
            console.log('Domain already in trusted list:', domain);
            
            // Still notify the service worker (in case user re-allows an already allowed domain)
            chrome.runtime.sendMessage({
              action: "domainPermissionGranted", 
              domain: domain
            });
          }
        }
        
        // Get existing allowed domains
        chrome.storage.local.get('allowedDomains', updateAllowedDomains);
      }
    }
    
    chrome.tabs.query({ active: true, currentWindow: true }, processTrustedDomain);
  }
  
  // Handle allow button click
  allowButton.addEventListener('click', handleAllowClick);
  
  /**
   * Handles click on the deny button
   * Logs the denial and can be extended with additional behavior
   * @listens click
   */
  function handleDenyClick() {
    // Just close the sidebar or take other appropriate action
    console.log("Permission denied by user");
    // You may want to add specific deny behavior here
  }
  
  // Handle deny button click
  denyButton.addEventListener('click', handleDenyClick);
});