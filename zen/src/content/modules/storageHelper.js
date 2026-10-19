// Storage Helper - Wraps chrome.storage operations with error handling
window.storageHelper = (function() {
  'use strict';

  function get(keys, callback) {
    try {
      if (chrome && chrome.storage && chrome.storage.sync) {
        chrome.storage.sync.get(keys, function(result) {
          if (chrome.runtime.lastError) {
            console.warn('Chrome storage error:', chrome.runtime.lastError);
            callback(null, chrome.runtime.lastError);
          } else {
            callback(result, null);
          }
        });
      } else {
        callback(null, new Error('Chrome storage not available'));
      }
    } catch (e) {
      console.warn('Error accessing chrome.storage:', e);
      callback(null, e);
    }
  }

  function set(items, callback) {
    try {
      if (chrome && chrome.storage && chrome.storage.sync) {
        chrome.storage.sync.set(items, function() {
          if (chrome.runtime.lastError) {
            console.warn('Chrome storage error:', chrome.runtime.lastError);
            if (callback) callback(chrome.runtime.lastError);
          } else {
            if (callback) callback(null);
          }
        });
      } else {
        if (callback) callback(new Error('Chrome storage not available'));
      }
    } catch (e) {
      console.warn('Error saving to chrome.storage:', e);
      if (callback) callback(e);
    }
  }

  return {
    get,
    set
  };
})();

