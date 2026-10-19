// Manages screenshot capture, optional attribution, copy, and download.
window.shareManager = (function () {
  'use strict';

  const STORE_URL = 'chromewebstore.google.com/detail/ijmngekkpaccbbjimedfkjpigplaikah';

  function injectShareUI() {
    const header = document.querySelector('.author-highlighter-controls h3');
    if (!header || document.getElementById('share-icon-btn')) return;

    const shareBtn = document.createElement('button');
    shareBtn.id = 'share-icon-btn';
    shareBtn.className = 'share-icon-btn';
    shareBtn.type = 'button';
    shareBtn.title = 'Share Screenshot';
    shareBtn.setAttribute('aria-label', 'Share Screenshot');
    shareBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 96 960 960" width="20" fill="currentColor" aria-hidden="true">
        <path d="M160 896q-33 0-56.5-23.5T80 816V336q0-33 23.5-56.5T160 256h126l40-60h308l40 60h126q33 0 56.5 23.5T880 336v480q0 33-23.5 56.5T800 896H160Zm0-60h640V336H160v500Zm320-80q75 0 127.5-52.5T660 576q0-75-52.5-127.5T480 396q-75 0-127.5 52.5T300 576q0 75 52.5 127.5T480 756Zm0-60q-50 0-85-35t-35-85q0-50 35-85t85-35q50 0 85 35t35 85q0 50-35 85t-85 35Z"/>
      </svg>
    `;

    header.appendChild(shareBtn);
    shareBtn.addEventListener('click', captureAndShare);
  }

  function captureAndShare() {
    const shareBtn = document.getElementById('share-icon-btn');
    if (shareBtn) shareBtn.disabled = true;

    chrome.runtime.sendMessage({ action: 'captureTab' }, async (response) => {
      if (shareBtn) shareBtn.disabled = false;

      if (chrome.runtime.lastError || !response?.dataUrl) {
        console.error('Failed to capture tab:', chrome.runtime.lastError?.message || response?.error || 'Unknown error');
        return;
      }

      try {
        const brandedImageUrl = await addAttributionFooter(response.dataUrl);
        displayModal(response.dataUrl, brandedImageUrl);
      } catch (error) {
        console.warn('Unable to add screenshot attribution:', error);
        displayModal(response.dataUrl, response.dataUrl);
      }
    });
  }

  function loadImage(dataUrl) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Screenshot image could not be loaded.'));
      image.src = dataUrl;
    });
  }

  async function addAttributionFooter(dataUrl) {
    const image = await loadImage(dataUrl);
    const footerHeight = Math.max(44, Math.min(64, Math.round(image.height * 0.052)));
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height + footerHeight;

    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is unavailable.');

    context.drawImage(image, 0, 0);
    context.fillStyle = '#ffffff';
    context.fillRect(0, image.height, image.width, footerHeight);
    context.fillStyle = '#1a73e8';
    context.fillRect(0, image.height, 5, footerHeight);

    const fontSize = Math.max(14, Math.round(footerHeight * 0.31));
    const baseline = image.height + Math.round(footerHeight * 0.62);
    const padding = Math.round(footerHeight * 0.42);

    context.font = `600 ${fontSize}px Arial, sans-serif`;
    context.fillStyle = '#202124';
    context.textBaseline = 'alphabetic';
    context.fillText('Highlighted with Google Scholar Author Highlighter', padding, baseline);

    if (image.width >= 960) {
      context.font = `400 ${Math.max(12, fontSize - 2)}px Arial, sans-serif`;
      context.fillStyle = '#5f6368';
      context.textAlign = 'right';
      context.fillText(STORE_URL, image.width - padding, baseline);
    }

    return canvas.toDataURL('image/png');
  }

  function displayModal(originalImageUrl, brandedImageUrl) {
    document.getElementById('share-modal')?.remove();
    const previousFocus = document.activeElement;

    const modal = document.createElement('div');
    modal.id = 'share-modal';
    modal.className = 'share-modal-overlay';
    modal.innerHTML = `
      <div class="share-modal-content" role="dialog" aria-modal="true" aria-labelledby="share-modal-title">
        <div class="share-modal-header">
          <h3 id="share-modal-title">Share Highlights</h3>
          <button type="button" id="close-share-modal" class="close-modal" aria-label="Close">&times;</button>
        </div>
        <div class="share-modal-body">
          <img src="${brandedImageUrl}" class="screenshot-preview" alt="Screenshot preview">
        </div>
        <label class="share-attribution-option">
          <input type="checkbox" id="include-share-attribution" checked>
          <span>Include a small Author Highlighter footer</span>
        </label>
        <div class="share-modal-footer">
          <button type="button" id="download-btn" class="modal-btn secondary">Download</button>
          <button type="button" id="auth-copy-btn" class="modal-btn primary">Copy Image</button>
        </div>
        <div class="share-modal-status" role="status" aria-live="polite" aria-atomic="true"></div>
      </div>
    `;

    document.body.appendChild(modal);

    const preview = modal.querySelector('.screenshot-preview');
    const attributionToggle = modal.querySelector('#include-share-attribution');
    const closeButton = modal.querySelector('#close-share-modal');
    const status = modal.querySelector('.share-modal-status');
    const selectedImageUrl = () => attributionToggle.checked ? brandedImageUrl : originalImageUrl;
    const focusableSelector = 'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';
    const closeModal = () => {
      document.removeEventListener('keydown', handleModalKeydown);
      modal.remove();
      const focusTarget = document.getElementById('share-icon-btn') || previousFocus;
      if (focusTarget && typeof focusTarget.focus === 'function' && focusTarget.isConnected) {
        focusTarget.focus();
      }
    };
    function handleModalKeydown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeModal();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = Array.from(modal.querySelectorAll(focusableSelector));
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    attributionToggle.addEventListener('change', () => {
      preview.src = selectedImageUrl();
    });
    closeButton.addEventListener('click', closeModal);
    modal.addEventListener('click', (event) => {
      if (event.target === modal) closeModal();
    });
    document.addEventListener('keydown', handleModalKeydown);
    closeButton.focus();

    modal.querySelector('#download-btn').addEventListener('click', () => {
      const link = document.createElement('a');
      link.download = `scholar-highlights-${new Date().toISOString().slice(0, 10)}.png`;
      link.href = selectedImageUrl();
      link.click();
      status.textContent = 'Screenshot downloaded.';
    });

    modal.querySelector('#auth-copy-btn').addEventListener('click', async () => {
      const button = modal.querySelector('#auth-copy-btn');
      try {
        const response = await fetch(selectedImageUrl());
        const blob = await response.blob();
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        const originalText = button.textContent;
        button.textContent = 'Copied!';
        status.textContent = 'Image copied to clipboard.';
        setTimeout(() => {
          if (button.isConnected) button.textContent = originalText;
        }, 2000);
      } catch (error) {
        console.error('Failed to copy image:', error);
        button.textContent = 'Copy failed';
        status.textContent = 'The image could not be copied. Try downloading it instead.';
        setTimeout(() => {
          if (button.isConnected) button.textContent = 'Copy Image';
        }, 2000);
      }
    });
  }

  return {
    injectShareUI,
    addAttributionFooter
  };
})();
