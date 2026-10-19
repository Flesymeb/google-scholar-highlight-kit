document.addEventListener('DOMContentLoaded', function() {
    const githubButton = document.getElementById('github-button');
    const repoUrl = 'https://github.com/Flesymeb/google-scholar-highlight-kit';

    githubButton.addEventListener('click', function() {
        chrome.tabs.create({ url: repoUrl });
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
});
