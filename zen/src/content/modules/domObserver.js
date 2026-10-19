// DOM Observer - Manages MutationObservers for dynamic content
window.domObserver = (function() {
  'use strict';

  // Utility to prevent a function from being called too frequently
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  function observeInitialLoad(onProfileFound) {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          const profileContainer = document.querySelector('#gsc_prf_w');
          if (profileContainer && !document.getElementById('author-highlighter-controls')) {
            onProfileFound();
            observer.disconnect(); // Stop observing once we've found the profile
            break;
          }
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    return observer;
  }

  function observePaperChanges(onPapersChanged) {
    const paperContainer = document.querySelector('#gsc_a_b');
    if (paperContainer) {
      // Debounce the handler to avoid rapid-fire processing
      const debouncedHandler = debounce(onPapersChanged, 150);

      const paperObserver = new MutationObserver((mutations) => {
        const addedNodes = [];
        for (const mutation of mutations) {
          if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
            mutation.addedNodes.forEach(node => {
              // We only care about element nodes that are actual paper rows
              if (node.nodeType === Node.ELEMENT_NODE && node.matches('.gsc_a_tr')) {
                addedNodes.push(node);
              }
            });
          }
        }
        if (addedNodes.length > 0) {
          // Pass only the new nodes to the handler
          debouncedHandler(addedNodes);
        }
      });

      // Observe only direct children, no need for subtree
      paperObserver.observe(paperContainer, { childList: true });
      return paperObserver;
    } else {
      console.error('Could not find paper container');
      return null;
    }
  }

  return {
    observeInitialLoad,
    observePaperChanges
  };
})();

