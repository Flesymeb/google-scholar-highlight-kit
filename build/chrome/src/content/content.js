// Google Scholar Author Highlighter - Content Script (Main Orchestrator)
(function () {
  // Guard to prevent script from running multiple times
  if (window.googleScholarAuthorHighlighterLoaded) {
    return;
  }
  window.googleScholarAuthorHighlighterLoaded = true;

  // This will hold the "highlight name" state for this specific tab.
  let highlightNameStateForThisTab = false;
  let lastAuthorEnrichmentStarted = false;
  let filterRefreshScheduled = false;

  // This function will be called by the UI manager to update the tab's state.
  function setHighlightNameState(isEnabled) {
    highlightNameStateForThisTab = isEnabled;
    // Persist the state for future sessions and refreshes.
    window.storageHelper.set({ highlightName: isEnabled });
    // Apply the visual change immediately on this tab.
    window.nameHighlighter.highlightAuthorNames(isEnabled);
  }

  // Main highlighting function that coordinates modules
  function highlightAuthors(papers) {
    // If papers are provided (from a mutation observer), process them.
    // Otherwise, process all papers on the page (initial load).
    const papersToProcess = papers || document.querySelectorAll('.gsc_a_tr');

    window.highlighterModule.highlightAuthors(papersToProcess, function () {
      // Apply filters after highlighting is complete.
      window.storageHelper.get(['filters'], function (result, error) {
        const filters = (error || !result.filters)
          ? { first: true, second: true, coFirst: true, last: true }
          : result.filters;

        // Refresh year dropdowns as new papers might have been added
        window.uiManager.populateYearDropdowns();

        window.filterManager.applyFilters(filters);

        // Apply author name highlighting using the tab-specific state.
        window.nameHighlighter.highlightAuthorNames(highlightNameStateForThisTab);
      });
    });
  }

  function refreshCurrentFilters() {
    if (filterRefreshScheduled) return;
    filterRefreshScheduled = true;
    const schedule = window.requestAnimationFrame || ((callback) => setTimeout(callback, 0));
    schedule(() => {
      filterRefreshScheduled = false;
      window.storageHelper.get(['filters'], function (result, error) {
        const filters = (error || !result.filters)
          ? { first: true, second: true, coFirst: true, corresponding: true, last: true }
          : result.filters;
        window.filterManager.applyFilters(filters);
      });
    });
  }

  function enrichLastAuthors() {
    if (lastAuthorEnrichmentStarted || !window.lastAuthorEnricher) return;
    lastAuthorEnrichmentStarted = true;
    window.lastAuthorEnricher.enrichPage({ onUpdated: refreshCurrentFilters }).then((result) => {
      const page = document.documentElement;
      page.dataset.authorHighlighterEnrichment = result?.reason || 'unknown';
      page.dataset.authorHighlighterCredits = String(result?.creditsUsed || 0);
    }).catch(() => {
      document.documentElement.dataset.authorHighlighterEnrichment = 'unavailable';
    });
  }

  // Initialize extension
  function initializeExtension() {
    // The start function now passes the initial state and the update function to the UI.
    const start = () => {
      window.uiManager.injectFilterUI(highlightNameStateForThisTab, setHighlightNameState);
      if (window.shareManager) {
        window.shareManager.injectShareUI();
      }
      highlightAuthors();
      window.domObserver.observePaperChanges(highlightAuthors);
    };

    const profileContainer = document.querySelector('#gsc_prf_w');

    // Get the initial state from storage once on page load.
    window.storageHelper.get('highlightName', function (result, error) {
      highlightNameStateForThisTab = (error || typeof result.highlightName === 'undefined') ? false : result.highlightName;

      if (profileContainer) {
        start();
      } else {
        window.domObserver.observeInitialLoad(start);
      }
    });
  }

  // Initial run
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeExtension);
  } else {
    initializeExtension();
  }

  // Listen for messages from the popup
  try {
    if (chrome && chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'toggleVisibility') {
          window.filterManager.togglePaperVisibility(request.showOnlyHighlighted);
        } else if (request.action === 'updateFilters') {
          window.filterManager.applyFilters(request.filters);
          window.storageHelper.get('showOnlyHighlighted', function (result, error) {
            const showOnlyHighlighted = (error || !result.showOnlyHighlighted) ? false : result.showOnlyHighlighted;
            window.filterManager.togglePaperVisibility(showOnlyHighlighted);
          });
        }
      });
    }
  } catch (e) {
    console.warn('Error setting up message listener:', e);
  }

  // Make highlightAuthors globally available for showMoreClicker.js
  window.highlightAuthors = highlightAuthors;
  window.enrichLastAuthors = enrichLastAuthors;
})();
