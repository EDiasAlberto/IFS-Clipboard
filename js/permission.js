document.addEventListener('DOMContentLoaded', function() {
  const allowButton = document.getElementById('allow-button');
  const denyButton = document.getElementById('deny-button');
  const siteUrlElement = document.getElementById('site-url');
  
  console.log("Permission page loaded, checking current tab");
  
  // Extract the code that updates the UI into a reusable function
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
  
  // Get current tab information when the page loads
  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    if (tabs && tabs.length > 0) {
      updatePermissionUI(tabs[0]);
    }
  });
  
  // Listen for tab changes and update the UI
  chrome.tabs.onActivated.addListener(function(activeInfo) {
    chrome.tabs.get(activeInfo.tabId, function(tab) {
      updatePermissionUI(tab);
    });
  });
  
  // Also listen for tab updates (URL changes in the same tab)
  chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
    if (changeInfo.status === 'complete') {
      chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        if (tabs && tabs.length > 0 && tabs[0].id === tabId) {
          updatePermissionUI(tab);
        }
      });
    }
  });
  
  // Handle allow button click
  allowButton.addEventListener('click', function() {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      const currentTab = tabs[0];
      if (currentTab && currentTab.url && 
          !currentTab.url.startsWith('chrome://') &&
          !currentTab.url.startsWith('chrome-extension://')) {
        
        // Extract just the domain part of the URL
        const url = new URL(currentTab.url);
        // Use the full hostname to ensure proper cross-domain matching
        const domain = url.hostname; 
        
        // Get existing allowed domains
        chrome.storage.local.get('allowedDomains', function(result) {
          const allowedDomains = result.allowedDomains || [];
          
          // Add domain if not already in list
          if (!allowedDomains.includes(domain)) {
            allowedDomains.push(domain);
            
            // Save updated list
            chrome.storage.local.set({allowedDomains: allowedDomains}, function() {
              console.log('Domain added to trusted list:', domain);
              
              // Notify the service worker that permission has been granted
              chrome.runtime.sendMessage({
                action: "domainPermissionGranted", 
                domain: domain
              }, function(response) {
                console.log("Permission granted response:", response);
              });
            });
          } else {
            console.log('Domain already in trusted list:', domain);
            
            // Still notify the service worker (in case user re-allows an already allowed domain)
            chrome.runtime.sendMessage({
              action: "domainPermissionGranted", 
              domain: domain
            });
          }
        });
      }
    });
  });
  
  // Handle deny button click
  denyButton.addEventListener('click', function() {
    // Just close the sidebar or take other appropriate action
    console.log("Permission denied by user");
    // You may want to add specific deny behavior here
  });
});