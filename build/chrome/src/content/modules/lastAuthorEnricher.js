(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.lastAuthorEnricher = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const OPENALEX_ORIGIN = 'https://api.openalex.org';
  const CACHE_PREFIX = 'openAlexLastAuthorV4:';
  const QUOTA_CACHE_KEY = 'openAlexLastAuthorQuotaV1';
  const CACHE_VERSION = 4;
  const AUTHOR_CACHE_MS = 30 * 24 * 60 * 60 * 1000;
  const RESULT_CACHE_MS = 180 * 24 * 60 * 60 * 1000;
  const NEGATIVE_CACHE_MS = 24 * 60 * 60 * 1000;
  const MAX_PROFILE_CREDITS = 30;
  const MAX_WORK_PAGES = 10;
  const MAX_NAME_CANDIDATES = 5;
  const MAX_UNCONFIRMED_CANDIDATE_PAGES = 2;
  const MAX_AUTHORSHIPS = 100;
  const MAX_REQUEST_RETRIES = 1;
  const MAX_EXTERNAL_ID_BATCH = 50;
  const MAX_BATCH_URL_LENGTH = 6000;
  const MAX_ZERO_CREDIT_SINGLETONS = 10;
  const MAX_METADATA_FALLBACK_RECORDS = 10;
  const METADATA_FALLBACK_TIME_BUDGET_MS = 15000;

  function normalizeTitle(value) {
    return String(value || '')
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\p{L}\p{N}]+/gu, '');
  }

  function normalizeDoi(value) {
    let candidateText = String(value || '');
    try { candidateText = decodeURIComponent(candidateText); } catch (_error) { /* Use raw text. */ }
    const match = candidateText.match(/10\.\d{4,9}\/[^\s\x00-\x1f"<>?#]{1,512}/i);
    if (!match) return '';
    let doi = match[0].replace(/\.$/, '');
    const pairs = [['(', ')'], ['[', ']'], ['{', '}']];
    let changed = true;
    while (changed && doi) {
      changed = false;
      pairs.forEach(([open, close]) => {
        if (!doi.endsWith(close)) return;
        const opens = [...doi].filter((character) => character === open).length;
        const closes = [...doi].filter((character) => character === close).length;
        if (closes > opens) {
          doi = doi.slice(0, -1);
          changed = true;
        }
      });
    }
    return doi.toLowerCase();
  }

  function normalizeArxivId(value) {
    const match = String(value || '').match(
      /(?:arxiv\s*:\s*|arxiv\.org\/(?:abs|pdf)\/)((?:\d{4}\.\d{4,5}|[a-z.-]+\/\d{7})(?:v\d+)?)/i
    );
    return match ? match[1].replace(/v\d+$/i, '').toLowerCase() : '';
  }

  function paperKey(title, year) {
    const normalizedTitle = normalizeTitle(title);
    const normalizedYear = Number.parseInt(year, 10);
    if (!normalizedTitle || !Number.isInteger(normalizedYear)) return '';
    return `${normalizedYear}:${normalizedTitle}`;
  }

  function shortOpenAlexId(value) {
    const match = String(value || '').match(/\bA\d+\b/i);
    return match ? match[0].toUpperCase() : '';
  }

  function splitAuthors(authorsText) {
    return String(authorsText || '')
      .split(',')
      .map((author) => author.trim())
      .filter((author) => author && !/^(?:\.{3,}|…)$/.test(author));
  }

  function hasEllipsis(value) {
    return /(?:\.{3,}|…)/.test(String(value || ''));
  }

  function getBestOwnerMatch(authorList, profileName, aliases, matcher) {
    if (!matcher || !Array.isArray(authorList) || authorList.length === 0) return null;
    const names = [profileName, ...(aliases || [])].filter(Boolean);
    const scored = authorList.map((author, index) => {
      let score = Infinity;
      names.forEach((name) => {
        const cleaned = matcher.normalizeProfileName(name);
        score = Math.min(score, matcher.getMatchScore(author, cleaned, name));
      });
      return { index, score };
    }).filter((item) => Number.isFinite(item.score)).sort((left, right) => left.score - right.score);

    if (scored.length === 0) return null;
    if (scored.length > 1 && scored[1].score - scored[0].score < 1) return null;
    return scored[0];
  }

  function genericTitlePenalty(title) {
    const normalized = String(title || '').trim().toLowerCase();
    return /^(editorial|introduction|preface|foreword|correction|erratum|comment|reply|response)\b/.test(normalized)
      ? 1000
      : 0;
  }

  function selectAnchor(records) {
    return records
      .filter((record) =>
        !record.includesEllipsis &&
        record.key &&
        record.year &&
        record.ownerMatch &&
        record.authorList.length > 0 &&
        record.authorList.length < MAX_AUTHORSHIPS
      )
      .sort((left, right) => {
        const leftScore = normalizeTitle(left.title).length - genericTitlePenalty(left.title) - left.authorList.length;
        const rightScore = normalizeTitle(right.title).length - genericTitlePenalty(right.title) - right.authorList.length;
        return rightScore - leftScore;
      })[0] || null;
  }

  function namesCompatible(candidateNames, profileName, aliases, matcher) {
    const names = (candidateNames || []).filter(Boolean);
    if (names.length === 0) return false;
    return names.some((candidate) => {
      const result = matcher.findBestMatch(
        [candidate],
        matcher.normalizeProfileName(profileName),
        profileName,
        aliases || []
      );
      return Number.isFinite(result.score) && result.matchIndex === 0;
    });
  }

  function resolveAnchorWork(results, anchor, profileName, aliases, matcher) {
    if (!anchor || !anchor.ownerMatch) return null;
    const viable = [];
    let exactMatchCount = 0;

    (results || []).forEach((work) => {
      if (paperKey(work.title, work.publication_year) !== anchor.key) return;
      exactMatchCount += 1;
      const authorships = Array.isArray(work.authorships) ? work.authorships : [];
      if (authorships.length !== anchor.authorList.length || authorships.length >= MAX_AUTHORSHIPS) return;

      const target = authorships[anchor.ownerMatch.index];
      const authorId = shortOpenAlexId(target?.author?.id);
      if (!authorId) return;

      const candidateNames = [target.raw_author_name, target.author?.display_name];
      if (!namesCompatible(candidateNames, profileName, aliases, matcher)) return;
      viable.push({ work, authorId });
    });

    if (exactMatchCount === 0 || viable.length !== exactMatchCount) return null;
    const authorIds = [...new Set(viable.map((item) => item.authorId))];
    if (authorIds.length !== 1) return null;
    return viable.find((item) => item.authorId === authorIds[0]) || null;
  }

  function buildWorkGroups(works) {
    const groups = new Map();
    (works || []).forEach((work) => {
      const key = paperKey(work.title, work.publication_year);
      if (!key) return;
      const group = groups.get(key) || [];
      group.push(work);
      groups.set(key, group);
    });
    return groups;
  }

  function getMatchingWorks(record, groups) {
    const exact = groups.get(record.key) || [];
    if (exact.length > 0) return exact;

    const adjacent = [-1, 1]
      .map((offset) => groups.get(paperKey(record.title, record.year + offset)) || [])
      .filter((group) => group.length > 0);
    return adjacent.length === 1 ? adjacent[0] : [];
  }

  function buildUniqueWorkIndex(works) {
    const index = new Map();
    (works || []).forEach((work) => {
      const key = paperKey(work.title, work.publication_year);
      if (!key) return;
      if (index.has(key)) {
        index.set(key, null);
      } else {
        index.set(key, work);
      }
    });
    return index;
  }

  function buildUniqueRecordIndex(records) {
    const index = new Map();
    (records || []).forEach((record) => {
      if (!record.key) return;
      if (index.has(record.key)) {
        index.set(record.key, null);
      } else {
        index.set(record.key, record);
      }
    });
    return index;
  }

  function countIdentityEvidence(records, works, anchorKey, authorId) {
    const groups = buildWorkGroups(works);
    const matchedKeys = new Set();
    records.forEach((record) => {
      const matchingWorks = getMatchingWorks(record, groups);
      if (matchingWorks.length === 0) return;
      const allContainAuthor = matchingWorks.every((work) => {
        const authorships = Array.isArray(work?.authorships) ? work.authorships : [];
        return authorships.length > 0 && authorships.length < MAX_AUTHORSHIPS &&
          authorships.some((authorship) => shortOpenAlexId(authorship?.author?.id) === authorId);
      });
      if (allContainAuthor) matchedKeys.add(record.key);
    });
    return {
      count: matchedKeys.size,
      hasIndependentMatch: [...matchedKeys].some((key) => key !== anchorKey),
      matchedKeys
    };
  }

  function identityIsConfirmed(records, works, anchorKey, authorId) {
    const required = records.length >= 10 ? 3 : 2;
    const evidence = countIdentityEvidence(records, works, anchorKey, authorId);
    return evidence.count >= required && evidence.hasIndependentMatch;
  }

  function classifyKnownAuthorMatches(unknownRecords, works, authorId) {
    const worksByKey = buildWorkGroups(works);
    const recordIndex = buildUniqueRecordIndex(unknownRecords);
    const matches = new Map();
    const decidedKeys = new Set();
    recordIndex.forEach((record) => {
      if (!record) return;
      const matchingWorks = getMatchingWorks(record, worksByKey);
      if (matchingWorks.length === 0) return;

      // OpenAlex can retain multiple records for the same publication (for
      // example, a proceedings record and a repository record). Accept those
      // duplicates only when every record agrees on last versus non-last.
      // Missing/ambiguous authors or positions keep the row unresolved.
      const targets = matchingWorks.map((work) => {
        const authorships = Array.isArray(work?.authorships) ? work.authorships : [];
        if (authorships.length === 0 || authorships.length >= MAX_AUTHORSHIPS) return null;
        const owners = authorships.filter((authorship) => shortOpenAlexId(authorship?.author?.id) === authorId);
        return owners.length === 1 ? owners[0] : null;
      });
      if (targets.every((target) => target?.author_position === 'last')) {
        decidedKeys.add(record.key);
        matches.set(record.key, {
          workId: matchingWorks[0].id || '',
          resolvedAt: Date.now()
        });
      } else if (targets.every((target) => ['first', 'middle'].includes(target?.author_position))) {
        decidedKeys.add(record.key);
      }
    });
    return { lastMatches: matches, decidedKeys };
  }

  function collectLastAuthorMatches(unknownRecords, works, authorId) {
    return classifyKnownAuthorMatches(unknownRecords, works, authorId).lastMatches;
  }

  function extractAliases() {
    const aliases = [];
    document.querySelectorAll('.gsc_prf_il').forEach((row) => {
      const match = row.textContent.trim().match(/^(also published as|also known as|alternative names|\u522b\u540d|\u66fe\u7528\u540d)[:\s]+(.*)/i);
      if (match?.[2]) aliases.push(...match[2].split(',').map((name) => name.trim()).filter(Boolean));
    });
    const otherNames = document.querySelector('#gs_prf_ion_txt')?.textContent.trim();
    if (otherNames) aliases.push(...otherNames.split(',').map((name) => name.trim()).filter(Boolean));
    return [...new Set(aliases)];
  }

  function extractDoiFromPaper(paper) {
    const candidates = [paper.textContent];
    paper.querySelectorAll('a[href]').forEach((link) => candidates.push(link.href));
    for (const candidate of candidates) {
      const doi = normalizeDoi(candidate);
      if (doi) return doi;
    }
    return '';
  }

  function extractExternalDoiFromPaper(paper) {
    const doi = extractDoiFromPaper(paper);
    if (doi) return doi;

    const candidates = [paper.textContent];
    paper.querySelectorAll('a[href]').forEach((link) => candidates.push(link.href));
    for (const candidate of candidates) {
      const arxivId = normalizeArxivId(candidate);
      if (arxivId) return `10.48550/arxiv.${arxivId}`;
    }
    return '';
  }

  function extractArxivIdFromPaper(paper) {
    const candidates = [paper.textContent];
    paper.querySelectorAll('a[href]').forEach((link) => candidates.push(link.href));
    for (const candidate of candidates) {
      const arxivId = normalizeArxivId(candidate);
      if (arxivId) return arxivId;
    }
    return '';
  }

  function extractPageRecords(profileName, aliases, matcher) {
    return [...document.querySelectorAll('.gsc_a_tr')].map((paper) => {
      const title = paper.querySelector('.gsc_a_at')?.textContent.trim() || '';
      const year = Number.parseInt(paper.querySelector('.gsc_a_y')?.textContent.trim(), 10);
      const authorsText = paper.querySelector('.gs_gray')?.textContent.trim() || '';
      const authorList = splitAuthors(authorsText);
      const includesEllipsis = hasEllipsis(authorsText);
      const ownerMatch = getBestOwnerMatch(authorList, profileName, aliases, matcher);
      return {
        paper,
        title,
        year: Number.isInteger(year) ? year : null,
        key: paperKey(title, year),
        authorsText,
        authorList,
        includesEllipsis,
        definitiveVisibleNonLast: includesEllipsis && /(?:\.{3,}|…)\s*$/.test(authorsText) && Boolean(ownerMatch),
        doi: extractExternalDoiFromPaper(paper),
        arxivId: extractArxivIdFromPaper(paper),
        ownerMatch
      };
    }).filter((record) => record.key);
  }

  function getScholarProfileId() {
    return new URL(window.location.href).searchParams.get('user') || '';
  }

  function storageGet(area, key) {
    return new Promise((resolve) => {
      if (!area) return resolve(undefined);
      area.get(key, (result) => {
        if (chrome.runtime.lastError) return resolve(undefined);
        resolve(result?.[key]);
      });
    });
  }

  function storageSet(area, key, value) {
    return new Promise((resolve) => {
      if (!area) return resolve();
      area.set({ [key]: value }, () => resolve());
    });
  }

  function nextUtcMidnight(now = Date.now()) {
    const date = new Date(now);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
  }

  function recordFingerprint(records, profileName = '', aliases = []) {
    const identity = [profileName, ...(aliases || [])]
      .map((name) => String(name || '').normalize('NFKD').toLowerCase().trim())
      .filter(Boolean)
      .sort()
      .join('|');
    const recordKeys = (records || []).map((record) => record.key).filter(Boolean).sort().join('|');
    const value = `${identity}::${recordKeys}`;
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `${records?.length || 0}:${(hash >>> 0).toString(16)}`;
  }

  function shouldBatchExternalIds(count, quota, now = Date.now()) {
    if (count < 2) return false;
    if (quota?.blockedUntil > now) return false;
    return !Number.isFinite(quota?.remaining) || quota.remaining >= 1;
  }

  function isBatchSafeDoi(doi) {
    // OpenAlex uses comma between filters and pipe between OR values after URL
    // decoding. Those characters are valid in DOI suffixes, so such identifiers
    // must use the free singleton endpoint instead of filter interpolation.
    return Boolean(doi) && !/[|,]/.test(doi);
  }

  function buildExternalIdBatches(dois) {
    const batches = [];
    let current = [];
    (dois || []).forEach((doi) => {
      const candidate = [...current, doi];
      const candidateUrl = makeUrl('/works', {
        filter: `doi:${candidate.join('|')}`,
        per_page: '100',
        select: 'id,title,publication_year,doi,authorships'
      });
      if (current.length > 0 &&
          (candidate.length > MAX_EXTERNAL_ID_BATCH || candidateUrl.length > MAX_BATCH_URL_LENGTH)) {
        batches.push(current);
        current = [doi];
      } else {
        current = candidate;
      }
    });
    if (current.length > 0) batches.push(current);
    return batches;
  }

  function isPaidQuotaError(error) {
    return /profile budget|quota|daily credit|enough anonymous credits/i.test(String(error?.message || ''));
  }

  function isOpenAlexUnavailableError(error) {
    return isPaidQuotaError(error) ||
      /rate limit|timed out|request failed|status (?:0|4\d\d|5\d\d)/i.test(String(error?.message || ''));
  }

  async function sendOpenAlexRequest(url) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: 'fetchOpenAlex', url }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (!response) {
          reject(new Error('OpenAlex returned no response.'));
        } else {
          resolve(response);
        }
      });
    });
  }

  async function sendMetadataRequest(source, url) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: 'fetchLastAuthorMetadata', source, url }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (!response) {
          reject(new Error(`${source} returned no response.`));
        } else {
          resolve(response);
        }
      });
    });
  }

  function decodeXmlText(value) {
    const entities = {
      amp: '&', lt: '<', gt: '>', quot: '"', apos: "'"
    };
    return String(value || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_match, entity) => {
        if (entity[0] === '#') {
          const radix = entity[1]?.toLowerCase() === 'x' ? 16 : 10;
          const digits = radix === 16 ? entity.slice(2) : entity.slice(1);
          const codePoint = Number.parseInt(digits, radix);
          return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : '';
        }
        return entities[entity.toLowerCase()] || '';
      })
      .replace(/\s+/g, ' ')
      .trim();
  }

  function firstXmlTag(block, tag) {
    const match = String(block || '').match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
    return decodeXmlText(match?.[1]);
  }

  function makeOrderedAuthorships(names) {
    return (names || []).filter(Boolean).map((name, index, all) => ({
      author_position: index === 0 ? 'first' : (index === all.length - 1 ? 'last' : 'middle'),
      raw_author_name: name,
      author: { display_name: name }
    }));
  }

  function parseArxivAtom(xml) {
    const works = [];
    const entries = String(xml || '').match(/<entry\b[^>]*>[\s\S]*?<\/entry>/gi) || [];
    entries.forEach((entry) => {
      const arxivId = normalizeArxivId(firstXmlTag(entry, 'id'));
      const title = firstXmlTag(entry, 'title');
      const published = firstXmlTag(entry, 'published') || firstXmlTag(entry, 'updated');
      const authorBlocks = entry.match(/<author\b[^>]*>[\s\S]*?<\/author>/gi) || [];
      const names = authorBlocks.map((block) => firstXmlTag(block, 'name')).filter(Boolean);
      const year = Number.parseInt(published, 10);
      if (!arxivId || !title || !Number.isInteger(year) || names.length === 0) return;
      works.push({
        id: `https://arxiv.org/abs/${arxivId}`,
        title,
        publication_year: year,
        doi: `https://doi.org/10.48550/arxiv.${arxivId}`,
        authorships: makeOrderedAuthorships(names)
      });
    });
    return works;
  }

  function crossrefMessageToWork(message) {
    const title = Array.isArray(message?.title) ? message.title[0] : message?.title;
    const dateParts = message?.published?.['date-parts'] || message?.issued?.['date-parts'] || [];
    const year = Number.parseInt(dateParts?.[0]?.[0], 10);
    const names = (message?.author || []).map((author) =>
      [author?.given, author?.family].filter(Boolean).join(' ').trim() || author?.name || ''
    ).filter(Boolean);
    const doi = normalizeDoi(message?.DOI);
    if (!title || !Number.isInteger(year) || !doi || names.length === 0) return null;
    return {
      id: `https://doi.org/${doi}`,
      title,
      publication_year: year,
      doi: `https://doi.org/${doi}`,
      authorships: makeOrderedAuthorships(names)
    };
  }

  function dataCiteAttributesToWork(attributes) {
    const title = attributes?.titles?.find((item) => item?.title)?.title;
    const year = Number.parseInt(attributes?.publicationYear, 10);
    const names = (attributes?.creators || []).map((creator) =>
      [creator?.givenName, creator?.familyName].filter(Boolean).join(' ').trim() || creator?.name || ''
    ).filter(Boolean);
    const doi = normalizeDoi(attributes?.doi);
    if (!title || !Number.isInteger(year) || !doi || names.length === 0) return null;
    return {
      id: `https://doi.org/${doi}`,
      title,
      publication_year: year,
      doi: `https://doi.org/${doi}`,
      authorships: makeOrderedAuthorships(names)
    };
  }

  function arxivIdForRecord(record) {
    if (record?.arxivId) return normalizeArxivId(`arXiv:${record.arxivId}`);
    const match = normalizeDoi(record?.doi).match(
      /^10\.48550\/arxiv\.((?:\d{4}\.\d{4,5}|[a-z.-]+\/\d{7}))$/i
    );
    return match?.[1]?.toLowerCase() || '';
  }

  async function fetchMetadataFallbackWorks(records, context, onWorks) {
    const startedAt = Date.now();
    const selectedByDoi = new Map();
    (records || []).filter((record) => record?.doi).forEach((record) => {
      const doi = normalizeDoi(record.doi);
      if (doi && !selectedByDoi.has(doi)) selectedByDoi.set(doi, record);
    });
    const selected = [...selectedByDoi.values()].slice(0, MAX_METADATA_FALLBACK_RECORDS);
    const request = context.metadataRequest || sendMetadataRequest;
    const works = [];
    const decidedKeys = new Set();
    const emit = async (newWorks, source) => {
      const valid = (newWorks || []).filter(Boolean);
      if (valid.length === 0) return;
      works.push(...valid);
      const result = await onWorks?.(valid, source);
      (result?.decidedKeys || []).forEach((key) => decidedKeys.add(key));
    };
    const unresolved = () => selected.filter((record) =>
      record.paper?.dataset?.isLastAuthor !== 'true' && !decidedKeys.has(record.key)
    );

    const arxivIds = [...new Set(selected.map(arxivIdForRecord).filter(Boolean))];
    if (arxivIds.length > 0 && Date.now() - startedAt < METADATA_FALLBACK_TIME_BUDGET_MS) {
      const url = new URL('/api/query', 'https://export.arxiv.org');
      url.searchParams.set('id_list', arxivIds.join(','));
      try {
        const response = await request('arxiv', url.toString());
        if (response?.ok) await emit(parseArxivAtom(response.text), 'arxiv-exact-id');
      } catch (_error) {
        // Metadata fallbacks are optional and must never block Scholar rendering.
      }
    }

    const crossrefDois = [...new Set(unresolved()
      .map((record) => normalizeDoi(record.doi))
      .filter((doi) => doi && !/^10\.48550\/arxiv\./i.test(doi)))];
    for (const doi of crossrefDois) {
      if (Date.now() - startedAt >= METADATA_FALLBACK_TIME_BUDGET_MS) break;
      const encodedDoi = doi.split('/').map(encodeURIComponent).join('/');
      try {
        const response = await request('crossref', `https://api.crossref.org/works/${encodedDoi}`);
        if (response?.ok) {
          await emit([crossrefMessageToWork(response.data?.message)], 'crossref-exact-doi');
        } else if (response?.status === 429 || response?.status >= 500 || response?.status === 0) {
          break;
        }
      } catch (_error) {
        break;
      }
    }

    const dataCiteDois = [...new Set(unresolved().map((record) => normalizeDoi(record.doi)).filter(Boolean))];
    for (const doi of dataCiteDois) {
      if (Date.now() - startedAt >= METADATA_FALLBACK_TIME_BUDGET_MS) break;
      const encodedDoi = doi.split('/').map(encodeURIComponent).join('/');
      try {
        const response = await request('datacite', `https://api.datacite.org/dois/${encodedDoi}`);
        if (response?.ok) {
          await emit([dataCiteAttributesToWork(response.data?.data?.attributes)], 'datacite-exact-doi');
        } else if (response?.status === 429 || response?.status >= 500 || response?.status === 0) {
          break;
        }
      } catch (_error) {
        break;
      }
    }
    return works;
  }

  async function requestJson(url, cost, context, retryCount = 0) {
    if (context.creditsUsed + cost > MAX_PROFILE_CREDITS) {
      throw new Error('OpenAlex profile budget reached.');
    }

    const quota = await storageGet(context.storage, QUOTA_CACHE_KEY);
    const now = Date.now();
    if (quota?.rateBlockedUntil > now) throw new Error('OpenAlex rate limit is temporarily unavailable.');
    // Daily paid-credit exhaustion must not disable singleton lookups: OpenAlex
    // explicitly prices direct ID/DOI retrieval at zero credits.
    if (cost > 0 && quota?.blockedUntil > now) {
      throw new Error('OpenAlex quota is temporarily unavailable.');
    }
    if (quota?.resetAt > now && Number.isFinite(quota.remaining) && quota.remaining < cost) {
      throw new Error('OpenAlex does not have enough anonymous credits for this request.');
    }

    const response = await context.request(url);
    const resetSeconds = Number.parseInt(response.headers?.reset, 10);
    const resetAt = Number.isFinite(resetSeconds) ? Date.now() + resetSeconds * 1000 : nextUtcMidnight();
    const remaining = Number.parseInt(response.headers?.remaining, 10);
    const reportedCost = Number.parseInt(response.headers?.used, 10);
    context.creditsUsed += Number.isFinite(reportedCost) ? reportedCost : cost;

    if (Number.isFinite(remaining)) {
      await storageSet(context.storage, QUOTA_CACHE_KEY, {
        remaining,
        resetAt,
        blockedUntil: remaining <= 0 ? resetAt : 0
      });
    }

    if (response.status === 429) {
      if (remaining <= 0) {
        await storageSet(context.storage, QUOTA_CACHE_KEY, { remaining: 0, resetAt, blockedUntil: resetAt });
        throw new Error('OpenAlex daily credit budget reached.');
      }
      if (retryCount < MAX_REQUEST_RETRIES) {
        const retryAfter = Number.parseInt(response.headers?.retryAfter, 10);
        const waitMs = Number.isFinite(retryAfter)
          ? Math.min(retryAfter * 1000, 10000)
          : (2 ** retryCount) * 1000;
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        return requestJson(url, cost, context, retryCount + 1);
      }
      const retryAfter = Number.parseInt(response.headers?.retryAfter, 10);
      await storageSet(context.storage, QUOTA_CACHE_KEY, {
        remaining: Number.isFinite(remaining) ? remaining : quota?.remaining,
        resetAt,
        blockedUntil: quota?.blockedUntil || 0,
        rateBlockedUntil: Date.now() + (Number.isFinite(retryAfter) ? Math.min(retryAfter, 60) * 1000 : 15000)
      });
      throw new Error('OpenAlex rate limit reached.');
    }
    if ((response.status === 0 || response.status >= 500) && retryCount < MAX_REQUEST_RETRIES) {
      await new Promise((resolve) => setTimeout(resolve, (2 ** retryCount) * 1000));
      return requestJson(url, cost, context, retryCount + 1);
    }
    if (!response.ok) throw new Error(`OpenAlex request failed with status ${response.status}.`);
    return response.data;
  }

  function makeUrl(path, params) {
    const url = new URL(path, OPENALEX_ORIGIN);
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
    });
    return url.toString();
  }

  async function searchAnchor(anchor, context) {
    if (anchor.doi) {
      const encodedDoi = anchor.doi.split('/').map(encodeURIComponent).join('/');
      const url = makeUrl(`/works/https://doi.org/${encodedDoi}`, {
        select: 'id,title,publication_year,authorships'
      });
      try {
        const work = await requestJson(url, 0, context);
        return work ? [work] : [];
      } catch (error) {
        // Only a genuine DOI miss should spend credits on the title fallback.
        // Network, quota, and rate-limit failures stop OpenAlex for this page.
        if (!/status 404/.test(String(error?.message || ''))) throw error;
      }
    }

    const url = makeUrl('/works', {
      search: anchor.title,
      filter: `publication_year:${anchor.year}`,
      per_page: '5',
      select: 'id,title,publication_year,authorships'
    });
    const data = await requestJson(url, 10, context);
    return data?.results || [];
  }

  async function searchAuthors(profileName, context) {
    const url = makeUrl('/authors', {
      search: profileName,
      per_page: '5',
      select: 'id,display_name,display_name_alternatives,works_count,last_known_institutions,orcid'
    });
    const data = await requestJson(url, 10, context);
    return (data?.results || []).slice(0, MAX_NAME_CANDIDATES);
  }

  async function fetchCandidateWorks(authorId, years, records, unknownRecords, anchorKey, context, pageCap) {
    const works = [];
    let cursor = '*';
    let pages = 0;
    let confirmed = false;
    const expandedYears = new Set();
    years.forEach((year) => {
      expandedYears.add(year - 1);
      expandedYears.add(year);
      expandedYears.add(year + 1);
    });
    const yearFilter = [...expandedYears].sort((left, right) => right - left).slice(0, 100).join('|');

    while (cursor && pages < pageCap && context.creditsUsed < MAX_PROFILE_CREDITS) {
      const url = makeUrl('/works', {
        filter: `author.id:${authorId},publication_year:${yearFilter}`,
        sort: 'cited_by_count:desc',
        per_page: '100',
        cursor,
        select: 'id,title,publication_year,authorships'
      });
      const data = await requestJson(url, 1, context);
      works.push(...(data?.results || []));
      pages += 1;
      confirmed = identityIsConfirmed(records, works, anchorKey, authorId);

      if (confirmed) {
        const positiveMatches = collectLastAuthorMatches(unknownRecords, works, authorId);
        const workGroups = buildWorkGroups(works);
        const allPotentialMatchesSeen = unknownRecords.every((record) =>
          positiveMatches.has(record.key) || getMatchingWorks(record, workGroups).length > 0
        );
        if (allPotentialMatchesSeen) break;
      } else if (pages >= MAX_UNCONFIRMED_CANDIDATE_PAGES) {
        break;
      }

      cursor = data?.meta?.next_cursor || null;
    }

    return { works, confirmed };
  }

  async function fetchExternalIdWorks(records, context, onWorks) {
    const dois = [...new Set((records || []).map((record) => normalizeDoi(record.doi)).filter(Boolean))];
    const works = [];
    const fetchSingletons = async (batch) => {
      for (const doi of batch) {
        const encodedDoi = doi.split('/').map(encodeURIComponent).join('/');
        const url = makeUrl(`/works/https://doi.org/${encodedDoi}`, {
          select: 'id,title,publication_year,doi,authorships'
        });
        try {
          const work = await requestJson(url, 0, context);
          if (work) {
            works.push(work);
            await onWorks?.([work]);
          }
        } catch (error) {
          // A missing DOI should not prevent other exact-ID records from being attempted.
          if (!/status 404/.test(String(error?.message || ''))) throw error;
        }
      }
    };

    if (dois.length === 0) return works;
    const quota = await storageGet(context.storage, QUOTA_CACHE_KEY);
    const singletonDois = dois.filter((doi) => !isBatchSafeDoi(doi));
    const batchSafeDois = dois.filter(isBatchSafeDoi);
    let singletonBudget = MAX_ZERO_CREDIT_SINGLETONS;
    if (singletonDois.length > 0) {
      const selectedSingletons = singletonDois.slice(0, singletonBudget);
      await fetchSingletons(selectedSingletons);
      singletonBudget -= selectedSingletons.length;
    }

    if (batchSafeDois.length === 0) return works;
    if (!shouldBatchExternalIds(batchSafeDois.length, quota)) {
      await fetchSingletons(batchSafeDois.slice(0, singletonBudget));
      return works;
    }

    let processed = 0;
    for (const batch of buildExternalIdBatches(batchSafeDois)) {
      const url = makeUrl('/works', {
        filter: `doi:${batch.join('|')}`,
        per_page: '100',
        select: 'id,title,publication_year,doi,authorships'
      });
      try {
        const data = await requestJson(url, 1, context);
        const batchWorks = data?.results || [];
        works.push(...batchWorks);
        await onWorks?.(batchWorks);
      } catch (error) {
        if (/quota|daily credit|enough anonymous credits|profile budget/i.test(String(error?.message || ''))) {
          await fetchSingletons(batchSafeDois.slice(processed, processed + singletonBudget));
          return works;
        } else {
          throw error;
        }
      }
      processed += batch.length;
    }
    return works;
  }

  function classifyExternalIdMatches(records, works, profileName, aliases, matcher) {
    const worksByDoi = new Map();
    (works || []).forEach((work) => {
      const doi = normalizeDoi(work?.doi);
      if (!doi) return;
      const group = worksByDoi.get(doi) || [];
      group.push(work);
      worksByDoi.set(doi, group);
    });

    const matches = new Map();
    const decidedKeys = new Set();
    const authorIds = new Set();
    buildUniqueRecordIndex(records).forEach((record) => {
      if (!record) return;
      const matchingWorks = worksByDoi.get(normalizeDoi(record.doi)) || [];
      if (matchingWorks.length === 0) return;
      const positions = [];
      const recordAuthorIds = [];
      const allUsable = matchingWorks.every((work) => {
        if (normalizeTitle(work.title) !== normalizeTitle(record.title)) return false;
        if (Math.abs(Number(work.publication_year) - Number(record.year)) > 1) return false;
        const authorships = Array.isArray(work.authorships) ? work.authorships : [];
        if (authorships.length === 0 || authorships.length >= MAX_AUTHORSHIPS) return false;
        const compatible = authorships.filter((authorship) => namesCompatible(
          [authorship?.raw_author_name, authorship?.author?.display_name],
          profileName,
          aliases,
          matcher
        ));
        if (compatible.length !== 1 || !compatible[0].author_position) return false;
        const authorId = shortOpenAlexId(compatible[0]?.author?.id);
        if (authorId) recordAuthorIds.push(authorId);
        positions.push(compatible[0].author_position);
        return true;
      });
      if (!allUsable) return;
      recordAuthorIds.forEach((authorId) => authorIds.add(authorId));
      decidedKeys.add(record.key);
      if (positions.every((position) => position === 'last')) {
        matches.set(record.key, { workId: matchingWorks[0].id || '', resolvedAt: Date.now() });
      }
    });
    return { lastMatches: matches, decidedKeys, authorIds };
  }

  function collectExternalIdLastAuthorMatches(records, works, profileName, aliases, matcher) {
    return classifyExternalIdMatches(records, works, profileName, aliases, matcher).lastMatches;
  }

  function applyMatches(matches, records, cache, source) {
    let updated = 0;
    const recordIndex = buildUniqueRecordIndex(records);
    matches.forEach((value, key) => {
      const record = recordIndex.get(key);
      if (!record || record.paper.dataset.isLastAuthor === 'true') return;
      record.paper.dataset.isLastAuthor = 'true';
      record.paper.dataset.lastAuthorSource = source;
      cache.lastAuthorWorks[key] = value;
      delete cache.nonLastWorks?.[key];
      updated += 1;
    });
    return updated;
  }

  function applyCachedMatches(records, cache, now) {
    let changed = false;
    buildUniqueRecordIndex(records).forEach((record) => {
      if (!record) return;
      const cached = cache?.lastAuthorWorks?.[record.key];
      if (!cached || now - cached.resolvedAt > RESULT_CACHE_MS) return;
      if (record.paper.dataset.isLastAuthor !== 'true') {
        record.paper.dataset.isLastAuthor = 'true';
        record.paper.dataset.lastAuthorSource = 'openalex-cache';
        changed = true;
      }
    });
    return changed;
  }

  async function enrichPage(options = {}) {
    const matcher = window.authorMatcher;
    const profileName = document.querySelector('#gsc_prf_in')?.textContent.trim() || '';
    const profileId = getScholarProfileId();
    if (!matcher || !profileName || !profileId) return { updated: 0, reason: 'missing-profile' };

    const aliases = extractAliases();
    const records = extractPageRecords(profileName, aliases, matcher);
    const unknownRecords = records.filter((record) =>
      record.includesEllipsis && !record.definitiveVisibleNonLast &&
      record.paper.dataset.isLastAuthor !== 'true'
    );
    if (unknownRecords.length === 0) return { updated: 0, reason: 'nothing-to-enrich' };

    const storage = chrome.storage?.local;
    const cacheKey = `${CACHE_PREFIX}${profileId}`;
    const now = Date.now();
    const storedCache = await storageGet(storage, cacheKey);
    const cache = storedCache?.version === CACHE_VERSION
      ? storedCache
      : { version: CACHE_VERSION, lastAuthorWorks: {} };
    cache.lastAuthorWorks = cache.lastAuthorWorks || {};
    cache.nonLastWorks = cache.nonLastWorks || {};
    let updated = 0;
    if (applyCachedMatches(unknownRecords, cache, now)) {
      updated = unknownRecords.filter((record) => record.paper.dataset.isLastAuthor === 'true').length;
      options.onUpdated?.();
    }

    const unresolved = unknownRecords.filter((record) => {
      if (record.paper.dataset.isLastAuthor === 'true') return false;
      const nonLast = cache.nonLastWorks[record.key];
      return !nonLast || now - nonLast.resolvedAt > RESULT_CACHE_MS;
    });
    if (unresolved.length === 0) return { updated, reason: 'cache-hit' };
    const unresolvedFingerprint = recordFingerprint(unresolved, profileName, aliases);
    if (cache.negativeUntil > now && cache.negativeFingerprint === unresolvedFingerprint) {
      return { updated, reason: 'negative-cache' };
    }

    const context = {
      creditsUsed: 0,
      storage,
      request: options.request || sendOpenAlexRequest,
      metadataRequest: options.metadataRequest || sendMetadataRequest
    };

    try {
      let openAlexUnavailable = false;
      const commitProgress = async (matches, targetRecords, source) => {
        const delta = applyMatches(matches, targetRecords, cache, source);
        if (delta === 0) return 0;
        updated += delta;
        cache.version = CACHE_VERSION;
        await storageSet(storage, cacheKey, cache);
        options.onUpdated?.({ delta, updated, source });
        return delta;
      };
      const commitClassification = async (classification, targetRecords, source) => {
        const delta = await commitProgress(classification.lastMatches, targetRecords, source);
        let cacheChanged = false;
        classification.decidedKeys.forEach((key) => {
          if (classification.lastMatches.has(key)) return;
          cache.nonLastWorks[key] = { source, resolvedAt: Date.now() };
          cacheChanged = true;
        });
        if (cacheChanged) await storageSet(storage, cacheKey, cache);
        return { delta, decidedKeys: classification.decidedKeys };
      };

      const externalIdRecords = unresolved.filter((record) => record.doi);
      const exactDecidedKeys = new Set();
      const exactAuthorIds = new Set();
      if (externalIdRecords.length > 0) {
        try {
          await fetchExternalIdWorks(externalIdRecords, context, async (newWorks) => {
            const classification = classifyExternalIdMatches(
              externalIdRecords, newWorks, profileName, aliases, matcher
            );
            classification.decidedKeys.forEach((key) => exactDecidedKeys.add(key));
            classification.authorIds.forEach((authorId) => exactAuthorIds.add(authorId));
            await commitClassification(classification, externalIdRecords, 'openalex-external-id');
          });
        } catch (error) {
          if (isOpenAlexUnavailableError(error)) {
            openAlexUnavailable = true;
          } else {
            throw error;
          }
        }

        const fallbackRecords = externalIdRecords.filter((record) =>
          record.paper.dataset.isLastAuthor !== 'true' && !exactDecidedKeys.has(record.key)
        );
        if (fallbackRecords.length > 0) {
          await fetchMetadataFallbackWorks(fallbackRecords, context, async (newWorks, source) => {
            const classification = classifyExternalIdMatches(
              fallbackRecords, newWorks, profileName, aliases, matcher
            );
            classification.decidedKeys.forEach((key) => exactDecidedKeys.add(key));
            return commitClassification(classification, fallbackRecords, source);
          });
        }
      }

      const remainingRecords = unresolved.filter((record) =>
        record.paper.dataset.isLastAuthor !== 'true' && !exactDecidedKeys.has(record.key)
      );
      if (remainingRecords.length === 0) {
        cache.negativeUntil = 0;
        delete cache.negativeFingerprint;
        await storageSet(storage, cacheKey, cache);
        return { updated, reason: 'external-id-complete', creditsUsed: context.creditsUsed };
      }

      let authorId = cache.authorResolvedAt && now - cache.authorResolvedAt <= AUTHOR_CACHE_MS
        ? shortOpenAlexId(cache.openAlexAuthorId)
        : '';
      if (!authorId && exactAuthorIds.size === 1) authorId = [...exactAuthorIds][0];
      let anchorKey = '';
      let candidateWorks = [];

      if (!authorId && !openAlexUnavailable) {
        const anchor = selectAnchor(records);
        if (anchor) {
          try {
            const anchorResults = await searchAnchor(anchor, context);
            const resolved = resolveAnchorWork(anchorResults, anchor, profileName, aliases, matcher);
            if (resolved) {
              authorId = resolved.authorId;
              anchorKey = anchor.key;
            }
          } catch (error) {
            if (isOpenAlexUnavailableError(error)) openAlexUnavailable = true;
            else throw error;
          }
        }
      }

      const years = records.map((record) => record.year).filter(Number.isInteger);
      if (authorId && !openAlexUnavailable) {
        try {
          const fetched = await fetchCandidateWorks(
            authorId, years, records, remainingRecords, anchorKey, context, MAX_WORK_PAGES
          );
          if (!fetched.confirmed) {
            authorId = '';
            delete cache.openAlexAuthorId;
            delete cache.authorResolvedAt;
          }
          candidateWorks = fetched.works;
        } catch (error) {
          if (!isOpenAlexUnavailableError(error)) throw error;
          openAlexUnavailable = true;
          authorId = '';
        }
      }

      if (authorId) {
        const classification = classifyKnownAuthorMatches(remainingRecords, candidateWorks, authorId);
        await commitClassification(classification, remainingRecords, 'openalex');
      }

      if (!authorId && !openAlexUnavailable && context.creditsUsed + 10 < MAX_PROFILE_CREDITS) {
        try {
          const candidates = await searchAuthors(profileName, context);
          for (const candidate of candidates) {
            const candidateId = shortOpenAlexId(candidate.id);
            if (!candidateId) continue;
            const fetched = await fetchCandidateWorks(
              candidateId, years, records, remainingRecords, '', context, MAX_WORK_PAGES
            );
            if (fetched.confirmed) {
              authorId = candidateId;
              candidateWorks = fetched.works;
              break;
            }
          }
        } catch (error) {
          if (!isOpenAlexUnavailableError(error)) throw error;
          openAlexUnavailable = true;
        }
      }

      if (openAlexUnavailable) {
        return {
          updated,
          reason: 'unavailable',
          detail: 'OpenAlex was temporarily unavailable; no negative result was cached.',
          creditsUsed: context.creditsUsed
        };
      }

      if (!authorId || !identityIsConfirmed(records, candidateWorks, anchorKey, authorId)) {
        cache.negativeUntil = now + NEGATIVE_CACHE_MS;
        cache.negativeFingerprint = recordFingerprint(remainingRecords.filter((record) =>
          record.paper.dataset.isLastAuthor !== 'true'
        ), profileName, aliases);
        await storageSet(storage, cacheKey, cache);
        return { updated, reason: 'identity-unresolved', creditsUsed: context.creditsUsed };
      }

      const classification = classifyKnownAuthorMatches(remainingRecords, candidateWorks, authorId);
      await commitClassification(classification, remainingRecords, 'openalex');

      cache.version = CACHE_VERSION;
      cache.openAlexAuthorId = authorId;
      cache.authorResolvedAt = now;
      cache.negativeUntil = 0;
      delete cache.negativeFingerprint;
      await storageSet(storage, cacheKey, cache);
      return { updated, reason: 'complete', creditsUsed: context.creditsUsed };
    } catch (error) {
      return {
        updated,
        reason: 'unavailable',
        detail: String(error?.message || 'OpenAlex enrichment failed.'),
        creditsUsed: context.creditsUsed
      };
    }
  }

  return {
    constants: {
      MAX_PROFILE_CREDITS,
      MAX_WORK_PAGES,
      MAX_AUTHORSHIPS
    },
    normalizeTitle,
    normalizeDoi,
    normalizeArxivId,
    paperKey,
    shortOpenAlexId,
    splitAuthors,
    hasEllipsis,
    getBestOwnerMatch,
    selectAnchor,
    resolveAnchorWork,
    buildWorkGroups,
    getMatchingWorks,
    buildUniqueWorkIndex,
    buildUniqueRecordIndex,
    countIdentityEvidence,
    identityIsConfirmed,
    recordFingerprint,
    shouldBatchExternalIds,
    isBatchSafeDoi,
    buildExternalIdBatches,
      fetchExternalIdWorks,
    parseArxivAtom,
    crossrefMessageToWork,
    dataCiteAttributesToWork,
    fetchMetadataFallbackWorks,
    collectLastAuthorMatches,
    classifyKnownAuthorMatches,
    classifyExternalIdMatches,
    collectExternalIdLastAuthorMatches,
    enrichPage
  };
});
