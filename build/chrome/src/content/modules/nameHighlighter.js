// Name Highlighter - Highlights author names in paper lists
window.nameHighlighter = (function() {
  'use strict';

  /**
   * Highlights or removes highlighting of author names in papers
   * @param {boolean} enabled - Whether to enable or disable name highlighting
   */
  function highlightAuthorNames(enabled) {
    const fullNameElement = document.querySelector('#gsc_prf_in');
    if (!fullNameElement) {
      console.error('Could not find author name element');
      return;
    }
    
    const profileNameOriginal = fullNameElement.textContent;
    const fullyCleanedProfileName = window.authorMatcher.normalizeProfileName(profileNameOriginal);

    // Helper to extract other names (aliases) from the profile
    function extractOtherNames() {
      const aliases = [];
      
      // Strategy 1: Check standard info rows (.gsc_prf_il)
      // This handles older/alternative layouts where "Also published as" might appear in info lines
      const infoRows = document.querySelectorAll('.gsc_prf_il');
      infoRows.forEach(row => {
        const text = row.textContent.trim();
        const labelMatch = text.match(/^(also published as|also known as|alternative names|别名|曾用名)[:\s]+(.*)/i);
        if (labelMatch && labelMatch[2]) {
          const names = labelMatch[2].split(',');
          names.forEach(name => {
            const cleanName = name.trim();
            if (cleanName) {
              aliases.push(cleanName);
            }
          });
        }
      });

      // Strategy 2: Check for specific "Other names" expandable section
      const otherNamesElement = document.querySelector('#gs_prf_ion_txt');
      if (otherNamesElement) {
        const text = otherNamesElement.textContent.trim();
        if (text) {
          const names = text.split(',');
          names.forEach(name => {
            const cleanName = name.trim();
            if (cleanName) {
              aliases.push(cleanName);
            }
          });
        }
      }
      
      return aliases;
    }

    const otherNames = extractOtherNames();

    const papers = document.querySelectorAll('.gsc_a_tr');
    papers.forEach((paper) => {
      const authorsTextNode = paper.querySelector('.gs_gray');
      if (!authorsTextNode) return;

      // Remove any existing highlighting
      removeHighlighting(authorsTextNode);

      if (!enabled) return;

      // Apply new highlighting
      applyHighlighting(authorsTextNode, fullyCleanedProfileName, profileNameOriginal, otherNames);
    });
  }

  /**
   * Removes existing name highlighting from an author list element
   * @param {HTMLElement} authorsTextNode - The element containing author names
   */
  function removeHighlighting(authorsTextNode) {
    const existingHighlight = authorsTextNode.querySelector('.highlighted-author-name');
    if (existingHighlight) {
      authorsTextNode.innerHTML = authorsTextNode.textContent;
    }
  }

  /**
   * Applies highlighting to the matching author name
   * @param {HTMLElement} authorsTextNode - The element containing author names
   * @param {string} fullyCleanedProfileName - The normalized profile name to match
   * @param {string} profileNameOriginal - The original profile name
   * @param {string[]} otherNames - List of alternative names
   */
  function applyHighlighting(authorsTextNode, fullyCleanedProfileName, profileNameOriginal, otherNames) {
    const authorsText = authorsTextNode.textContent;
    const authorList = authorsText
      .split(',')
      .map(author => author.trim())
      .filter(author => author.length > 0 && author !== '...');

    // Find the best matching author
    const matchResult = window.authorMatcher.findBestMatch(authorList, fullyCleanedProfileName, profileNameOriginal, otherNames);
    
    if (matchResult.score !== Infinity && matchResult.matchedAuthor) {
      // Highlight the matched author name
      const matchedAuthor = matchResult.matchedAuthor;
      const escapedAuthor = escapeRegex(matchedAuthor);
      const regex = new RegExp(`(${escapedAuthor})`, 'gi');
      const highlightedHTML = authorsText.replace(regex, '<span class="highlighted-author-name">$1</span>');
      authorsTextNode.innerHTML = highlightedHTML;
    }
  }

  /**
   * Escapes special regex characters in a string
   * @param {string} str - String to escape
   * @returns {string} Escaped string safe for use in RegExp
   */
  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Original was: return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  return {
    highlightAuthorNames
  };
})();
