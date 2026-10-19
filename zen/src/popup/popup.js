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

    function setStatus(text) {
        while (resultsBox.firstChild) resultsBox.removeChild(resultsBox.firstChild);
        const row = document.createElement('div');
        row.className = 'results-status';
        row.textContent = text;
        resultsBox.appendChild(row);
    }

    function renderResults(text) {
        const doc = new DOMParser().parseFromString(text, 'text/html');
        const blocks = Array.from(doc.querySelectorAll('.gs_r .gs_ri')).slice(0, 6);

        while (resultsBox.firstChild) resultsBox.removeChild(resultsBox.firstChild);

        if (blocks.length === 0) {
            setStatus('No results found.');
            return;
        }

        blocks.forEach(function(block) {
            const titleEl = block.querySelector('.gs_rt a') || block.querySelector('.gs_rt');
            const metaEl = block.querySelector('.gs_a');
            const citedEl = Array.from(block.querySelectorAll('.gs_fl a'))
                .find(function(a) { return /Cited by/i.test(a.textContent); });

            const item = document.createElement('div');
            item.className = 'result-item';

            const title = document.createElement('a');
            title.className = 'result-title';
            title.textContent = titleEl ? titleEl.textContent.trim() : '(untitled)';
            const href = titleEl && titleEl.tagName === 'A' ? titleEl.getAttribute('href') : null;
            title.addEventListener('click', function() {
                if (href) openTab(href.indexOf('http') === 0 ? href : 'https://scholar.google.com' + href);
            });

            const meta = document.createElement('div');
            meta.className = 'result-meta';
            meta.textContent = metaEl ? metaEl.textContent.trim() : '';

            if (citedEl) {
                const cited = document.createElement('span');
                cited.className = 'result-cited';
                cited.textContent = '  ·  ' + citedEl.textContent.trim().replace(/\s+/g, ' ');
                meta.appendChild(cited);
            }

            item.appendChild(title);
            item.appendChild(meta);
            resultsBox.appendChild(item);
        });

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

    function updateEngineState() {
        const hasQuery = input.value.trim().length > 0;
        [githubSearchButton, hfSearchButton, arxivSearchButton].forEach(function(button) {
            button.classList.toggle('active', hasQuery);
            button.disabled = !hasQuery;
        });
    }

    input.addEventListener('input', updateEngineState);
    updateEngineState();

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

    input.focus();
});
