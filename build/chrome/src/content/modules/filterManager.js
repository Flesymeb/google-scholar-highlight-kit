// Filter Manager - Manages filter state and application
window.filterManager = (function () {
  'use strict';

  function applyFilters(filters, yearFilter) {
    // defaults if not provided (e.g. from tests or partial calls)
    if (!yearFilter) {
      // Attempt to get from DOM or defaults
      const startEl = document.getElementById('start-year-input');
      const endEl = document.getElementById('end-year-input');
      yearFilter = {
        start: startEl ? startEl.value : '',
        end: endEl ? endEl.value : ''
      };
    }

    const papers = document.querySelectorAll('.gsc_a_tr');
    papers.forEach(paper => {
      // Remove all highlighting classes
      paper.classList.remove('highlighted-author', 'first-author', 'second-author', 'co-first-author', 'corresponding-author', 'last-author');

      // Re-apply highlighting based on current filters
      if (filters.first && paper.dataset.isFirstAuthor === 'true') {
        paper.classList.add('first-author', 'highlighted-author');
      }
      if (filters.second && paper.dataset.isSecondAuthor === 'true') {
        paper.classList.add('second-author', 'highlighted-author');
      }
      if (filters.coFirst && paper.dataset.isCoFirstAuthor === 'true') {
        paper.classList.add('co-first-author', 'highlighted-author');
      }
      if (filters.corresponding && paper.dataset.isCorrespondingAuthor === 'true') {
        paper.classList.add('corresponding-author', 'highlighted-author');
      }
      if (filters.last && paper.dataset.isLastAuthor === 'true') {
        paper.classList.add('last-author', 'highlighted-author');
      }
    });

    // After applying filters, update visibility based on current UI state
    const visibilityToggle = document.getElementById('visibility-toggle');
    if (visibilityToggle) {
      togglePaperVisibility(visibilityToggle.checked);
    } else {
      // Fallback: try to get from storage if UI element doesn't exist yet
      window.storageHelper.get(['showOnlyHighlighted', 'yearFilter'], function (result, error) {
        if (error) {
          togglePaperVisibility(false, { start: '', end: '' });
        } else {
          togglePaperVisibility(result.showOnlyHighlighted || false, result.yearFilter || { start: '', end: '' });
        }
      });
    }

    window.metricsCalculator.displayHighlightedMetrics();
  }

  function getYearFromPaper(paper) {
    const yearEl = paper.querySelector('.gsc_a_y');
    if (!yearEl) return null;
    // year can be "2023", or empty.
    const text = yearEl.textContent.trim();
    if (!text) return null;
    const year = parseInt(text, 10);
    return isNaN(year) ? null : year;
  }

  function togglePaperVisibility(showOnlyHighlighted, yearFilter) {
    if (!yearFilter) {
      // attempt to fetch from DOM
      const startEl = document.getElementById('start-year-input');
      const endEl = document.getElementById('end-year-input');
      yearFilter = {
        start: startEl ? startEl.value : '',
        end: endEl ? endEl.value : ''
      };
    }

    // Parse filter years
    const startYear = yearFilter.start ? parseInt(yearFilter.start, 10) : null;
    const endYear = yearFilter.end ? parseInt(yearFilter.end, 10) : null;

    const papers = document.querySelectorAll('.gsc_a_tr');
    papers.forEach(paper => {
      let visible = true;

      // 1. Check highlighting visibility
      if (showOnlyHighlighted) {
        if (!paper.classList.contains('highlighted-author')) {
          visible = false;
        }
      }

      // 2. Check year visibility (independent of highlighting)
      if (visible) { // optimization: only check if still visible
        const paperYear = getYearFromPaper(paper);
        // If paper has no year, we generally show it (or hide it? standard behavior is usually show unless filtered OUT)
        // If the user sets a filter, and paper has NO year, logic dictates:
        // If strictly between X and Y, undefined is not between X and Y. -> Hide.
        // Let's hide if year is missing BUT filter is active.

        if (startYear !== null || endYear !== null) {
          if (paperYear === null) {
            // No year on paper, but filter is active. Hide it? 
            // Often "empty" year means "in press" or just missing. 
            // Let's hide it to be safe, matches "range" logic.
            visible = false;
          } else {
            if (startYear !== null && paperYear < startYear) {
              visible = false;
            }
            if (endYear !== null && paperYear > endYear) {
              visible = false;
            }
          }
        }
      }

      paper.style.display = visible ? '' : 'none';
    });

    window.metricsCalculator.displayHighlightedMetrics();
  }

  function updateFilters() {
    const filters = {
      first: document.getElementById('first-author-filter').checked,
      second: document.getElementById('second-author-filter').checked,
      coFirst: document.getElementById('co-first-author-filter').checked,
      corresponding: document.getElementById('corresponding-author-filter').checked,
      last: document.getElementById('last-author-filter').checked
    };

    const yearFilter = {
      start: document.getElementById('start-year-input').value,
      end: document.getElementById('end-year-input').value
    };

    // Save to sessionStorage
    try {
      sessionStorage.setItem('authorHighlighterYearFilter', JSON.stringify(yearFilter));
    } catch (e) {
      console.warn('Error saving year filter to sessionStorage:', e);
    }

    // Change: Do not persist year filters to storage so they reset on new page load
    // We only pass them to applyFilters
    window.storageHelper.set({ filters: filters }, function (error) {
      if (error) {
        console.warn('Failed to save filters:', error);
      }
      // Apply filters regardless of save success
      applyFilters(filters, yearFilter);
    });
  }

  return {
    applyFilters,
    togglePaperVisibility,
    updateFilters
  };
})();

