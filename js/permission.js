document.addEventListener('DOMContentLoaded', function() {
  const allowButton = document.getElementById('allow-button');
  const denyButton = document.getElementById('deny-button');
  const siteUrlElement = document.getElementById('site-url');
  
  // Send message to check permission status on page load
  chrome.runtime.sendMessage({action: "checkPermission"});
  
  // Get current tab information
  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    const currentTab = tabs[0];
    if (currentTab) {
      // Display site URL
      const url = new URL(currentTab.url);
      siteUrlElement.textContent = url.hostname;
      
      // Try to get the site favicon
      if (currentTab.favIconUrl) {
        document.getElementById('site-icon').src = currentTab.favIconUrl;
      }
    } else {
      siteUrlElement.textContent = 'Unknown site';
    }
  });
  
  // Handle allow button click
  allowButton.addEventListener('click', function() {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      const currentTab = tabs[0];
      if (currentTab) {
        // Get existing allowed domains
        chrome.storage.local.get('allowedDomains', function(result) {
          const allowedDomains = result.allowedDomains || [];
          const url = new URL(currentTab.url);
          const domain = url.hostname;
          
          // Add domain if not already in list
          if (!allowedDomains.includes(domain)) {
            allowedDomains.push(domain);
            chrome.storage.local.set({ allowedDomains: allowedDomains }, function() {
              console.log('Domain added to allowed list:', domain);
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