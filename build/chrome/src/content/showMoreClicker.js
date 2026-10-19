// Google Scholar Author Highlighter - Show More Clicker
const DEBUG_MODE = false; // Set to true to enable logging

if (DEBUG_MODE) console.log('🔄 Google Scholar Author Highlighter - showMoreClicker.js loaded!');
if (DEBUG_MODE) console.log('Current URL:', window.location.href);
if (DEBUG_MODE) console.log('Document readyState:', document.readyState);

let retryCount = 0;
const MAX_RETRIES = 10;
const STABLE_CHECKS_REQUIRED = 5;
const STABLE_CHECK_INTERVAL_MS = 500;
const INITIAL_CLICK_DELAY_MS = 1000;
const NEXT_CLICK_DELAY_MIN_MS = 1500;
const NEXT_CLICK_DELAY_MAX_MS = 2000;
const APPEND_TIMEOUT_MS = 30000;
let loadingSequenceActive = false;
let loadingFinished = false;
let lastObservedPaperCount = -1;
let stableUnavailableChecks = 0;
let awaitingRowAppend = false;
let rowsBeforeClick = 0;
let appendWaitStartedAt = 0;
let scheduledCheckTimer = null;
let scheduledCheckAt = 0;
let observedShowMoreButton = null;
let nextClickAllowedAt = 0;

function nextClickDelayMs() {
  return NEXT_CLICK_DELAY_MIN_MS + Math.floor(
    Math.random() * (NEXT_CLICK_DELAY_MAX_MS - NEXT_CLICK_DELAY_MIN_MS + 1)
  );
}

const showMoreButtonObserver = new MutationObserver(() => {
  if (loadingSequenceActive && !loadingFinished) scheduleLoadingCheck(0);
});

function observeShowMoreButton(button) {
  if (!button || button === observedShowMoreButton) return;
  showMoreButtonObserver.disconnect?.();
  observedShowMoreButton = button;
  showMoreButtonObserver.observe(button, {
    attributes: true,
    attributeFilter: ['disabled', 'class', 'style']
  });
}

function scheduleLoadingCheck(delay = 0) {
  if (loadingFinished) return;
  const dueAt = Date.now() + delay;
  if (scheduledCheckTimer !== null && scheduledCheckAt <= dueAt) return;
  if (scheduledCheckTimer !== null) clearTimeout(scheduledCheckTimer);
  scheduledCheckAt = dueAt;
  scheduledCheckTimer = setTimeout(() => {
    scheduledCheckTimer = null;
    scheduledCheckAt = 0;
    clickShowMoreUntilAllLoaded();
  }, delay);
}

function waitForStableCompletion() {
  const paperCount = document.querySelectorAll('.gsc_a_tr').length;
  if (paperCount === lastObservedPaperCount) {
    stableUnavailableChecks += 1;
  } else {
    lastObservedPaperCount = paperCount;
    stableUnavailableChecks = 0;
  }

  // Scholar temporarily disables Show more while appending the next page.
  // Wait for the row count to settle so enrichment never starts on a partial
  // profile merely because another loading loop saw that temporary state.
  if (stableUnavailableChecks >= STABLE_CHECKS_REQUIRED) {
    finishLoading();
    return;
  }
  scheduleLoadingCheck(STABLE_CHECK_INTERVAL_MS);
}

function clickShowMoreUntilAllLoaded() {
  if (loadingFinished) return;
  if (DEBUG_MODE) console.log('🔍 clickShowMoreUntilAllLoaded called');
  
  // Multiple possible selectors for the "Show more" button
  const possibleSelectors = [
    '#gsc_bpf_more',
    '.gsc_pgn_pnx',
    'button[onclick*="showMore"]',
    'button[onclick*="bpf_more"]',
    '.gs_btnPR[onclick*="showMore"]',
    '[data-i18n="show_more"]',
    'button:contains("Show more")',
    'button:contains("显示更多")',
    'button:contains("Mostrar más")',
    '.gsc_pgn button',
    '#gsc_pgn_pnx'
  ];
  
  let showMoreButton = null;
  let foundSelector = null;
  
  // Try to find the button using different selectors
  for (const selector of possibleSelectors) {
    try {
      if (selector.includes(':contains(')) {
        // Handle jQuery-style selectors manually
        const text = selector.match(/:contains\("(.+)"\)/)?.[1];
        if (text) {
          const buttons = document.querySelectorAll('button');
          for (const btn of buttons) {
            if (btn.textContent.trim().toLowerCase().includes(text.toLowerCase())) {
              showMoreButton = btn;
              foundSelector = `button containing "${text}"`;
              break;
            }
          }
        }
      } else {
        showMoreButton = document.querySelector(selector);
        if (showMoreButton) {
          foundSelector = selector;
          break;
        }
      }
    } catch (e) {
      if (DEBUG_MODE) console.warn(`Error with selector ${selector}:`, e);
    }
  }

  const currentPaperCount = document.querySelectorAll('.gsc_a_tr').length;
  if (awaitingRowAppend) {
    if (currentPaperCount > rowsBeforeClick) {
      awaitingRowAppend = false;
      lastObservedPaperCount = currentPaperCount;
      stableUnavailableChecks = 0;
      // Scholar has finished the previous pagination request. Preserve the
      // extension's historically stable pace, with a little jitter so large
      // profiles do not issue a mechanically fixed sequence of requests.
      nextClickAllowedAt = Date.now() + nextClickDelayMs();
    } else if (!showMoreButton ||
               window.getComputedStyle(showMoreButton).display === 'none' ||
               window.getComputedStyle(showMoreButton).visibility === 'hidden') {
      // A removed/hidden button with no appended rows is a legitimate terminal
      // response (for example, an exact multiple of Scholar's page size).
      awaitingRowAppend = false;
      lastObservedPaperCount = currentPaperCount;
      stableUnavailableChecks = 0;
      waitForStableCompletion();
      return;
    } else if (Date.now() - appendWaitStartedAt < APPEND_TIMEOUT_MS) {
      scheduleLoadingCheck(APPEND_TIMEOUT_MS - (Date.now() - appendWaitStartedAt));
      return;
    } else {
      // Do not hang forever if Scholar drops a request. After the timeout,
      // fall back to the normal settled-page check without issuing a second
      // click against the same disabled button.
      awaitingRowAppend = false;
      lastObservedPaperCount = currentPaperCount;
      stableUnavailableChecks = 0;
      finishLoading();
      return;
    }
  }
  
  if (DEBUG_MODE) console.log(`Retry ${retryCount + 1}/${MAX_RETRIES}`);
  if (DEBUG_MODE) console.log('Looking for Show More button...');
  
  if (showMoreButton) {
    observeShowMoreButton(showMoreButton);
    if (DEBUG_MODE) console.log(`✓ Found Show More button with selector: ${foundSelector}`);
    if (DEBUG_MODE) console.log('Button details:', {
      text: showMoreButton.textContent.trim(),
      disabled: showMoreButton.disabled,
      display: window.getComputedStyle(showMoreButton).display,
      visibility: window.getComputedStyle(showMoreButton).visibility,
      onclick: showMoreButton.onclick,
      className: showMoreButton.className
    });
    
    const isClickable = !showMoreButton.disabled && 
                       window.getComputedStyle(showMoreButton).display !== 'none' &&
                       window.getComputedStyle(showMoreButton).visibility !== 'hidden';
    
    if (isClickable) {
      const now = Date.now();
      if (now < nextClickAllowedAt) {
        scheduleLoadingCheck(nextClickAllowedAt - now);
        return;
      }
      if (DEBUG_MODE) console.log('✓ Button is clickable, clicking...');
      rowsBeforeClick = currentPaperCount;
      appendWaitStartedAt = Date.now();
      awaitingRowAppend = true;
      
      // Try multiple click methods
      try {
        showMoreButton.click();
      } catch (e) {
        if (DEBUG_MODE) console.warn('Standard click failed, trying alternatives:', e);
        try {
          showMoreButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        } catch (e2) {
          if (DEBUG_MODE) console.warn('Mouse event click failed:', e2);
          // Try triggering onclick directly if it exists
          if (showMoreButton.onclick) {
            showMoreButton.onclick.call(showMoreButton);
          }
        }
      }
      
      retryCount++;
      stableUnavailableChecks = 0;
      lastObservedPaperCount = rowsBeforeClick;
      
      // DOM mutations wake the loop immediately when Scholar appends rows or
      // changes the button state. This is only a dropped-request fallback.
      scheduleLoadingCheck(APPEND_TIMEOUT_MS);
    } else {
      if (DEBUG_MODE) console.log('✗ Button found but not clickable (disabled, hidden, or invisible)');
      waitForStableCompletion();
    }
  } else {
    if (DEBUG_MODE) console.log('✗ No Show More button found with any selector');
    
    // Check if we have reached max retries or if papers are already loaded
    const paperCount = document.querySelectorAll('.gsc_a_tr').length;
    if (DEBUG_MODE) console.log(`Current paper count: ${paperCount}`);
    
    if (document.readyState === 'complete' && paperCount < 20) {
      finishLoading();
    } else if (document.readyState === 'complete') {
      // A full first Scholar page can receive its pagination button slightly
      // after readyState becomes complete. Keep the observer alive briefly;
      // genuinely short profiles still finish immediately above.
      waitForStableCompletion();
    } else if (retryCount < MAX_RETRIES && paperCount < 20) {
      // Maybe the page is still loading, try again
      retryCount++;
      if (DEBUG_MODE) console.log(`Retrying in 1 second (attempt ${retryCount}/${MAX_RETRIES})...`);
      scheduleLoadingCheck(1000);
    } else {
      if (DEBUG_MODE) console.log('⏳ Show More unavailable; waiting for the paper count to settle');
      waitForStableCompletion();
    }
  }
}

function finishLoading() {
  if (loadingFinished) return;
  loadingFinished = true;
  loadingSequenceActive = false;
  if (scheduledCheckTimer !== null) clearTimeout(scheduledCheckTimer);
  scheduledCheckTimer = null;
  scheduledCheckAt = 0;
  if (DEBUG_MODE) console.log('🎉 All papers loaded or max attempts reached. Proceeding with highlighting...');
  retryCount = 0; // Reset for potential future use
  
  // All papers are loaded, now we can proceed with highlighting
  if (typeof highlightAuthors === 'function') {
    highlightAuthors();
  } else {
    if (DEBUG_MODE) console.error('highlightAuthors function not found');
  }

  // OpenAlex enrichment is deliberately started only after the existing Scholar
  // loading/highlighting flow has finished. The content orchestrator guards it so
  // repeated finish signals cannot spend the profile budget more than once.
  if (typeof window.enrichLastAuthors === 'function') {
    window.enrichLastAuthors();
  }
}

function waitForPageReady() {
  if (loadingFinished || loadingSequenceActive) return;
  if (DEBUG_MODE) console.log('⏳ waitForPageReady called');
  // Wait for the paper container to exist
  const paperContainer = document.querySelector('#gsc_a_b, .gsc_a_tr');
  
  if (paperContainer) {
    loadingSequenceActive = true;
    lastObservedPaperCount = document.querySelectorAll('.gsc_a_tr').length;
    stableUnavailableChecks = 0;
    if (DEBUG_MODE) console.log('✓ Paper container found, starting Show More clicking...');
    // Keep the original one-second startup pause so opening a Scholar profile
    // never triggers an immediate pagination request.
    nextClickAllowedAt = Date.now() + INITIAL_CLICK_DELAY_MS;
    scheduleLoadingCheck(INITIAL_CLICK_DELAY_MS);
  } else {
    if (DEBUG_MODE) console.log('⏳ Paper container not found yet, retrying...');
    if (document.readyState === 'complete') {
      finishLoading();
    } else {
      setTimeout(waitForPageReady, 500);
    }
  }
}

// Start the process with multiple trigger points
if (DEBUG_MODE) console.log('🚀 Google Scholar Author Highlighter - Auto Show More starting...');

if (document.readyState === 'loading') {
  if (DEBUG_MODE) console.log('📄 Document is loading, adding DOMContentLoaded listener');
  document.addEventListener('DOMContentLoaded', waitForPageReady);
} else {
  if (DEBUG_MODE) console.log('📄 Document already ready, starting immediately');
  waitForPageReady();
}

// Also listen for page changes (for SPA navigation)
window.addEventListener('load', () => {
  if (DEBUG_MODE) console.log('🌐 Window load event fired');
  waitForPageReady();
});

// Additional observer for dynamic content - renamed to avoid conflicts
const showMoreObserver = new MutationObserver((mutations) => {
  let shouldCheck = false;
  
  mutations.forEach((mutation) => {
    if (mutation.type === 'childList' &&
        (mutation.addedNodes.length > 0 || mutation.removedNodes?.length > 0)) {
      // Check whether papers or pagination controls were added or removed.
      const changedNodes = [...mutation.addedNodes, ...(mutation.removedNodes || [])];
      for (const node of changedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE &&
            (node.matches?.('.gsc_a_tr, #gsc_bpf_more') ||
             node.querySelector?.('.gsc_a_tr, #gsc_bpf_more'))) {
          shouldCheck = true;
          break;
        }
      }
    }
  });
  
  if (shouldCheck) {
    if (DEBUG_MODE) console.log('📝 New content detected, checking for Show More button...');
    if (loadingSequenceActive && !loadingFinished) {
      scheduleLoadingCheck(0);
    } else if (!loadingFinished) {
      waitForPageReady();
    }
  }
});

function startShowMoreObserver() {
  if (DEBUG_MODE) console.log('👀 Starting DOM mutation observer...');
  if (!document.body) {
    setTimeout(startShowMoreObserver, 100);
    return;
  }
  try {
    showMoreObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  } catch (e) {
    if (DEBUG_MODE) console.warn('Failed to start mutation observer:', e);
  }
}

startShowMoreObserver();
