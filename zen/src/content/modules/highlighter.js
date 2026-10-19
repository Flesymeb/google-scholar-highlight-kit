// Highlighter - Core author highlighting logic
window.highlighterModule = (function() {
  'use strict';

  function highlightAuthors(papers, onComplete) {
    const fullNameElement = document.querySelector('#gsc_prf_in');
    if (!fullNameElement) {
      console.error('Could not find author name element');
      return;
    }
    const profileNameOriginal = fullNameElement.textContent;

    // Helper to extract other names (aliases) from the profile
    // Checks for "Also published as" fields
    function extractOtherNames() {
      const aliases = [];
      
      // Strategy 1: Check standard info rows (.gsc_prf_il)
      // This handles older/alternative layouts where "Also published as" might appear in info lines
      const infoRows = document.querySelectorAll('.gsc_prf_il');
      infoRows.forEach(row => {
        const text = row.textContent.trim();
        // Check for English "Also published as" and common variations including Chinese
        // We handle case-insensitive matching and remove the label
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
      // Based on user feedback: <div id="gsc_prf_ion" ...><span id="gs_prf_ion_txt">Name</span></div>
      const otherNamesElement = document.querySelector('#gs_prf_ion_txt');
      if (otherNamesElement) {
        const text = otherNamesElement.textContent.trim();
        if (text) {
          // Assuming multiple names could be comma-separated here as well
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

    // Use the authorMatcher module for consistent name normalization
    const fullyCleanedProfileName = window.authorMatcher.normalizeProfileName(profileNameOriginal);

    papers.forEach((paper) => {
      // Avoid re-processing papers that have already been processed
      if (paper.dataset.processed) {
        return;
      }
      
      const authorsTextNode = paper.querySelector('.gs_gray');
      const authorsText = authorsTextNode ? authorsTextNode.textContent : '';
      // Filter both Scholar ellipsis forms from the visible author list.
      const authorList = authorsText.split(',').map(author => author.trim())
        .filter(author => author.length > 0 && !/^(?:\.{3,}|…)$/.test(author));

      let roles = window.authorshipClassifier.classifyAuthorship([], -1, null, false);

      if (authorList.length > 0) {
        // Use the authorMatcher module to find the best match
        const matchResult = window.authorMatcher.findBestMatch(authorList, fullyCleanedProfileName, profileNameOriginal, otherNames);
        const bestMatchIndex = matchResult.matchIndex;
        const actualMatchedAuthorString = matchResult.matchedAuthor;
        const minScore = matchResult.score;
        
        const originalAuthorsTextIncludesEllipsis = /(?:\.{3,}|…)/.test(authorsText);

        // If minScore is not Infinity, it means at least one author passed the subset check,
        // and minScore holds the minimum Levenshtein distance among them.
        if (minScore !== Infinity) { 
          const authorSymbol = window.authorMatcher.getAuthorSymbol(actualMatchedAuthorString);

          roles = window.authorshipClassifier.classifyAuthorship(
            authorList,
            bestMatchIndex,
            authorSymbol,
            originalAuthorsTextIncludesEllipsis
          );
        }
      }

      // Set data attributes
      paper.dataset.isFirstAuthor = roles.firstAuthor;
      paper.dataset.isSecondAuthor = roles.secondAuthor;
      paper.dataset.isCoFirstAuthor = roles.coFirstAuthor;
      paper.dataset.isLastAuthor = roles.lastAuthor;
      paper.dataset.isCorrespondingAuthor = roles.correspondingAuthor;

      // Mark the paper as processed to avoid redundant work
      paper.dataset.processed = 'true';
    });

    // Apply filters after setting data attributes
    if (onComplete) {
      onComplete();
    }
  }

  return {
    highlightAuthors
  };
})();
