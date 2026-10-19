const openAlexInFlight = new Map();
let openAlexQueue = Promise.resolve();
let openAlexLastStartedAt = 0;
let openAlexBlockedUntil = 0;
const OPENALEX_MINIMUM_INTERVAL_MS = 100;

function fetchOpenAlex(url) {
  const key = url.toString();
  if (openAlexInFlight.has(key)) return openAlexInFlight.get(key);

  const run = async () => {
    if (openAlexBlockedUntil > Date.now()) {
      return { ok: false, status: 429, error: 'OpenAlex is temporarily rate limited.' };
    }
    const waitMs = Math.max(0, OPENALEX_MINIMUM_INTERVAL_MS - (Date.now() - openAlexLastStartedAt));
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
    openAlexLastStartedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(key, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        redirect: 'error',
        signal: controller.signal
      });
      let data = null;
      try {
        data = await response.json();
      } catch (_error) {
        // Preserve the HTTP status even if an upstream error is not JSON.
      }
      const retryAfter = response.headers.get('retry-after');
      if (response.status === 429) {
        const retrySeconds = Number.parseInt(retryAfter, 10);
        openAlexBlockedUntil = Date.now() +
          (Number.isFinite(retrySeconds) ? Math.min(retrySeconds, 60) * 1000 : 15000);
      }
      return {
        ok: response.ok,
        status: response.status,
        data,
        headers: {
          limit: response.headers.get('x-ratelimit-limit'),
          remaining: response.headers.get('x-ratelimit-remaining'),
          used: response.headers.get('x-ratelimit-credits-used'),
          reset: response.headers.get('x-ratelimit-reset'),
          retryAfter
        }
      };
    } catch (error) {
      return {
        ok: false,
        status: 0,
        error: error?.name === 'AbortError' ? 'OpenAlex request timed out.' : 'OpenAlex request failed.'
      };
    } finally {
      clearTimeout(timeout);
    }
  };

  // Keep different OpenAlex requests globally serial across tabs. Identical
  // URLs are still coalesced by the map below.
  const request = openAlexQueue.then(run, run);
  openAlexQueue = request.then(() => undefined, () => undefined);

  openAlexInFlight.set(key, request);
  request.finally(() => openAlexInFlight.delete(key));
  return request;
}

function validateOpenAlexUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch (_error) {
    return null;
  }
  if (url.origin !== 'https://api.openalex.org' || url.username || url.password || url.hash) return null;
  if (url.pathname !== '/works' && url.pathname !== '/authors' && !url.pathname.startsWith('/works/')) {
    return null;
  }
  return url;
}

const metadataSourceConfigs = {
  arxiv: {
    origin: 'https://export.arxiv.org',
    accept: 'application/atom+xml',
    minimumIntervalMs: 3000,
    timeoutMs: 8000
  },
  crossref: {
    origin: 'https://api.crossref.org',
    accept: 'application/json',
    minimumIntervalMs: 250,
    timeoutMs: 5000
  },
  datacite: {
    origin: 'https://api.datacite.org',
    accept: 'application/json',
    minimumIntervalMs: 500,
    timeoutMs: 5000
  }
};

const metadataSourceStates = new Map();

function validateMetadataUrl(source, value) {
  const config = metadataSourceConfigs[source];
  if (!config) return null;
  let url;
  try {
    url = new URL(value);
  } catch (_error) {
    return null;
  }
  if (url.origin !== config.origin || url.username || url.password || url.hash) return null;

  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch (_error) {
    return null;
  }
  if (source === 'arxiv') {
    if (pathname !== '/api/query') return null;
    const ids = (url.searchParams.get('id_list') || '').split(',').filter(Boolean);
    if (ids.length === 0 || ids.length > 10 ||
        ids.some((id) => !/^(?:\d{4}\.\d{4,5}|[a-z.-]+\/\d{7})(?:v\d+)?$/i.test(id)) ||
        [...url.searchParams.keys()].some((key) => key !== 'id_list')) return null;
  } else {
    const prefix = source === 'crossref' ? '/works/' : '/dois/';
    if (!pathname.startsWith(prefix) ||
        !/^10\.\d{4,9}\/[^\s\x00-\x1f"<>?#]{1,512}$/i.test(pathname.slice(prefix.length)) ||
        url.search) return null;
  }
  return url;
}

function fetchLastAuthorMetadata(source, url) {
  const config = metadataSourceConfigs[source];
  const state = metadataSourceStates.get(source) || {
    queue: Promise.resolve(),
    inFlight: new Map(),
    lastStartedAt: 0,
    blockedUntil: 0
  };
  metadataSourceStates.set(source, state);
  const key = url.toString();
  if (state.inFlight.has(key)) return state.inFlight.get(key);

  const run = async () => {
    if (state.blockedUntil > Date.now()) {
      return { ok: false, status: 429, error: `${source} is temporarily rate limited.` };
    }
    const waitMs = Math.max(0, config.minimumIntervalMs - (Date.now() - state.lastStartedAt));
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
    state.lastStartedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const response = await fetch(key, {
        method: 'GET',
        headers: { Accept: config.accept },
        redirect: 'error',
        signal: controller.signal
      });
      let data = null;
      let text = null;
      if (source === 'arxiv') {
        try { text = await response.text(); } catch (_error) { /* Keep status. */ }
      } else {
        try { data = await response.json(); } catch (_error) { /* Keep status. */ }
      }
      const retryAfter = response.headers.get('retry-after');
      if (response.status === 429 || response.status === 403) {
        const retrySeconds = Number.parseInt(retryAfter, 10);
        state.blockedUntil = Date.now() +
          (Number.isFinite(retrySeconds) ? Math.min(retrySeconds, 60) * 1000 : 15000);
      }
      return {
        ok: response.ok,
        status: response.status,
        data,
        text,
        headers: { retryAfter }
      };
    } catch (error) {
      return {
        ok: false,
        status: 0,
        error: error?.name === 'AbortError' ? `${source} request timed out.` : `${source} request failed.`
      };
    } finally {
      clearTimeout(timeout);
    }
  };

  const request = state.queue.then(run, run);
  state.queue = request.then(() => undefined, () => undefined);
  state.inFlight.set(key, request);
  request.finally(() => state.inFlight.delete(key));
  return request;
}

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'fetchOpenAlex') {
    const url = validateOpenAlexUrl(request.url);
    if (!url) {
      sendResponse({ ok: false, status: 400, error: 'Invalid OpenAlex URL.' });
      return false;
    }

    fetchOpenAlex(url).then(sendResponse);
    return true;
  }

  if (request.action === 'fetchLastAuthorMetadata') {
    const url = validateMetadataUrl(request.source, request.url);
    if (!url) {
      sendResponse({ ok: false, status: 403, error: 'Metadata source or exact-ID URL is not allowed.' });
      return false;
    }
    fetchLastAuthorMetadata(request.source, url).then(sendResponse);
    return true;
  }

  if (request.action === 'scholarSearch') {
    const query = String(request.query || '').trim().slice(0, 300);
    if (!query) {
      sendResponse({ ok: false, status: 400, error: 'Empty query.' });
      return false;
    }
    const url = 'https://scholar.google.com/scholar?q=' + encodeURIComponent(query);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    fetch(url, {
      method: 'GET',
      headers: { Accept: 'text/html' },
      signal: controller.signal
    }).then(async (response) => {
      const text = response.ok ? await response.text() : null;
      sendResponse({ ok: response.ok, status: response.status, text });
    }).catch((_error) => {
      sendResponse({ ok: false, status: 0, error: 'Scholar request failed.' });
    }).finally(() => clearTimeout(timeout));
    return true;
  }

  if (request.action !== 'captureTab') {
    return false;
  }

  if (request.action === 'captureTab') {
    if (!sender.tab || typeof sender.tab.id !== 'number' || typeof sender.tab.windowId !== 'number') {
      sendResponse({ error: 'Unable to identify the active Scholar tab.' });
      return false;
    }

    const sourceTab = sender.tab;
    let switchedAway = false;
    const onActivated = (activeInfo) => {
      if (activeInfo.windowId === sourceTab.windowId && activeInfo.tabId !== sourceTab.id) {
        switchedAway = true;
      }
    };
    const finish = (response) => {
      chrome.tabs.onActivated.removeListener(onActivated);
      sendResponse(response);
    };
    const confirmActiveTab = (callback) => {
      chrome.tabs.query({ active: true, windowId: sourceTab.windowId }, (tabs) => {
        if (chrome.runtime.lastError) {
          callback(chrome.runtime.lastError.message);
          return;
        }
        callback(null, tabs[0]);
      });
    };

    chrome.tabs.onActivated.addListener(onActivated);
    confirmActiveTab((beforeError, activeTab) => {
      if (beforeError) {
        finish({ error: beforeError });
        return;
      }
      if (!activeTab || activeTab.id !== sourceTab.id) {
        finish({ error: 'The Scholar tab must stay active while taking the screenshot.' });
        return;
      }

      chrome.tabs.captureVisibleTab(sourceTab.windowId, { format: 'png' }, (dataUrl) => {
        if (chrome.runtime.lastError) {
          finish({ error: chrome.runtime.lastError.message });
          return;
        }

        confirmActiveTab((afterError, activeTabAfterCapture) => {
          if (afterError) {
            finish({ error: afterError });
            return;
          }
          if (switchedAway || !activeTabAfterCapture || activeTabAfterCapture.id !== sourceTab.id) {
            finish({ error: 'The active tab changed before the screenshot finished. Please try again.' });
            return;
          }

          finish({ dataUrl });
        });
      });
    });
    return true;
  }
  return false;
});
