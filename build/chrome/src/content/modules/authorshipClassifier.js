(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.authorshipClassifier = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function classifyAuthorship(authorList, bestMatchIndex, authorSymbol, includesEllipsis) {
    const roles = {
      firstAuthor: false,
      secondAuthor: false,
      coFirstAuthor: false,
      correspondingAuthor: false,
      lastAuthor: false
    };

    if (!Array.isArray(authorList) || bestMatchIndex < 0 || bestMatchIndex >= authorList.length) {
      return roles;
    }

    if (authorList.length === 1) {
      roles.firstAuthor = true;
      return roles;
    }

    let qualifiesCoFirst = false;
    if (authorSymbol) {
      if (bestMatchIndex === 0) {
        qualifiesCoFirst = authorList[1].includes(authorSymbol);
      } else {
        qualifiesCoFirst = authorList
          .slice(0, bestMatchIndex)
          .every((author) => author.includes(authorSymbol));
      }

      if (!qualifiesCoFirst) {
        roles.correspondingAuthor = true;
      }
    }

    if (qualifiesCoFirst) {
      roles.coFirstAuthor = true;
      return roles;
    }

    roles.firstAuthor = bestMatchIndex === 0;
    roles.secondAuthor = bestMatchIndex === 1;
    roles.lastAuthor = !includesEllipsis && bestMatchIndex === authorList.length - 1;
    return roles;
  }

  return { classifyAuthorship };
});
