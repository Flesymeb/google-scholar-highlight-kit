// Author Matching Logic Module
// This module contains all the logic for matching author names in Google Scholar

/**
 * Normalizes a profile name for matching
 * Steps:
 * 1. Convert to lowercase
 * 2. Normalize accents (NFD -> remove diacritics)
 * 3. Replace hyphens, dots, and quotes with spaces (or remove quotes)
 * 4. Remove special symbols (*†‡§#✉)
 * 5. Remove all spaces
 */
function normalizeProfileName(profileName) {
  const temp = profileName
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[\-\.,\(\)（）]/g, ' ')
    .replace(/['’]/g, '')
    .replace(/[*†‡§#✉]/g, '');
  return temp.replace(/\s+/g, '');
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(s1, s2) {
  if (s1.length < s2.length) {
    return levenshteinDistance(s2, s1);
  }
  if (s2.length === 0) {
    return s1.length;
  }
  const previousRow = Array.from({ length: s2.length + 1 }, (_, i) => i);
  for (let i = 0; i < s1.length; i++) {
    const currentRow = [i + 1];
    for (let j = 0; j < s2.length; j++) {
      const insertions = previousRow[j + 1] + 1;
      const deletions = currentRow[j] + 1;
      const substitutions = previousRow[j] + (s1[i] !== s2[j] ? 1 : 0);
      currentRow.push(Math.min(insertions, deletions, substitutions));
    }
    previousRow.splice(0, previousRow.length, ...currentRow);
  }
  return previousRow[s2.length];
}

/**
 * Extracts distinct name parts from a profile name.
 * For "Huayang Li", it returns ["huayang", "li"].
 * For "Jean-Paul Sartre", it returns ["jean", "paul", "sartre"].
 */
function extractProfileNameParts(profileName) {
  return profileName
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[\-\.,\(\)（）]/g, ' ')
    .replace(/['’]/g, '')
    .replace(/[*†‡§#✉]/g, '')
    .split(/\s+/)
    .filter(p => p.length > 0);
}

/**
 * Check if author has co-first author symbol or corresponding author symbol
 * Returns the symbol if found (* † ‡ § # ✉), otherwise empty string
 */
function getAuthorSymbol(author) {
  const symbols = "*†‡§#✉";
  for (const symbol of symbols) {
    if (author.includes(symbol)) {
      return symbol;
    }
  }
  return '';
}

/**
 * Alias for getAuthorSymbol to maintain backward compatibility
 */
const isCoFirstAuthor = getAuthorSymbol;

/**
 * Check if all characters in candidate name are present in profile name
 */
function isCharSubset(candidateCleanedName, localProfileCleanedName) {
  if (!candidateCleanedName) return true;
  if (!localProfileCleanedName && candidateCleanedName) return false;
  if (!localProfileCleanedName && !candidateCleanedName) return true;

  const profileCharCounts = {};
  for (const char of localProfileCleanedName) {
    profileCharCounts[char] = (profileCharCounts[char] || 0) + 1;
  }
  for (const char of candidateCleanedName) {
    if (!profileCharCounts[char] || profileCharCounts[char] === 0) {
      return false;
    }
    profileCharCounts[char]--;
  }
  return true;
}

/**
 * Extract the "family name" part from an abbreviated author name
 * For names like "Z Wu", "YK Chia", returns the last contiguous alphabetic part
 * Assumes format is: [Initials] [FamilyName]
 */
function extractFamilyNamePart(authorString) {
  // Remove special characters and clean the string
  const cleaned = authorString.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[\-\.,\(\)（）]/g, ' ')
    .replace(/['’]/g, '')
    .replace(/[*†‡§#✉]/g, '')
    .trim();
  
  // Split by spaces and get the last part (likely the family name)
  const parts = cleaned.split(/\s+/).filter(p => p.length > 0);
  if (parts.length === 0) return '';
  
  // Return the last part (family name)
  return parts[parts.length - 1];
}

/**
 * Calculate match score for an author string against a profile name
 * Lower score = better match
 * Returns Infinity if not a valid match
 */
function getMatchScore(authorStringFromList, localFullyCleanedProfileName, profileName) {
  // Consistent cleaning for the author string from the list
  const tempAuthorNameToClean = authorStringFromList.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[\-\.,\(\)（）]/g, ' ')
    .replace(/['’]/g, '')
    .replace(/[*†‡§#✉]/g, ''); // Remove symbols
  const candidateCleanedName = tempAuthorNameToClean.replace(/\s+/g, ''); // Final clean form for comparison

  // If the cleaned author name is empty, it cannot be a meaningful match.
  if (candidateCleanedName === '') {
    return Infinity;
  }

  // Condition 1: All characters in the candidate name must come from the person's full name
  if (!isCharSubset(candidateCleanedName, localFullyCleanedProfileName)) {
    return Infinity; // Fails subset check, not a match
  }

  // Condition 2: Check if the family name part exists in the profile name
  const familyNamePart = extractFamilyNamePart(authorStringFromList);
  let hasContiguousFamilyName = false;
  
  if (familyNamePart.length > 1) {
    if (profileName) {
      // Strict check: Family name must be one of the name parts in the profile
      const profileParts = extractProfileNameParts(profileName);
      if (!profileParts.includes(familyNamePart)) {
        return Infinity; // Hard fail if family name is not a known part of the profile
      }
      hasContiguousFamilyName = true;
    } else {
      // Fallback if profileName is missing
      hasContiguousFamilyName = localFullyCleanedProfileName.includes(familyNamePart);
      if (!hasContiguousFamilyName) {
        return Infinity;
      }
    }
  }
  
  // Condition 3: Calculate base score using Levenshtein distance
  let score = levenshteinDistance(candidateCleanedName, localFullyCleanedProfileName);

  // Condition 4: Apply bonus for first character match
  // If the first character of the candidate matches the first character of the profile,
  // it's more likely to be the correct match (e.g., "Z Wu" vs "H Wu" for "Zhiyong Wu")
  if (candidateCleanedName.length > 0 && localFullyCleanedProfileName.length > 0) {
    if (candidateCleanedName[0] === localFullyCleanedProfileName[0]) {
      // Reduce score (better match) when first character matches
      score -= 0.5;
    }
  }
  
  // Condition 5: Additional bonus when the initial comes from right after the family name
  // For "J Wang" in "wangjingdong", the 'j' comes right after 'wang', making it the proper abbreviation
  if (hasContiguousFamilyName && candidateCleanedName.length > familyNamePart.length) {
    const familyNameIndex = localFullyCleanedProfileName.indexOf(familyNamePart);
    const positionAfterFamilyName = familyNameIndex + familyNamePart.length;
    
    // Extract the initial(s) from the candidate (everything before the family name)
    const initialsInCandidate = candidateCleanedName.substring(0, candidateCleanedName.length - familyNamePart.length);
    
    // Check if the first initial matches the character right after the family name in the profile
    if (initialsInCandidate.length > 0 && 
        positionAfterFamilyName < localFullyCleanedProfileName.length &&
        initialsInCandidate[0] === localFullyCleanedProfileName[positionAfterFamilyName]) {
      // Strong bonus: this is likely the correct given name initial
      score -= 1.0;
    }
  }
  
  return score;
}

/**
 * Find the best matching author from an author list
 * Returns { matchIndex, matchedAuthor, score }
 * 
 * @param {string[]} authorList - List of author names
 * @param {string} fullyCleanedProfileName - Normalized profile name
 * @param {string} profileName - Original profile name
 * @param {string[]} [otherNames=[]] - Optional list of alternative names
 */
function findBestMatch(authorList, fullyCleanedProfileName, profileName, otherNames = []) {
  let bestMatchIndex = -1;
  let minScore = Infinity;
  let actualMatchedAuthorString = '';

  authorList.forEach((currentAuthorName, index) => {
    // 1. Check against main profile name
    let score = getMatchScore(currentAuthorName, fullyCleanedProfileName, profileName);

    // 2. Check against other names (aliases)
    if (otherNames && otherNames.length > 0) {
      otherNames.forEach((alias) => {
        const aliasCleaned = normalizeProfileName(alias);
        const aliasScore = getMatchScore(currentAuthorName, aliasCleaned, alias);
        if (aliasScore < score) {
          score = aliasScore;
        }
      });
    }

    if (score < minScore) {
      minScore = score;
      bestMatchIndex = index;
      actualMatchedAuthorString = currentAuthorName;
    }
  });

  return {
    matchIndex: bestMatchIndex,
    matchedAuthor: actualMatchedAuthorString,
    score: minScore
  };
}

// Export for Node.js (testing)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    normalizeProfileName,
    levenshteinDistance,
    isCoFirstAuthor,
    getAuthorSymbol,
    isCharSubset,
    getMatchScore,
    findBestMatch,
    extractProfileNameParts
  };
}

// Export for browser (content script)
if (typeof window !== 'undefined') {
  window.authorMatcher = {
    normalizeProfileName,
    levenshteinDistance,
    isCoFirstAuthor,
    getAuthorSymbol,
    isCharSubset,
    getMatchScore,
    findBestMatch
  };
}
