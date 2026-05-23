// Ensure standard compatibility on older platforms by using safe syntax and checks

(function () {
  // --- Tab Navigation Setup ---
  var tabButtons = document.querySelectorAll(".tab-btn");
  var tabPanels = document.querySelectorAll(".tab-panel");

  if (tabButtons && tabPanels) {
    for (var i = 0; i < tabButtons.length; i++) {
      tabButtons[i].addEventListener("click", function (e) {
        var clickedBtn = e.currentTarget;
        var targetId = clickedBtn.getAttribute("data-target");

        // Update active tab buttons
        for (var j = 0; j < tabButtons.length; j++) {
          tabButtons[j].className = "tab-btn";
        }
        clickedBtn.className = "tab-btn active";

        // Toggle active panels
        for (var k = 0; k < tabPanels.length; k++) {
          var panel = tabPanels[k];
          if (panel.id === targetId) {
            panel.className = "tab-panel active";
          } else {
            panel.className = "tab-panel";
          }
        }

        // If the library tab is selected, reload the app registry
        if (targetId === "libraryTab") {
          fetchLibrary();
        }
      });
    }
  }

  // --- Form Selectors ---
  var form = document.getElementById("uploadForm");
  var certToggle = document.getElementById("certToggle");
  var serverCertSection = document.getElementById("serverCertSection");
  var manualCertSection = document.getElementById("manualCertSection");
  
  // --- File Selectors ---
  var dropZone = document.getElementById("dropZone");
  var ipaInput = document.getElementById("ipa_file");
  var dropZoneText = document.getElementById("dropZoneText");
  
  // --- Progress & Output Selectors ---
  var submitBtn = document.getElementById("submitBtn");
  var loader = document.getElementById("loader");
  var progressBar = document.getElementById("progressBar");
  var progressFill = document.getElementById("progressFill");
  var progressText = document.getElementById("progressText");
  var statusMessage = document.getElementById("statusMessage");
  var resultBtns = document.getElementById("resultBtns");
  var installLink = document.getElementById("installLink");
  var downloadLink = document.getElementById("downloadLink");

  // --- Library Section Selectors ---
  var appGrid = document.getElementById("appGrid");
  var librarySearch = document.getElementById("librarySearch");
  var appsRegistry = []; // Client-side cache of apps

  // --- Toggle Certificate Section ---
  if (certToggle) {
    certToggle.addEventListener("change", function () {
      if (certToggle.checked) {
        if (serverCertSection) serverCertSection.style.display = "none";
        if (manualCertSection) manualCertSection.style.display = "block";
      } else {
        if (serverCertSection) serverCertSection.style.display = "block";
        if (manualCertSection) manualCertSection.style.display = "none";
      }
    });
  }

  // --- Drag and Drop Logic ---
  if (dropZone && ipaInput) {
    dropZone.addEventListener("click", function () {
      ipaInput.click();
    });

    dropZone.addEventListener("dragover", function (e) {
      e.preventDefault();
      dropZone.className = "drop-zone dragover";
    });

    dropZone.addEventListener("dragleave", function () {
      dropZone.className = "drop-zone";
    });

    dropZone.addEventListener("drop", function (e) {
      e.preventDefault();
      dropZone.className = "drop-zone";
      
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
        ipaInput.files = e.dataTransfer.files;
        updateDropZoneLabel(ipaInput.files[0].name);
      }
    });

    ipaInput.addEventListener("change", function () {
      if (ipaInput.files && ipaInput.files.length) {
        updateDropZoneLabel(ipaInput.files[0].name);
      }
    });
  }

  function updateDropZoneLabel(fileName) {
    if (dropZoneText) {
      dropZoneText.textContent = "📦 " + fileName;
    }
  }

  // --- Show Status Messages ---
  function showStatus(text, isError) {
    if (statusMessage) {
      statusMessage.textContent = text;
      statusMessage.style.display = "block";
      statusMessage.className = isError ? "status-msg status-error" : "status-msg status-success";
    }
  }

  function hideStatus() {
    if (statusMessage) {
      statusMessage.style.display = "none";
    }
  }

  // --- Form Submit Handling (AJAX) ---
  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      
      // Reset UI elements
      hideStatus();
      if (resultBtns) resultBtns.style.display = "none";
      if (submitBtn) submitBtn.style.display = "none";
      if (loader) loader.style.display = "block";
      if (progressBar) progressBar.style.display = "block";
      if (progressFill) progressFill.style.width = "0%";
      if (progressText) progressText.textContent = "0% Uploading...";

      // Validation check
      if (!ipaInput || !ipaInput.files || !ipaInput.files.length) {
        showStatus("Please select an IPA file first.", true);
        resetSubmitState();
        return;
      }

      var formData = new FormData(form);
      var xhr = new XMLHttpRequest();
      
      // Open the POST connection to /upload endpoint
      xhr.open("POST", "/upload", true);

      var startTime = Date.now();

      // Track upload progress compatible with old Safari
      if (xhr.upload) {
        xhr.upload.addEventListener("progress", function (event) {
          if (event.lengthComputable) {
            var percent = (event.loaded / event.total) * 100;
            var elapsedSeconds = (Date.now() - startTime) / 1000;
            
            // Avoid division by zero
            if (elapsedSeconds <= 0) elapsedSeconds = 0.1;
            
            var speedMBs = (event.loaded / 1024 / 1024 / elapsedSeconds).toFixed(2);
            var loadedMB = (event.loaded / 1024 / 1024).toFixed(1);
            var totalMB = (event.total / 1024 / 1024).toFixed(1);

            if (progressFill) {
              progressFill.style.width = percent + "%";
            }
            if (progressText) {
              progressText.textContent = percent.toFixed(1) + "% (" + loadedMB + "/" + totalMB + " MB) • " + speedMBs + " MB/s";
            }
          }
        });
      }

      xhr.onload = function () {
        if (loader) loader.style.display = "none";
        if (progressBar) progressBar.style.display = "none";
        if (progressText) progressText.textContent = "";

        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            var res = JSON.parse(xhr.responseText);
            if (res && res.success && res.install_url && res.download_url) {
              showStatus("App resigned successfully!", false);
              
              if (installLink) installLink.href = res.install_url;
              if (downloadLink) downloadLink.href = res.download_url;
              if (resultBtns) resultBtns.style.display = "block";
              
              // Clear file picker inputs
              if (ipaInput) ipaInput.value = "";
              if (dropZoneText) dropZoneText.textContent = "📥 Tap here or drag IPA file";
              
              // Trigger app registry refetch in background if saved publicly
              var saveToggle = document.getElementById("saveToLibrary");
              if (saveToggle && saveToggle.checked) {
                fetchLibrary();
              }
            } else {
              showStatus(res.message || "Error signing the file. Check your password or certificate.", true);
            }
            resetSubmitState();
          } catch (err) {
            showStatus("Failed to parse server response.", true);
            resetSubmitState();
          }
        } else {
          showStatus("Server error: Status " + xhr.status, true);
          resetSubmitState();
        }
      };

      xhr.onerror = function () {
        if (loader) loader.style.display = "none";
        if (progressBar) progressBar.style.display = "none";
        if (progressText) progressText.textContent = "";
        
        showStatus("Upload failed. Check your network connection.", true);
        resetSubmitState();
      };

      xhr.send(formData);
    });
  }

  function resetSubmitState() {
    if (submitBtn) submitBtn.style.display = "block";
    if (loader) loader.style.display = "none";
    if (progressBar) progressBar.style.display = "none";
  }

  // --- Fetch Library Apps ---
  function fetchLibrary() {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", "/api/apps", true);
    
    xhr.onload = function () {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          var res = JSON.parse(xhr.responseText);
          if (res && res.success && res.apps) {
            appsRegistry = res.apps;
            renderLibrary(appsRegistry);
          } else {
            renderErrorMsg("Failed to load apps list.");
          }
        } catch (err) {
          renderErrorMsg("Failed to read server registry.");
        }
      } else {
        renderErrorMsg("HTTP Error " + xhr.status);
      }
    };
    
    xhr.onerror = function () {
      renderErrorMsg("Network error trying to contact signer database.");
    };
    
    xhr.send();
  }

  // --- Library Upload Handling ---
  var libraryUploadForm = document.getElementById('libraryUploadForm');
  if (libraryUploadForm) {
    libraryUploadForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var statusDiv = document.getElementById('libraryUploadStatus');
      var formData = new FormData(libraryUploadForm);
      // Ensure the app is saved to library
      formData.append('save_to_library', 'on');

      var xhr = new XMLHttpRequest();
      xhr.open('POST', '/upload', true);

      xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) {
          // Success: show message and refresh library
          if (statusDiv) {
            statusDiv.textContent = '✅ Uploaded and saved to library!';
            statusDiv.style.display = 'block';
            statusDiv.className = 'status-msg status-success';
          }
          fetchLibrary();
        } else {
          if (statusDiv) {
            statusDiv.textContent = '❌ Upload failed: ' + xhr.responseText;
            statusDiv.style.display = 'block';
            statusDiv.className = 'status-msg status-error';
          }
        }
      };
      xhr.onerror = function () {
        if (statusDiv) {
          statusDiv.textContent = '❌ Network error during upload.';
          statusDiv.style.display = 'block';
          statusDiv.className = 'status-msg status-error';
        }
      };
      xhr.send(formData);
    });
  }

  // --- Render Library Cards ---
  function renderLibrary(apps) {
    if (!appGrid) return;
    appGrid.innerHTML = "";

    if (!apps || apps.length === 0) {
      var noApps = document.createElement("div");
      noApps.className = "no-apps-msg";
      noApps.textContent = "No applications saved in the library yet. Sign files and toggle 'Save to Public App Library' to publish them here.";
      appGrid.appendChild(noApps);
      return;
    }

    for (var i = 0; i < apps.length; i++) {
      var app = apps[i];
      
      var card = document.createElement("div");
      card.className = "app-card";
      
      // Determine app initial icon letter
      var appLetter = app.title ? app.title.charAt(0).toUpperCase() : "📦";
      
      card.innerHTML = 
        '<div class="app-card-inner">' +
          '<div class="app-info">' +
            '<div class="app-icon">' + appLetter + '</div>' +
            '<div class="app-details">' +
              '<h3>' + app.title + '</h3>' +
              '<p>' + app.bundleId + '</p>' +
              '<div class="app-date">' + formatDate(app.timestamp) + '</div>' +
            '</div>' +
          '</div>' +
          '<div class="app-actions">' +
            '<a href="' + app.installUrl + '" class="btn btn-install">📲 Install</a>' +
            '<a href="' + app.downloadUrl + '" class="btn btn-download" target="_blank">⬇️ IPA</a>' +
            '<button class="btn btn-delete" data-timestamp="' + app.timestamp + '">🗑️ Delete</button>' +
          '</div>' +
        '</div>';
        
      appGrid.appendChild(card);
    }
  }

  function renderErrorMsg(msg) {
    if (appGrid) {
      appGrid.innerHTML = '<div class="no-apps-msg">❌ ' + msg + '</div>';
    }
  }

  // Formatting date for library cards
  function formatDate(timestamp) {
    if (!timestamp) return "";
    var date = new Date(timestamp);
    var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return months[date.getMonth()] + " " + date.getDate() + ", " + date.getFullYear();
  }

  // --- Search Filtering ---
  if (librarySearch) {
    librarySearch.addEventListener("input", function (e) {
      var query = e.target.value.toLowerCase().trim();
      
      if (!query) {
        renderLibrary(appsRegistry);
        return;
      }

      var filtered = [];
      for (var i = 0; i < appsRegistry.length; i++) {
        var app = appsRegistry[i];
        var title = app.title ? app.title.toLowerCase() : "";
        var bundleId = app.bundleId ? app.bundleId.toLowerCase() : "";
        
        if (title.indexOf(query) !== -1 || bundleId.indexOf(query) !== -1) {
          filtered.push(app);
        }
      }
      renderLibrary(filtered);
    });
  }

  // Trigger initial fetch when page loads (just in case they land directly on tabs)
  fetchLibrary();

  // --- Delete Application ---
  if (appGrid) {
    appGrid.addEventListener("click", function (e) {
      var target = e.target;
      while (target && target !== appGrid) {
        if (target.classList && target.classList.contains("btn-delete")) {
          var timestamp = target.getAttribute("data-timestamp");
          if (timestamp && confirm("Are you sure you want to delete this app?")) {
            deleteApp(timestamp);
          }
          break;
        }
        target = target.parentNode;
      }
    });
  }

  function deleteApp(timestamp) {
    var xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/apps/delete", true);
    xhr.setRequestHeader("Content-Type", "application/json");
    
    xhr.onload = function () {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          var res = JSON.parse(xhr.responseText);
          if (res && res.success) {
            fetchLibrary();
          } else {
            alert(res.message || "Failed to delete application.");
          }
        } catch (err) {
          alert("Failed to delete application. Server returned invalid response.");
        }
      } else {
        alert("Server error: Status " + xhr.status);
      }
    };
    
    xhr.onerror = function () {
      alert("Network error trying to connect to server.");
    };
    
    xhr.send(JSON.stringify({ timestamp: Number(timestamp) }));
  }

})();
