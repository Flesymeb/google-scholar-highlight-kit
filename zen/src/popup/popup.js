document.addEventListener('DOMContentLoaded', function() {
    const githubButton = document.getElementById('github-button');
    const repoUrl = 'https://github.com/Flesymeb/google-scholar-highlight-kit';

    githubButton.addEventListener('click', function() {
        chrome.tabs.create({ url: repoUrl });
    });

    // Keep the footer version label in sync with the manifest.
    try {
        const label = document.getElementById('version-label');
        if (label) {
            const version = chrome.runtime.getManifest().version;
            label.textContent = 'v' + version;
        }
    } catch (_error) {
        // Footer keeps its static fallback.
    }
});
