// This script runs in the context of the web page
function findMemoryUsageElement() {
  // Try to find the specific div with text "Memory Usage"
  const memoryUsageElements = Array.from(
    document.querySelectorAll("div.text-sm.text-gray-400"),
  );

  for (const element of memoryUsageElements) {
    if (element.textContent.includes("CPU Usage")) {
      // Found the Memory Usage element, now look for the percentage
      // Look for the next div with font-mono and text-lg classes
      const parentElement = element.parentElement;
      if (parentElement) {
        const percentageElement = parentElement.querySelector(
          "div.font-mono.text-lg",
        );
        if (percentageElement) {
          // Extract the percentage value
          return percentageElement.textContent.trim();
        }
      }
    }
  }

  // Fallback method if the above doesn't work
  // Find all text nodes in the document
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    null,
    false,
  );

  let node;
  while ((node = walker.nextNode())) {
    // Check if the text contains "Memory usage"
    if (node.nodeValue.includes("CPU Usage")) {
      let element = node.parentNode;

      // Get the parent container that might contain the percentage
      const parentContainer = element.parentNode;

      // Look for the percentage value in siblings
      if (parentContainer) {
        const siblings = Array.from(parentContainer.childNodes);
        for (const sibling of siblings) {
          if (
            sibling.textContent &&
            /\d+(\.\d+)?%?/.test(sibling.textContent)
          ) {
            return sibling.textContent.trim();
          }
        }

        // If not found in direct siblings, try to look deeper
        const percentageElement =
          parentContainer.querySelector(".font-mono.text-lg");
        if (percentageElement) {
          return percentageElement.textContent.trim();
        }

        // Return the entire parent container as fallback
        return parentContainer.innerHTML;
      }

      return element.innerHTML;
    }
  }

  return null;
}

// Return the memory usage information
findMemoryUsageElement();
