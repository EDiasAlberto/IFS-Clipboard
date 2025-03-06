document.addEventListener('DOMContentLoaded', function() {
  const allowButton = document.getElementById('allow-button');
  const denyButton = document.getElementById('deny-button');
  const siteUrlElement = document.getElementById('site-url');
  
  console.log("Permission page loaded, checking current tab");
  
  // Get current tab information immediately when this page loads
  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    const currentTab = tabs[0];
    if (currentTab && currentTab.url && 
        !currentTab.url.startsWith('chrome://') && 
        !currentTab.url.startsWith('chrome-extension://')) {
      
      // Extract and display just the domain part of the URL
      const url = new URL(currentTab.url);
      const domain = url.hostname;
      siteUrlElement.textContent = domain;
      console.log("Current domain for permission request:", domain);
      
      // Try to get the site favicon
      if (currentTab.favIconUrl) {
        document.getElementById('site-icon').src = currentTab.favIconUrl;
      }
      
      // Add IFS domain class if this is an IFS domain
      if (domain.includes('ifs.cloud')) {
        siteUrlElement.classList.add('ifs-domain');
      }
    } else {
      siteUrlElement.textContent = 'Unknown site';
      console.log("Unable to determine current site");
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
            chrome.storage.local.set({ allowedDomains: allowedDomains }, function() {
              console.log('Domain added to allowed list:', domain);
              // Log the current list for debugging
              console.log('Current allowed domains:', allowedDomains);
            });
          }
          
          // Notify service worker that permission has been granted
          chrome.runtime.sendMessage({action: "domainPermissionGranted"}, function(response) {
            if (response && response.success) {
              // Redirect to main sidepanel - the service worker will handle this
              window.location.href = '/html/sidepanel.html';
            }
          });
        });
      } else {
        console.error("Cannot grant permission: invalid tab or URL");
        alert("Unable to grant permission. Please try again on a valid web page.");
      }
    });
  });
  
  // Handle deny button click
  denyButton.addEventListener('click', function() {
    // Show access denied message
    document.querySelector('.container').innerHTML = `
      <div class="header">Access Denied</div>
      <div class="message">
        <p>You've denied clipboard access for this site.</p>
        <p>You can close this panel and reopen it if you change your mind.</p>
      </div>
    `;
  });
});