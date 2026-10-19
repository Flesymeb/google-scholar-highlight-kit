// Metrics Calculator - Calculates citation metrics for highlighted papers
window.metricsCalculator = (function () {
  'use strict';

  // State for histogram visibility
  let isHistogramVisible = false;

  function calculateMetrics() {
    const papers = document.querySelectorAll('.gsc_a_tr');

    // Get current year filter
    const startEl = document.getElementById('start-year-input');
    const endEl = document.getElementById('end-year-input');
    const startYear = startEl && startEl.value ? parseInt(startEl.value, 10) : null;
    const endYear = endEl && endEl.value ? parseInt(endEl.value, 10) : null;

    let stats = {
      total: { count: 0, citations: 0, citationCounts: [], years: {} },
      highlighted: { count: 0, citations: 0, citationCounts: [], years: {} }
    };

    papers.forEach((paper, index) => {
      // 1. Check Year Filter
      const yearEl = paper.querySelector('.gsc_a_y');
      let paperYear = null;
      if (yearEl) {
        const yearText = yearEl.textContent.trim();
        if (yearText) {
          paperYear = parseInt(yearText, 10);
        }
      }

      // Check if paper is within the selected year range
      let inYearRange = true;
      if (startYear !== null || endYear !== null) {
        if (paperYear === null) {
          inYearRange = false; // Hide if no year and filter active
        } else {
          if (startYear !== null && paperYear < startYear) inYearRange = false;
          if (endYear !== null && paperYear > endYear) inYearRange = false;
        }
      }

      if (!inYearRange) return; // Skip papers outside year range for BOTH metrics

      const citationElement = paper.querySelector('.gsc_a_ac');
      let citationCount = 0;
      if (citationElement) {
        const text = citationElement.textContent.trim();
        const parsed = parseInt(text, 10);
        if (!isNaN(parsed)) {
          citationCount = parsed;
        }
      }

      // 2. Update Total Metrics
      stats.total.count++;
      stats.total.citations += citationCount;
      stats.total.citationCounts.push(citationCount);

      // Aggregate years for total
      if (paperYear !== null) {
        stats.total.years[paperYear] = (stats.total.years[paperYear] || 0) + 1;
      }

      // 3. Update Highlighted Metrics
      if (paper.classList.contains('highlighted-author')) {
        stats.highlighted.count++;
        stats.highlighted.citations += citationCount;
        stats.highlighted.citationCounts.push(citationCount);

        // Aggregate years for histogram (highlighted)
        if (paperYear !== null) {
          stats.highlighted.years[paperYear] = (stats.highlighted.years[paperYear] || 0) + 1;
        }
      }
    });

    // Helper to calc h-index and i10
    const calcIndices = (citations) => {
      citations.sort((a, b) => b - a);
      const hIndex = citations.filter((c, i) => c > i).length;
      const i10index = citations.filter(c => c >= 10).length;
      return { hIndex, i10index };
    };

    const totalIndices = calcIndices(stats.total.citationCounts);
    const highlightedIndices = calcIndices(stats.highlighted.citationCounts);

    // Scholar's own sidebar stats are profile-wide (all loaded pages and
    // beyond) — prefer them as the "of N" denominators over per-page sums.
    const sidebarCells = document.querySelectorAll('#gsc_rsb_s .gsc_rsb_std');
    const parseCell = (el) => {
      const n = parseInt((el.textContent || '').replace(/[,\s]/g, ''), 10);
      return isNaN(n) ? null : n;
    };
    // Cells come in All/Since pairs: citations, h-index, i10-index.
    const profile = sidebarCells.length >= 3 ? {
      citations: parseCell(sidebarCells[0]),
      hIndex: parseCell(sidebarCells[2]),
      i10index: parseCell(sidebarCells[4])
    } : null;

    return {
      total: {
        count: stats.total.count,
        citations: (profile && profile.citations) || stats.total.citations,
        hIndex: (profile && profile.hIndex) || totalIndices.hIndex,
        i10index: (profile && profile.i10index) || totalIndices.i10index,
        years: stats.total.years
      },
      highlighted: {
        count: stats.highlighted.count,
        citations: stats.highlighted.citations,
        hIndex: highlightedIndices.hIndex,
        i10index: highlightedIndices.i10index,
        years: stats.highlighted.years
      }
    };
  }

  function displayHighlightedMetrics() {
    const metrics = calculateMetrics();
    // When "Show more" remains, loaded totals are a subset of the profile;
    // say so instead of implying the numbers cover everything.
    const showMore = document.getElementById('gsc_bpf_more');
    const allLoaded = !showMore || showMore.offsetParent === null || showMore.disabled;
    const loadedNote = allLoaded ? '' : ' loaded';

    let metricsComponent = document.getElementById('highlighted-metrics');
    if (!metricsComponent) {
      metricsComponent = document.createElement('div');
      metricsComponent.id = 'highlighted-metrics';
      metricsComponent.className = 'highlighted-metrics';

      const controlsContainer = document.getElementById('author-highlighter-controls');
      if (controlsContainer) {
        controlsContainer.appendChild(metricsComponent);
      }
    }

    // Prepare Histogram Data
    const totalYearCounts = metrics.total.years;
    const highlightedYearCounts = metrics.highlighted.years;

    // Filter years >= 1980 from TOTAL metrics (sets the range)
    const years = Object.keys(totalYearCounts)
      .map(y => parseInt(y, 10))
      .filter(y => y >= 1980)
      .sort((a, b) => a - b);

    let histogramHTML = '';

    if (years.length > 0) {
      const minYear = years[0];
      const maxYear = years[years.length - 1];
      // Max count should be based on TOTAL papers in a year
      const maxCount = Math.max(...years.map(y => totalYearCounts[y] || 0));

      // Prevent division by zero if maxCount is 0 (unlikely if years.length > 0)
      const safeMaxCount = maxCount > 0 ? maxCount : 1;

      let barsHTML = '';
      // Create a continuous range of years
      for (let y = minYear; y <= maxYear; y++) {
        const totalCount = totalYearCounts[y] || 0;
        const highlightedCount = highlightedYearCounts[y] || 0;
        const normalCount = totalCount - highlightedCount;

        const totalHeightPercent = (totalCount / safeMaxCount) * 100;
        const highlightedHeightPercent = totalCount > 0 ? (highlightedCount / totalCount) * 100 : 0;
        const normalHeightPercent = totalCount > 0 ? (normalCount / totalCount) * 100 : 0;

        barsHTML += `
                <div class="histogram-bar-container" data-label="${highlightedCount} of ${totalCount} (${y})">
                    <div class="histogram-bar" style="height: ${totalHeightPercent}%;">
                        <div class="histogram-segment normal" style="height: ${normalHeightPercent}%;"></div>
                        <div class="histogram-segment highlighted" style="height: ${highlightedHeightPercent}%;"></div>
                    </div>
                </div>
            `;
      }

      const displayStyle = isHistogramVisible ? 'block' : 'none';

      // Axis labels: Position absolutely to align with bar centers
      const totalYears = maxYear - minYear + 1;

      const getPosPercent = (year) => {
        const index = year - minYear;
        // Center of the bar is at (index + 0.5) / totalYears
        return ((index + 0.5) / totalYears * 100).toFixed(2);
      };

      let axisHTML = '';
      // Adaptive density:
      // <= 8 years: 3 labels (Start, Mid, End)
      // 9-16 years: 4 labels
      // > 16 years: 5 labels
      const range = maxYear - minYear;
      let numLabels = 5;
      if (range <= 8) {
        numLabels = 3;
      } else if (range <= 16) {
        numLabels = 4;
      }

      const labelYears = new Set();

      // Always include start and end
      labelYears.add(minYear);
      labelYears.add(maxYear);

      // Add intermediate points
      if (maxYear - minYear > 1) {
        const step = (maxYear - minYear) / (numLabels - 1);
        for (let i = 1; i < numLabels - 1; i++) {
          labelYears.add(Math.round(minYear + step * i));
        }
      }

      const sortedLabelYears = Array.from(labelYears).sort((a, b) => a - b);

      sortedLabelYears.forEach(year => {
        axisHTML += `<span style="left: ${getPosPercent(year)}%;">${year}</span>`;
      });

      histogramHTML = `
            <div class="histogram-wrapper" id="histogram-wrapper" style="display: ${displayStyle};">
                <div class="histogram">
                    ${barsHTML}
                    ${maxCount >= 1 ? (() => {
          const midValue = Math.max(1, Math.round(maxCount / 2));
          return `
                    <div class="histogram-y-axis-line" style="bottom: ${(midValue / safeMaxCount) * 100}%;"></div>
                    <div class="histogram-y-axis-label" style="bottom: ${(midValue / safeMaxCount) * 100}%;">${midValue}</div>
                    `;
        })() : ''}
                </div>
                <div class="histogram-axis">
                    ${axisHTML}
                </div>
            </div>
        `;
    }

    metricsComponent.innerHTML = `
      <hr class="metrics-divider">
      <div class="metrics-header">
          <h4>Metrics <span id="histogram-toggle-icon" class="histogram-emoji-btn" title="Show papers by year"><svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 0 24 24" width="20" fill="currentColor"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zM7 10h2v7H7zm4-3h2v10h-2zm4 6h2v4h-2z"/></svg></span></h4>
      </div>
      <div class="metrics-grid">
        <div class="metric-item">
          <span class="metric-label">Papers:</span>
          <span class="metric-value">
            ${metrics.highlighted.count} <span class="metric-total">of ${metrics.total.count}${loadedNote}</span>
          </span>
        </div>
        <div class="metric-item">
          <span class="metric-label">Citations:</span>
          <span class="metric-value">
            ${metrics.highlighted.citations} <span class="metric-total">of ${metrics.total.citations}</span>
          </span>
        </div>
        <div class="metric-item">
          <span class="metric-label">h-index:</span>
          <span class="metric-value">
            ${metrics.highlighted.hIndex} <span class="metric-total">of ${metrics.total.hIndex}</span>
          </span>
        </div>
        <div class="metric-item">
          <span class="metric-label">i10-index:</span>
          <span class="metric-value">
            ${metrics.highlighted.i10index} <span class="metric-total">of ${metrics.total.i10index}</span>
          </span>
        </div>
      </div>
      ${histogramHTML}
    `;

    // Re-attach listener for toggle if it exists
    const toggleBtn = document.getElementById('histogram-toggle-icon');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', function () {
        const wrapper = document.getElementById('histogram-wrapper');
        // Toggle visibility state
        isHistogramVisible = !isHistogramVisible;

        if (wrapper) {
          wrapper.style.display = isHistogramVisible ? 'block' : 'none';
        }
      });
    }
  }

  return {
    calculateHighlightedMetrics: calculateMetrics,
    displayHighlightedMetrics
  };
})();
