// UI Manager - Handles UI injection and event listeners
window.uiManager = (function () {
  'use strict';

  function injectFilterUI(initialHighlightNameState, highlightNameCallback) {
    if (document.getElementById('author-highlighter-controls')) {
      return; // Avoid injecting multiple times
    }

    const filterHTML = `
      <div id="author-highlighter-controls" class="author-highlighter-controls">
        <div class="ahk-head">
          <span class="ahk-title">Filters<span class="info-icon" data-tooltip="Co-first: Beginning authors marked with symbols (* † ‡ § # ✉).&#10;Corresponding: Non-beginning authors marked with symbols (* † ‡ § # ✉)."><svg focusable="false" width="14" height="14" viewBox="0 0 24 24" style="fill: currentColor"><path d="M11 18h2v-2h-2v2zm1-16C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14c-2.21 0-4 1.79-4 4h2c0-1.1.9-2 2-2s2 .9 2 2c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5 0-2.21-1.79-4-4-4z"></path></svg></span></span>
          <button type="button" id="ahk-reset" class="ahk-reset" title="Reset filters">Reset</button>
        </div>
        <div class="ahk-roles">
          <div class="ahk-col">
            <label class="ahk-check"><input type="checkbox" id="first-author-filter" checked><span>First</span></label>
            <label class="ahk-check"><input type="checkbox" id="second-author-filter" checked><span>Second</span></label>
            <label class="ahk-check"><input type="checkbox" id="last-author-filter" checked><span>Last</span></label>
          </div>
          <div class="ahk-col">
            <label class="ahk-check"><input type="checkbox" id="co-first-author-filter" checked><span>Co-First</span></label>
            <label class="ahk-check"><input type="checkbox" id="corresponding-author-filter" checked><span>Corr.</span></label>
          </div>
        </div>
        <div class="ahk-row"><span class="ahk-label">Show only highlighted</span><input type="checkbox" id="visibility-toggle" class="ahk-toggle"></div>
        <div class="ahk-row"><span class="ahk-label">Highlight author name</span><input type="checkbox" id="highlight-name-toggle" class="ahk-toggle"></div>
        <div class="ahk-row">
          <span class="ahk-label">Year</span>
          <span class="ahk-years">
            <select id="start-year-input" class="year-input"><option value="">Start</option></select>
            <span class="ahk-dash">–</span>
            <select id="end-year-input" class="year-input"><option value="">End</option></select>
          </span>
        </div>
      </div>
    `;

    // Find the "Cited by" section
    const citedBySection = document.querySelector('#gsc_rsb_cit');

    if (citedBySection) {
      // Create a new container for the filter UI
      const controlsContainer = document.createElement('div');
      controlsContainer.innerHTML = filterHTML;

      // Insert the filter UI before the "Cited by" section
      citedBySection.parentNode.insertBefore(controlsContainer, citedBySection);
      populateYearDropdowns();
      setupEventListeners(initialHighlightNameState, highlightNameCallback);
    } else {
      console.error('Could not find the "Cited by" section');
    }
  }

  function populateYearDropdowns() {
    const startSelect = document.getElementById('start-year-input');
    const endSelect = document.getElementById('end-year-input');

    if (!startSelect || !endSelect) return;

    // Save current selection
    const currentStart = startSelect.value;
    const currentEnd = endSelect.value;

    // Clear existing options except the first one (default)
    // Assuming the first option is "Start" / "End"
    while (startSelect.options.length > 1) {
      startSelect.remove(1);
    }
    while (endSelect.options.length > 1) {
      endSelect.remove(1);
    }

    const papers = document.querySelectorAll('.gsc_a_tr');
    const years = new Set();

    // Ensure current selection is included in the set so it's not lost
    if (currentStart) years.add(parseInt(currentStart, 10));
    if (currentEnd) years.add(parseInt(currentEnd, 10));

    papers.forEach(paper => {
      const yearEl = paper.querySelector('.gsc_a_y');
      if (yearEl) {
        const yearText = yearEl.textContent.trim();
        const year = parseInt(yearText, 10);
        if (!isNaN(year)) {
          years.add(year);
        }
      }
    });

    const sortedYears = Array.from(years).sort((a, b) => b - a); // Descending order

    // Helper to create options
    const createOption = (val) => {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = val;
      return opt;
    };

    sortedYears.forEach(year => {
      startSelect.appendChild(createOption(year));
      endSelect.appendChild(createOption(year));
    });

    // Restore selection if it still exists in the new options
    if (currentStart) {
      startSelect.value = currentStart;
      // If the previously selected year is no longer available (unlikely if purely additive), 
      // we might want to reset or keep it? 
      // If it's not in the list, setting .value won't work, which is fine (resets to default).
      // However, if we scroll down and 2025 appears, we want 2025 to be selectable. 
      // If we had '2025' selected (maybe from session storage?) but it wasn't in the list yet??
      // Wait, if it wasn't in the list, we couldn't select it via dropdown. 
      // But if we loaded from session storage, we might have set a value.
      // If we set a value that doesn't exist in options, it usually shows as blank or default.
      // So we should try to set it.
    }
    if (currentEnd) {
      endSelect.value = currentEnd;
    }
  }

  function ensureOption(selectElement, value) {
    if (!value) return;
    let exists = false;
    for (let i = 0; i < selectElement.options.length; i++) {
      if (selectElement.options[i].value === value.toString()) {
        exists = true;
        break;
      }
    }
    if (!exists) {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = value;
      // Append at the end or try to insert sorted? 
      // For simplicity, appending is fine as populateYearDropdowns will fix sort later.
      // But on initial load, we want it available.
      selectElement.appendChild(opt);
    }
  }

  function setupEventListeners(initialHighlightNameState, highlightNameCallback) {
    const visibilityToggle = document.getElementById('visibility-toggle');
    const highlightNameToggle = document.getElementById('highlight-name-toggle');
    const firstAuthorFilter = document.getElementById('first-author-filter');
    const secondAuthorFilter = document.getElementById('second-author-filter');
    const coFirstAuthorFilter = document.getElementById('co-first-author-filter');
    const correspondingAuthorFilter = document.getElementById('corresponding-author-filter');
    const lastAuthorFilter = document.getElementById('last-author-filter');
    const startYearInput = document.getElementById('start-year-input');
    const endYearInput = document.getElementById('end-year-input');
    const resetButton = document.getElementById('ahk-reset');

    if (resetButton) {
      resetButton.addEventListener('click', function () {
        const roleIds = [
          'first-author-filter', 'co-first-author-filter', 'second-author-filter',
          'corresponding-author-filter', 'last-author-filter'
        ];
        roleIds.forEach((id) => {
          const el = document.getElementById(id);
          if (el && !el.checked) {
            el.checked = true;
            el.dispatchEvent(new Event('change'));
          }
        });
        ['start-year-input', 'end-year-input'].forEach((id) => {
          const el = document.getElementById(id);
          if (el && el.value !== '') {
            el.value = '';
            el.dispatchEvent(new Event('change'));
          }
        });
        if (visibilityToggle && visibilityToggle.checked) {
          visibilityToggle.checked = false;
          visibilityToggle.dispatchEvent(new Event('change'));
        }
      });
    }

    visibilityToggle.addEventListener('change', function () {
      const showOnlyHighlighted = this.checked;
      window.storageHelper.set({ showOnlyHighlighted: showOnlyHighlighted });
      window.filterManager.togglePaperVisibility(showOnlyHighlighted);
    });

    startYearInput.addEventListener('change', window.filterManager.updateFilters);
    endYearInput.addEventListener('change', window.filterManager.updateFilters);

    highlightNameToggle.addEventListener('change', function () {
      const highlightName = this.checked;
      // Call the callback provided by content.js instead of directly setting storage.
      if (highlightNameCallback) {
        highlightNameCallback(highlightName);
      }
    });

    [firstAuthorFilter, secondAuthorFilter, coFirstAuthorFilter, correspondingAuthorFilter, lastAuthorFilter].forEach(filter => {
      filter.addEventListener('change', window.filterManager.updateFilters);
    });

    // Load initial state
    window.storageHelper.get(['showOnlyHighlighted', 'filters', 'yearFilter'], function (result, error) {
      if (error) {
        // Use defaults
        visibilityToggle.checked = false;
        const filters = { first: true, second: true, coFirst: true, corresponding: true, last: true };
        firstAuthorFilter.checked = filters.first;
        secondAuthorFilter.checked = filters.second;
        coFirstAuthorFilter.checked = filters.coFirst;
        correspondingAuthorFilter.checked = filters.corresponding;
        lastAuthorFilter.checked = filters.last;
        window.filterManager.applyFilters(filters);
      } else {
        visibilityToggle.checked = result.showOnlyHighlighted || false;
        const filters = result.filters || { first: true, second: true, coFirst: true, corresponding: true, last: true };
        firstAuthorFilter.checked = filters.first;
        secondAuthorFilter.checked = filters.second;
        coFirstAuthorFilter.checked = filters.coFirst;
        correspondingAuthorFilter.checked = filters.corresponding !== undefined ? filters.corresponding : true; // Default to true if not present
        lastAuthorFilter.checked = filters.last;
        window.filterManager.applyFilters(filters);

        // Load year filter from sessionStorage (persists on refresh, clears on new tab/window usually, 
        // actually sessionStorage persists for the page session. A page session lasts as long as the browser is open, 
        // and survives over page reloads and restores. Opening a page in a new tab or window creates a new session.)
        try {
          const storedYearFilter = sessionStorage.getItem('authorHighlighterYearFilter');
          if (storedYearFilter) {
            const yearFilter = JSON.parse(storedYearFilter);

            // Ensure options exist before setting value
            if (yearFilter.start) ensureOption(startYearInput, yearFilter.start);
            if (yearFilter.end) ensureOption(endYearInput, yearFilter.end);

            startYearInput.value = yearFilter.start || '';
            endYearInput.value = yearFilter.end || '';
            // Apply the year filter immediately
            window.filterManager.applyFilters(filters, yearFilter);
          }
        } catch (e) {
          console.warn('Error loading year filter from sessionStorage:', e);
        }
      }
      // Set the initial state for the highlight name toggle from the value passed by content.js.
      highlightNameToggle.checked = initialHighlightNameState;
      window.nameHighlighter.highlightAuthorNames(initialHighlightNameState);
    });
  }

  return {
    injectFilterUI,
    setupEventListeners,
    populateYearDropdowns
  };
})();
