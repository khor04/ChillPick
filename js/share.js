document.addEventListener("DOMContentLoaded", function () {
  // Configuration - Update these endpoints to match your API
  const API_CONFIG = {
    watchlist: '/api/watchlist',
    history: '/api/history',
  };

  // Initialize share buttons for both watchlist and history
  initializeShareButtons();
  createModal();

  function initializeShareButtons() {
    // Watchlist share button
    const watchlistShareBtn = document.querySelector(".watchlist-share-btn, .share-btn[data-type='watchlist']");
    if (watchlistShareBtn) {
      watchlistShareBtn.addEventListener("click", () => showShareModal('watchlist'));
    }

    // History share button
    const historyShareBtn = document.querySelector(".history-share-btn, .share-btn[data-type='history']");
    if (historyShareBtn) {
      historyShareBtn.addEventListener("click", () => showShareModal('history'));
    }

    // Generic share button (detects current page type)
    const genericShareBtn = document.querySelector(".share-btn:not([data-type])");
    if (genericShareBtn) {
      genericShareBtn.addEventListener("click", () => {
        const pageType = detectPageType();
        showShareModal(pageType);
      });
    }
  }

  // Create modal HTML structure
  function createModal() {
    const modalHTML = `
      <div id="shareModal" class="share-modal" style="display: none;">
        <div class="share-modal-overlay"></div>
        <div class="share-modal-content">
          <div class="share-modal-header">
            <h3 id="shareModalTitle">Share Your List</h3>
            <button class="share-modal-close" aria-label="Close modal">&times;</button>
          </div>
          <div class="share-modal-body">
            <div class="share-loading" id="shareLoading" style="display: none;">
              <div class="share-spinner"></div>
              <p>Loading your data...</p>
            </div>
            <div class="share-options" id="shareOptions">
              <div class="share-option">
                <div class="share-option-icon">📄</div>
                <div class="share-option-content">
                  <h4>Download as Text File</h4>
                  <p>Save your list as a .txt file to your device</p>
                </div>
                <button class="share-option-btn" id="downloadTxtBtn">Download</button>
              </div>
              <div class="share-option">
                <div class="share-option-icon">📋</div>
                <div class="share-option-content">
                  <h4>Copy to Clipboard</h4>
                  <p>Copy your list text to clipboard for easy sharing</p>
                </div>
                <button class="share-option-btn" id="copyClipboardBtn">Copy</button>
              </div>
            </div>
            <div class="share-preview" id="sharePreview" style="display: none;">
              <h4>Preview:</h4>
              <div class="share-preview-content">
                <pre id="sharePreviewText"></pre>
              </div>
              <button class="share-preview-toggle" id="togglePreview">Show Preview</button>
            </div>
          </div>
        </div>
      </div>
    `;
    // Add modal styles that match ChillPick design
    const modalStyles = `
      <style>
        .share-modal {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          z-index: 10000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          box-sizing: border-box;
          font-family: "Poppins", sans-serif;
        }
        .share-modal-overlay {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(60, 60, 60, 0.7);
          backdrop-filter: blur(4px);
        }
        .share-modal-content {
          position: relative;
          background: white;
          border-radius: 12px;
          max-width: 500px;
          width: 100%;
          max-height: 80vh;
          overflow-y: auto;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
          animation: modalSlideIn 0.3s ease-out;
        }
        @keyframes modalSlideIn {
          from {
            opacity: 0;
            transform: translateY(-30px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        .share-modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 24px 28px 16px;
          border-bottom: 1px solid #dee2e6;
          background: #f3f3e6;
          border-radius: 12px 12px 0 0;
        }
        .share-modal-header h3 {
          margin: 0;
          font-size: 20px;
          font-weight: 600;
          color: #6b4f3d;
          font-family: "Poppins", sans-serif;
        }
        .share-modal-close {
          background: none;
          border: none;
          font-size: 24px;
          cursor: pointer;
          color: #6b4f3d;
          padding: 4px;
          border-radius: 4px;
          transition: all 0.2s ease;
          font-weight: bold;
        }
        .share-modal-close:hover {
          background: #e8e1d1;
          color: #2c1d0e;
        }
        .share-modal-body {
          padding: 24px 28px 28px;
          background: white;
        }
        .share-loading {
          text-align: center;
          padding: 40px 20px;
        }
        .share-spinner {
          width: 40px;
          height: 40px;
          border: 4px solid #f3f3e6;
          border-top: 4px solid #6b4f3d;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin: 0 auto 16px;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .share-loading p {
          color: #666;
          margin: 0;
          font-family: "Poppins", sans-serif;
        }
        .share-options {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .share-option {
          display: flex;
          align-items: center;
          padding: 20px;
          border: 2px solid #dee2e6;
          border-radius: 8px;
          transition: all 0.3s ease;
          background: white;
        }
        .share-option:hover {
          border-color: #6b4f3d;
          background: #f3f3e6;
          box-shadow: 0 2px 8px rgba(107, 79, 61, 0.1);
        }
        .share-option-icon {
          font-size: 28px;
          margin-right: 20px;
          flex-shrink: 0;
        }
        .share-option-content {
          flex: 1;
        }
        .share-option-content h4 {
          margin: 0 0 6px 0;
          font-size: 16px;
          font-weight: 600;
          color: #2c3e50;
          font-family: "Poppins", sans-serif;
        }
        .share-option-content p {
          margin: 0;
          font-size: 14px;
          color: #666;
          line-height: 1.4;
        }
        .share-option-btn {
          background: #6b4f3d;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 15px;
          cursor: pointer;
          font-weight: 600;
          font-family: "Poppins", sans-serif;
          font-size: 14px;
          transition: all 0.3s ease;
          flex-shrink: 0;
        }
        .share-option-btn:hover {
          background: #2c1d0e;
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(107, 79, 61, 0.3);
        }
        .share-option-btn:disabled {
          background: #a89884;
          cursor: not-allowed;
          transform: none;
          box-shadow: none;
        }
        .share-preview {
          margin-top: 24px;
          border-top: 1px solid #dee2e6;
          padding-top: 24px;
        }
        .share-preview h4 {
          margin: 0 0 16px 0;
          font-size: 16px;
          font-weight: 600;
          color: #6b4f3d;
          font-family: "Poppins", sans-serif;
        }
        .share-preview-content {
          background: #f3f3e6;
          border: 1px solid #dee2e6;
          border-radius: 8px;
          padding: 16px;
          max-height: 200px;
          overflow-y: auto;
          margin-bottom: 16px;
        }
        .share-preview-content pre {
          margin: 0;
          font-size: 12px;
          line-height: 1.5;
          white-space: pre-wrap;
          word-wrap: break-word;
          color: #333;
          font-family: 'Courier New', monospace;
        }
        .share-preview-toggle {
          background: #a89884;
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 15px;
          cursor: pointer;
          font-size: 12px;
          font-family: "Poppins", sans-serif;
          font-weight: 500;
          transition: all 0.3s ease;
        }
        .share-preview-toggle:hover {
          background: #6b4f3d;
        }
        .share-success-message, .share-error-message {
          animation: slideDown 0.3s ease-out;
        }
        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        /* Mobile responsive adjustments */
        @media (max-width: 768px) {
          .share-modal {
            padding: 16px;
          }
          .share-modal-content {
            max-height: calc(100vh - 32px);
          }
          .share-modal-header {
            padding: 20px 20px 12px;
          }
          .share-modal-body {
            padding: 20px;
          }
          .share-option {
            flex-direction: column;
            text-align: center;
            gap: 16px;
            padding: 24px 16px;
          }
          .share-option-icon {
            margin-right: 0;
            margin-bottom: 8px;
          }
          .share-option-btn {
            width: 100%;
            padding: 12px 20px;
          }
        }

        @media (max-width: 480px) {
          .share-modal {
            padding: 12px;
          }
          .share-modal-header h3 {
            font-size: 18px;
          }
          .share-option-content h4 {
            font-size: 15px;
          }
          .share-option-content p {
            font-size: 13px;
          }
        }
      </style>
    `;
    // Add modal to page
    document.head.insertAdjacentHTML('beforeend', modalStyles);
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // Initialize modal event listeners
    initializeModalEvents();
  }

  // Initialize modal event listeners
  function initializeModalEvents() {
    const modal = document.getElementById('shareModal');
    const closeBtn = document.querySelector('.share-modal-close');
    const overlay = document.querySelector('.share-modal-overlay');
    const downloadBtn = document.getElementById('downloadTxtBtn');
    const copyBtn = document.getElementById('copyClipboardBtn');
    const togglePreviewBtn = document.getElementById('togglePreview');

    // Close modal events
    closeBtn.addEventListener('click', hideShareModal);
    overlay.addEventListener('click', hideShareModal);
    
    // Share option events
    downloadBtn.addEventListener('click', () => handleShareOption('download'));
    copyBtn.addEventListener('click', () => handleShareOption('copy'));
    
    // Toggle preview
    togglePreviewBtn.addEventListener('click', togglePreview);
  }

  // Show share modal
  async function showShareModal(type) {
    const modal = document.getElementById('shareModal');
    const title = document.getElementById('shareModalTitle');
    const loading = document.getElementById('shareLoading');
    const options = document.getElementById('shareOptions');
    const preview = document.getElementById('sharePreview');

    // Update modal title
    title.textContent = type === 'watchlist' ? 'Share Your Watchlist' : 'Share Your History';
    
    // Show modal and loading state
    modal.style.display = 'flex';
    loading.style.display = 'block';
    options.style.display = 'none';
    preview.style.display = 'none';

    try {
      // Fetch and prepare data
      const data = await fetchDataFromDatabase(type);
      const documentContent = generateDocumentContent(data, type);
      
      // Store data for sharing options
      window.shareData = {
        content: documentContent,
        type: type,
        filename: `chillpick-${type}-${new Date().toISOString().split('T')[0]}.txt`
      };

      // Update preview
      document.getElementById('sharePreviewText').textContent = documentContent;
      
      // Show options
      loading.style.display = 'none';
      options.style.display = 'block';
      preview.style.display = 'block';

    } catch (error) {
      console.error('Error loading share modal:', error);
      loading.style.display = 'none';
      options.innerHTML = `
        <div style="text-align: center; padding: 32px 20px; color: #b00e0c; background: #f8d7da; border-radius: 8px; font-family: 'Poppins', sans-serif;">
          <p style="margin: 0 0 8px 0; font-weight: 600; font-size: 16px;">Unable to Load Data</p>
          <p style="margin: 0; font-size: 14px;">Please try again later or refresh the page.</p>
        </div>
      `;
      options.style.display = 'block';
    }
  }

  // Hide share modal
  function hideShareModal() {
    const modal = document.getElementById('shareModal');
    modal.style.display = 'none';
    
    // Clean up stored data
    delete window.shareData;
  }

  // Handle share options
  async function handleShareOption(option) {
    if (!window.shareData) return;

    const { content, type, filename } = window.shareData;

    try {
      switch (option) {
        case 'download':
          downloadFile(content, filename, 'text/plain');
          showShareSuccess('File downloaded successfully!');
          break;

        case 'copy':
          await navigator.clipboard.writeText(content);
          showShareSuccess('Copied to clipboard!');
          break;
      }
    } catch (error) {
      console.error('Share error:', error);
      showShareError('Failed to share. Please try again.');
    }
  }

  // Toggle preview visibility
  function togglePreview() {
    const previewContent = document.querySelector('.share-preview-content');
    const toggleBtn = document.getElementById('togglePreview');
    
    if (previewContent.style.display === 'none') {
      previewContent.style.display = 'block';
      toggleBtn.textContent = 'Hide Preview';
    } else {
      previewContent.style.display = 'none';
      toggleBtn.textContent = 'Show Preview';
    }
  }

  // Show success message in modal
  function showShareSuccess(message) {
    const modalBody = document.querySelector('.share-modal-body');
    const successDiv = document.createElement('div');
    successDiv.className = 'share-success-message';
    successDiv.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      background: #d4edda;
      color: #155724;
      padding: 16px 28px;
      border-radius: 8px;
      margin: 0 0 20px 0;
      text-align: center;
      font-weight: 600;
      font-family: "Poppins", sans-serif;
      font-size: 14px;
      animation: slideDown 0.3s ease-out;
      z-index: 1;
    `;
    successDiv.textContent = `✓ ${message}`;
    
    modalBody.style.position = 'relative';
    modalBody.insertBefore(successDiv, modalBody.firstChild);
    
    setTimeout(() => {
      if (successDiv.parentNode) {
        successDiv.remove();
      }
    }, 3000);
  }

  // Show error message in modal
  function showShareError(message) {
    const modalBody = document.querySelector('.share-modal-body');
    const errorDiv = document.createElement('div');
    errorDiv.className = 'share-error-message';
    errorDiv.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      background: #f8d7da;
      color: #721c24;
      padding: 16px 28px;
      border-radius: 8px;
      margin: 0 0 20px 0;
      text-align: center;
      font-weight: 600;
      font-family: "Poppins", sans-serif;
      font-size: 14px;
      animation: slideDown 0.3s ease-out;
      z-index: 1;
    `;
    errorDiv.textContent = `✗ ${message}`;
    
    modalBody.style.position = 'relative';
    modalBody.insertBefore(errorDiv, modalBody.firstChild);
    
    setTimeout(() => {
      if (errorDiv.parentNode) {
        errorDiv.remove();
      }
    }, 3000);
  }

  // Detect current page type based on URL or page elements
  function detectPageType() {
    const url = window.location.pathname.toLowerCase();
    if (url.includes('watchlist')) return 'watchlist';
    if (url.includes('history')) return 'history';
    
    // Alternative: detect based on page elements
    if (document.querySelector('.watchlist-container, .watchlist-item')) return 'watchlist';
    if (document.querySelector('.history-container, .history-item')) return 'history';
    
    return 'watchlist'; // default
  }

  // Fetch data from database
  async function fetchDataFromDatabase(type) {
    const endpoint = API_CONFIG[type];
    
    // Add user ID to URL if needed
    const url = new URL(endpoint, window.location.origin);
    if (API_CONFIG.userId) {
      url.searchParams.append('userId', API_CONFIG.userId);
    }

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'same-origin' // Include cookies for session-based auth
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  }

  // Generate document content from database data
  function generateDocumentContent(data, type) {
    const title = type === 'watchlist' ? 'My ChillPick Watchlist' : 'My ChillPick History';
    let content = `${title}\n`;
    content += '='.repeat(title.length) + '\n\n';

    if (!data || (Array.isArray(data) && data.length === 0)) {
      content += `No ${type} items found.\n\n`;
    } else {
      // Handle different data structures
      const items = Array.isArray(data) ? data : (data.items || data.data || []);
      
      items.forEach((item, index) => {
        content += `${index + 1}. ${formatItem(item)}\n`;
      });
    }

    content += `\nGenerated on: ${new Date().toLocaleDateString()}\n`;
    content += `Total items: ${Array.isArray(data) ? data.length : (data.items?.length || 0)}\n`;
    content += 'Created with ChillPick\n';

    return content;
  }

  // Format individual item for the document
  function formatItem(item) {
    let formatted = '';
    
    // Title
    const title = item.title || item.name || item.movie_title || item.show_title || 'Untitled';
    formatted += `${title}`;
    
    // Type/Category
    if (item.type || item.category || item.genre) {
      const type = item.type || item.category || item.genre;
      formatted += ` (${type})`;
    }
    
    formatted += '\n';
    
    // Additional details
    const details = [];
    
    if (item.year || item.release_year) {
      details.push(`Year: ${item.year || item.release_year}`);
    }
    
    if (item.rating || item.user_rating) {
      details.push(`Rating: ${item.rating || item.user_rating}`);
    }
    
    if (item.status) {
      details.push(`Status: ${item.status}`);
    }
    
    if (item.date_added || item.created_at) {
      const date = new Date(item.date_added || item.created_at).toLocaleDateString();
      details.push(`Added: ${date}`);
    }
    
    if (item.watched_date || item.completed_date) {
      const date = new Date(item.watched_date || item.completed_date).toLocaleDateString();
      details.push(`Watched: ${date}`);
    }
    
    if (details.length > 0) {
      formatted += `   ${details.join(' | ')}\n`;
    }
    return formatted;
  }

  // Download file function
  function downloadFile(content, fileName, mimeType = 'text/plain') {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.style.display = 'none';
    
    // Add to DOM, click, and remove
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    // Clean up the URL object
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }

  // Keep existing filter functionality
  const filterButtons = document.querySelectorAll(".filter-btn");
  const contentItems = document.querySelectorAll(".watchlist-item, .history-item");

  function applyFilter(type) {
    contentItems.forEach((item) => {
      const itemType = item.dataset.type;
      const hr = item.nextElementSibling?.tagName === "HR" ? item.nextElementSibling : null;
      const show = type === "all" || itemType === type;
      item.style.display = show ? "flex" : "none";
      if (hr) hr.style.display = show ? "block" : "none";
    });
  }

  filterButtons.forEach((btn) => {
    btn.addEventListener("click", function () {
      filterButtons.forEach((b) => b.classList.remove("active"));
      this.classList.add("active");
      applyFilter(this.dataset.filter);
    });
  });
  document.querySelector(".filter-btn.active")?.click();
});