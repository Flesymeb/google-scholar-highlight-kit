document.addEventListener('DOMContentLoaded', function() {
    const input = document.getElementById('search-input');
    const scholarButton = document.getElementById('scholar-button');
    const githubSearchButton = document.getElementById('github-search-button');
    const hfSearchButton = document.getElementById('hf-search-button');
    const arxivSearchButton = document.getElementById('arxiv-search-button');
    const githubButton = document.getElementById('github-button');
    const resultsBox = document.getElementById('results');

    const repoUrl = 'https://github.com/Flesymeb/google-scholar-highlight-kit';

    function openTab(url) {
        chrome.tabs.create({ url: url });
    }

    function scholarUrl(query) {
        return 'https://scholar.google.com/scholar?q=' + encodeURIComponent(query);
    }

    function clearResults() {
        while (resultsBox.firstChild) resultsBox.removeChild(resultsBox.firstChild);
    }

    function setStatus(text) {
        clearResults();
        const row = document.createElement('div');
        row.className = 'results-status';
        row.textContent = text;
        resultsBox.appendChild(row);
    }

    function makeActionButton(label, url) {
        const btn = document.createElement('button');
        btn.className = 'paper-action';
        btn.type = 'button';
        btn.textContent = label;
        btn.addEventListener('click', function() {
            if (url) openTab(url);
        });
        return btn;
    }

    function parseResults(text) {
        const doc = new DOMParser().parseFromString(text, 'text/html');
        return Array.from(doc.querySelectorAll('.gs_r .gs_ri')).slice(0, 6).map(function(block) {
            const titleEl = block.querySelector('.gs_rt a') || block.querySelector('.gs_rt');
            const metaEl = block.querySelector('.gs_a');
            const links = Array.from(block.querySelectorAll('.gs_fl a'));
            const citedLink = links.find(function(a) { return /Cited by/i.test(a.textContent); });
            const relatedLink = links.find(function(a) { return (a.getAttribute('href') || '').indexOf('related:') !== -1; });

            let clusterId = null;
            if (citedLink) {
                const match = (citedLink.getAttribute('href') || '').match(/cites=([0-9]+)/);
                if (match) clusterId = match[1];
            }

            const href = titleEl && titleEl.tagName === 'A' ? titleEl.getAttribute('href') : null;
            return {
                title: titleEl ? titleEl.textContent.trim() : '(untitled)',
                href: href ? (href.indexOf('http') === 0 ? href : 'https://scholar.google.com' + href) : null,
                meta: metaEl ? metaEl.textContent.trim().replace(/\s+/g, ' ') : '',
                citedText: citedLink ? citedLink.textContent.trim().replace(/\s+/g, ' ') : '',
                citedHref: citedLink ? citedLink.getAttribute('href') : null,
                relatedHref: relatedLink ? relatedLink.getAttribute('href') : null,
                clusterId: clusterId
            };
        });
    }

    function absoluteScholar(href) {
        if (!href) return null;
        return href.indexOf('http') === 0 ? href : 'https://scholar.google.com' + href;
    }

    function renderPaperCard(paper) {
        const card = document.createElement('div');
        card.className = 'paper-card';

        const label = document.createElement('div');
        label.className = 'paper-card-label';
        label.textContent = 'This paper';

        const title = document.createElement('a');
        title.className = 'result-title paper-card-title';
        title.textContent = paper.title;
        title.addEventListener('click', function() {
            if (paper.href) openTab(paper.href);
        });

        const meta = document.createElement('div');
        meta.className = 'result-meta';
        meta.textContent = paper.meta + (paper.citedText ? '  ·  ' + paper.citedText : '');

        const actions = document.createElement('div');
        actions.className = 'paper-actions';
        if (paper.clusterId) {
            actions.appendChild(makeActionButton('Cite', 'https://scholar.google.com/scholar?output=cite&cluster=' + paper.clusterId));
            actions.appendChild(makeActionButton('BibTeX', 'https://scholar.google.com/scholar.bib?hl=en&cluster=' + paper.clusterId));
        }
        if (paper.citedHref) {
            actions.appendChild(makeActionButton('Cited by', absoluteScholar(paper.citedHref)));
        }
        if (paper.relatedHref) {
            actions.appendChild(makeActionButton('Related', absoluteScholar(paper.relatedHref)));
        }

        card.appendChild(label);
        card.appendChild(title);
        card.appendChild(meta);
        if (actions.firstChild) card.appendChild(actions);
        return card;
    }

    function renderResultItem(paper) {
        const item = document.createElement('div');
        item.className = 'result-item';

        const title = document.createElement('a');
        title.className = 'result-title';
        title.textContent = paper.title;
        title.addEventListener('click', function() {
            if (paper.href) openTab(paper.href);
        });

        const meta = document.createElement('div');
        meta.className = 'result-meta';
        meta.textContent = paper.meta + (paper.citedText ? '  ·  ' + paper.citedText : '');

        item.appendChild(title);
        item.appendChild(meta);
        return item;
    }

    function renderResults(text) {
        const papers = parseResults(text);
        clearResults();

        if (papers.length === 0) {
            setStatus('No results found.');
            return;
        }

        resultsBox.appendChild(renderPaperCard(papers[0]));

        if (papers.length > 1) {
            const divider = document.createElement('div');
            divider.className = 'results-divider';
            resultsBox.appendChild(divider);
            papers.slice(1).forEach(function(paper) {
                resultsBox.appendChild(renderResultItem(paper));
            });
        }

        const more = document.createElement('a');
        more.className = 'results-link';
        more.textContent = 'Open all results in Google Scholar';
        more.addEventListener('click', function() {
            openTab(scholarUrl(input.value.trim()));
        });
        resultsBox.appendChild(more);
    }

    function searchScholar() {
        const query = input.value.trim();
        if (!query) {
            setStatus('Type a query to search Google Scholar.');
            return;
        }
        setStatus('Searching…');
        chrome.runtime.sendMessage({ action: 'scholarSearch', query: query }, function(response) {
            if (chrome.runtime.lastError || !response || !response.ok) {
                setStatus('Search failed. Try again or open in Google Scholar.');
                return;
            }
            renderResults(response.text);
        });
    }

    function detectPaperQuery(callback) {
        try {
            chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
                const tab = tabs && tabs[0];
                if (!tab || !tab.url || !tab.title) { callback(null); return; }
                let url;
                try { url = new URL(tab.url); } catch (_e) { callback(null); return; }
                const host = url.hostname;
                const title = tab.title;

                if (host === 'arxiv.org' && url.pathname.indexOf('/abs/') === 0) {
                    const cleaned = title.replace(/^\[[^\]]*\]\s*/, '').replace(/\s*[-–|]\s*arXiv.*$/i, '').trim();
                    callback(cleaned.length > 8 ? cleaned : null);
                    return;
                }
                if (host.indexOf('scholar.google.') === 0 &&
                    (url.searchParams.get('view_op') === 'view_citation' || url.pathname.indexOf('/citations') === 0)) {
                    const cleaned = title.replace(/\s*[-–|]\s*Google Scholar.*$/i, '').trim();
                    if (cleaned.length > 8 && !/^citations$/i.test(cleaned)) { callback(cleaned); return; }
                }
                callback(null);
            });
        } catch (_error) {
            callback(null);
        }
    }

    input.addEventListener('keydown', function(event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            searchScholar();
        }
    });

    scholarButton.addEventListener('click', searchScholar);

    githubSearchButton.addEventListener('click', function() {
        const query = input.value.trim();
        if (query) openTab('https://github.com/search?q=' + encodeURIComponent(query));
    });

    hfSearchButton.addEventListener('click', function() {
        const query = input.value.trim();
        if (query) openTab('https://huggingface.co/search?q=' + encodeURIComponent(query));
    });

    arxivSearchButton.addEventListener('click', function() {
        const query = input.value.trim();
        if (query) openTab('https://arxiv.org/search/?query=' + encodeURIComponent(query) + '&searchtype=all');
    });

    githubButton.addEventListener('click', function() {
        openTab(repoUrl);
    });

    function updateEngineState() {
        const hasQuery = input.value.trim().length > 0;
        [githubSearchButton, hfSearchButton, arxivSearchButton].forEach(function(button) {
            button.classList.toggle('active', hasQuery);
            button.disabled = !hasQuery;
        });
    }

    input.addEventListener('input', updateEngineState);

    // Surface the version on the logo tooltip only.
    try {
        const logo = document.getElementById('logo');
        if (logo) {
            logo.title = 'Scholar Highlight Kit v' + chrome.runtime.getManifest().version;
        }
    } catch (_error) {
        // Tooltip keeps its static fallback.
    }

    // On a paper page (arXiv abstract, Scholar citation view), prefill and search.
    detectPaperQuery(function(query) {
        if (query) {
            input.value = query;
            updateEngineState();
            searchScholar();
        } else {
            input.focus();
        }
    });
});
