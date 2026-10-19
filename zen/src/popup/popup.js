document.addEventListener('DOMContentLoaded', function() {
    const input = document.getElementById('search-input');
    const scholarButton = document.getElementById('scholar-button');
    const githubSearchButton = document.getElementById('github-search-button');
    const hfSearchButton = document.getElementById('hf-search-button');
    const arxivSearchButton = document.getElementById('arxiv-search-button');
    const githubButton = document.getElementById('github-button');
    const resultsBox = document.getElementById('results');
    const platformRow = document.getElementById('platform-row');

    const repoUrl = 'https://github.com/Flesymeb/google-scholar-highlight-kit';
    let lastDetectedArxiv = null;

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

    // Platform icons are availability indicators for the detected paper:
    // gray = not found / unknown, colored = available and click opens it.
    function setPlatformIcon(button, available, url) {
        button.classList.toggle('active', !!available);
        button.disabled = !available;
        if (available && url) {
            button.dataset.url = url;
        } else {
            delete button.dataset.url;
        }
    }

    function resetPlatformIcons() {
        [githubSearchButton, hfSearchButton, arxivSearchButton].forEach(function(button) {
            setPlatformIcon(button, false, null);
        });
    }

    function checkPlatform(kind, query, button) {
        chrome.runtime.sendMessage({ action: 'paperPlatformCheck', kind: kind, query: query }, function(response) {
            if (chrome.runtime.lastError || !response || !response.ok || !response.found) {
                setPlatformIcon(button, false, null);
                return;
            }
            setPlatformIcon(button, true, response.url);
            if (response.label) {
                button.title = response.label;
            }
        });
    }

    function updatePlatformAvailability(paper) {
        resetPlatformIcons();
        platformRow.hidden = !paper;
        if (!paper) return;

        // arXiv: prefer the link Scholar itself returned; fall back to the
        // page we auto-detected the paper from (an arXiv abstract page).
        const arxivHref = paper.arxivHref || lastDetectedArxiv;
        if (arxivHref) {
            setPlatformIcon(arxivSearchButton, true, arxivHref);
        }

        const title = paper.title;
        checkPlatform('github', title, githubSearchButton);
        checkPlatform('huggingface', title, hfSearchButton);
    }

    function makeActionButton(label, url, noCaret) {
        const btn = document.createElement('button');
        btn.className = 'paper-action' + (noCaret ? ' no-caret' : '');
        btn.type = 'button';
        btn.textContent = label;
        btn.addEventListener('click', function() {
            if (url) openTab(url);
        });
        return btn;
    }

    function extractArxivHref(rowEl) {
        if (!rowEl) return null;
        const anchors = Array.from(rowEl.querySelectorAll('a'));
        for (const a of anchors) {
            let href = a.getAttribute('href') || '';
            if (!href) continue;
            // Scholar wraps outbound links: scholar.google.com/scholar_url?url=<encoded>
            const wrapped = href.match(/[?&]url=([^&]+)/);
            if (wrapped) {
                try { href = decodeURIComponent(wrapped[1]); } catch (_e) { /* keep raw */ }
            }
            if (/^https?:\/\/arxiv\.org\//.test(href)) {
                return href.replace('/pdf/', '/abs/');
            }
        }
        return null;
    }

    function parseResults(text) {
        const doc = new DOMParser().parseFromString(text, 'text/html');
        return Array.from(doc.querySelectorAll('.gs_r')).slice(0, 6).map(function(row) {
            const block = row.querySelector('.gs_ri') || row;
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

            const arxivAnchor = Array.from(block.querySelectorAll('a'))
                .find(function(a) { return /^https?:\/\/arxiv\.org\//.test(a.getAttribute('href') || ''); });
            let arxivHref = arxivAnchor
                ? arxivAnchor.getAttribute('href').replace('/pdf/', '/abs/')
                : extractArxivHref(row);

            // Scholar's meta line always carries the ID for arXiv-hosted papers,
            // e.g. "… - arXiv preprint arXiv:2601.19832, 2026 - arxiv.org".
            const metaText = metaEl ? metaEl.textContent : '';
            const idMatch = metaText.match(/arXiv[:\s]*(\d{4}\.\d{4,5}(?:v\d+)?|[a-z.-]+\/\d{7}(?:v\d+)?)/i);
            if (!arxivHref && idMatch) {
                arxivHref = 'https://arxiv.org/abs/' + idMatch[1];
            }

            const href = titleEl && titleEl.tagName === 'A' ? titleEl.getAttribute('href') : null;
            return {
                title: titleEl ? titleEl.textContent.trim() : '(untitled)',
                href: href ? (href.indexOf('http') === 0 ? href : 'https://scholar.google.com' + href) : null,
                meta: metaEl ? metaEl.textContent.trim().replace(/\s+/g, ' ') : '',
                citedText: citedLink ? citedLink.textContent.trim().replace(/\s+/g, ' ') : '',
                citedHref: citedLink ? citedLink.getAttribute('href') : null,
                relatedHref: relatedLink ? relatedLink.getAttribute('href') : null,
                clusterId: clusterId,
                arxivHref: arxivHref || null
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

        const title = document.createElement('a');
        title.className = 'result-title paper-card-title';
        title.textContent = paper.title;
        title.addEventListener('click', function() {
            if (paper.href) openTab(paper.href);
        });

        const meta = document.createElement('div');
        meta.className = 'result-meta';
        meta.textContent = paper.meta;

        const bottom = document.createElement('div');
        bottom.className = 'paper-bottom';

        const actions = document.createElement('div');
        actions.className = 'paper-actions';
        if (paper.clusterId) {
            actions.appendChild(makeActionButton('Cite', 'https://scholar.google.com/scholar?output=cite&cluster=' + paper.clusterId));
            actions.appendChild(makeActionButton('BibTeX', 'https://scholar.google.com/scholar.bib?hl=en&cluster=' + paper.clusterId, true));
        }
        if (paper.relatedHref) {
            actions.appendChild(makeActionButton('Related articles', absoluteScholar(paper.relatedHref), true));
        }

        const citeMatch = paper.citedText.match(/Cited by (\d+)/);
        const citeCount = document.createElement('button');
        citeCount.className = 'cite-count' + (paper.citedHref ? ' clickable' : '');
        citeCount.type = 'button';
        const num = document.createElement('span');
        num.className = 'cite-num';
        num.textContent = citeMatch ? Number(citeMatch[1]).toLocaleString() : '—';
        const label = document.createElement('span');
        label.className = 'cite-label';
        label.textContent = 'Citations';
        citeCount.appendChild(num);
        citeCount.appendChild(label);
        if (paper.citedHref) {
            citeCount.addEventListener('click', function() {
                openTab(absoluteScholar(paper.citedHref));
            });
        }

        bottom.appendChild(actions);
        bottom.appendChild(citeCount);

        card.appendChild(title);
        card.appendChild(meta);
        card.appendChild(bottom);
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
        const papers = parseResults(text).filter(function(p) { return p.title && p.title !== '(untitled)'; });
        clearResults();

        if (papers.length === 0) {
            setStatus('No results found.');
            updatePlatformAvailability(null);
            return;
        }

        resultsBox.appendChild(renderPaperCard(papers[0]));
        updatePlatformAvailability(papers[0]);

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
                updatePlatformAvailability(null);
                return;
            }
            renderResults(response.text);
        });
    }

    function detectPaperQuery(callback) {
        try {
            chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
                const tab = tabs && tabs[0];
                if (!tab || !tab.url || !tab.title) { callback(null, null); return; }
                let url;
                try { url = new URL(tab.url); } catch (_e) { callback(null, null); return; }
                const host = url.hostname;
                const title = tab.title;

                if (host === 'arxiv.org' || host === 'www.arxiv.org') {
                    const pathMatch = url.pathname.match(/^\/(?:abs|pdf|html)\/([^/]+)/);
                    if (pathMatch) {
                        const cleaned = title.replace(/^\[[^\]]*\]\s*/, '').replace(/\s*[-–|]\s*arXiv.*$/i, '').trim();
                        const absUrl = 'https://arxiv.org/abs/' + pathMatch[1].replace(/\.pdf$/i, '');
                        callback(cleaned.length > 8 ? cleaned : null, absUrl);
                        return;
                    }
                }
                // Only single-paper views count. Profile pages (citations?user=…)
                // are where the extension itself works; auto-searching a person's
                // name there is noise.
                if (host.indexOf('scholar.google.') === 0 && url.searchParams.get('view_op') === 'view_citation') {
                    const cleaned = title.replace(/\s*[-–|]\s*Google Scholar.*$/i, '').trim();
                    if (cleaned.length > 8) { callback(cleaned, null); return; }
                }
                callback(null, null);
            });
        } catch (_error) {
            callback(null, null);
        }
    }

    input.addEventListener('keydown', function(event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            lastDetectedArxiv = null;
            searchScholar();
        }
    });

    scholarButton.addEventListener('click', function() {
        lastDetectedArxiv = null;
        searchScholar();
    });

    // Platform icons only act on confirmed availability of the current paper.
    [githubSearchButton, hfSearchButton, arxivSearchButton].forEach(function(button) {
        button.addEventListener('click', function() {
            if (button.dataset.url) openTab(button.dataset.url);
        });
    });

    githubButton.addEventListener('click', function() {
        openTab(repoUrl);
    });

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
    detectPaperQuery(function(query, arxivUrl) {
        lastDetectedArxiv = arxivUrl || null;
        if (query) {
            input.value = query;
            searchScholar();
        } else {
            input.focus();
        }
    });
});
