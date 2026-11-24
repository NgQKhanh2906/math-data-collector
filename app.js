/**
 * Logic bảng vẽ chữ viết tay, xuất PNG nền trắng chuẩn và gửi dữ liệu lên Google Apps Script.
 */
(function () {
  'use strict';

  var config = window.APP_CONFIG || {};
  var promptGenerator = window.MathPromptGenerator;

  var EXPORT_WIDTH = Number(config.EXPORT_WIDTH) || 1200;
  var EXPORT_HEIGHT = Number(config.EXPORT_HEIGHT) || 500;
  var UPLOAD_TIMEOUT_MS = Number(config.UPLOAD_TIMEOUT_MS) || 25000;
  var SESSION_STORAGE_KEY = 'math_ink_session_count';

  var configWarningEl = document.getElementById('config-warning');
  var sessionCountEl = document.getElementById('session-count');
  var modePromptBtn = document.getElementById('mode-prompt');
  var modeFreeBtn = document.getElementById('mode-free');
  var promptPanelEl = document.getElementById('prompt-panel');
  var freePanelEl = document.getElementById('free-panel');
  var promptCategoryEl = document.getElementById('prompt-category');
  var promptDisplayEl = document.getElementById('prompt-display');
  var btnNextPrompt = document.getElementById('btn-next-prompt');
  var freeLabelInput = document.getElementById('free-label-input');
  var allowEmptyLabelCheckbox = document.getElementById('allow-empty-label');
  var quickSymbolButtons = Array.prototype.slice.call(document.querySelectorAll('.quick-symbol-btn'));

  var colorButtons = Array.prototype.slice.call(document.querySelectorAll('.color-btn'));
  var toolPenBtn = document.getElementById('tool-pen');
  var toolEraserBtn = document.getElementById('tool-eraser');
  var penSizeSlider = document.getElementById('pen-size-slider');
  var penSizeValueEl = document.getElementById('pen-size-value');
  var penPreviewDotEl = document.getElementById('pen-preview-dot');
  var sizePresetButtons = Array.prototype.slice.call(document.querySelectorAll('.size-preset-btn'));

  var btnUndo = document.getElementById('btn-undo');
  var btnRedo = document.getElementById('btn-redo');
  var btnToggleGrid = document.getElementById('btn-toggle-grid');
  var btnClear = document.getElementById('btn-clear');

  var canvasStageEl = document.getElementById('canvas-stage');
  var canvasEl = document.getElementById('drawing-canvas');
  var canvasPlaceholderEl = document.getElementById('canvas-placeholder');
  var strokeCounterEl = document.getElementById('stroke-counter');

  var btnDownload = document.getElementById('btn-download');
  var btnSave = document.getElementById('btn-save');
  var btnSaveTextEl = btnSave.querySelector('.btn-save-text');
  var toastContainerEl = document.getElementById('toast-container');

  var ctx = canvasEl.getContext('2d');

  var state = {
    mode: 'prompt',
    category: 'mixed',
    currentPrompt: '',
    penColor: config.DEFAULT_PEN_COLOR || '#111111',
    penSize: Number(config.DEFAULT_PEN_SIZE) || 6,
    tool: 'pen',
    showGrid: false,
    strokes: [],
    redoStack: [],
    currentStroke: null,
    activePointerId: null,
    isUploading: false,
    sessionCount: 0
  };

  function isValidAppsScriptUrl(url) {
    return (
      typeof url === 'string' &&
      url.indexOf('https://') === 0 &&
      url.indexOf('PASTE_YOUR_GOOGLE_APPS_SCRIPT') === -1
    );
  }

  function loadSessionCount() {
    try {
      var raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
      var parsed = parseInt(raw, 10);
      if (!isNaN(parsed) && parsed >= 0) {
        state.sessionCount = parsed;
      }
    } catch (err) {
      state.sessionCount = 0;
    }
    sessionCountEl.textContent = String(state.sessionCount);
  }

  function saveSessionCount() {
    try {
      window.localStorage.setItem(SESSION_STORAGE_KEY, String(state.sessionCount));
    } catch (err) {
      // Bỏ qua khi trình duyệt chặn localStorage
    }
    sessionCountEl.textContent = String(state.sessionCount);
  }

  function showToast(message, type) {
    var toastType = type || 'info';
    var toast = document.createElement('div');
    toast.className = 'toast toast-' + toastType;
    toast.textContent = message;
    toastContainerEl.appendChild(toast);

    window.setTimeout(function () {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 4200);
  }

  function getLogicalPoint(clientX, clientY) {
    var rect = canvasEl.getBoundingClientRect();
    var width = rect.width || 1;
    var height = rect.height || 1;
    return {
      x: ((clientX - rect.left) / width) * EXPORT_WIDTH,
      y: ((clientY - rect.top) / height) * EXPORT_HEIGHT
    };
  }

  function distanceSquared(p1, p2) {
    var dx = p1.x - p2.x;
    var dy = p1.y - p2.y;
    return dx * dx + dy * dy;
  }

  function renderStroke(targetCtx, stroke) {
    var points = stroke.points;
    if (!points || points.length === 0) {
      return;
    }

    var isEraser = stroke.tool === 'eraser';
    var strokeColor = isEraser ? '#FFFFFF' : stroke.color;
    var strokeWidth = isEraser ? Math.max(stroke.size * 2.2, 16) : stroke.size;

    targetCtx.save();
    targetCtx.fillStyle = strokeColor;
    targetCtx.strokeStyle = strokeColor;
    targetCtx.lineWidth = strokeWidth;
    targetCtx.lineCap = 'round';
    targetCtx.lineJoin = 'round';

    if (points.length === 1) {
      targetCtx.beginPath();
      targetCtx.arc(points[0].x, points[0].y, strokeWidth / 2, 0, Math.PI * 2);
      targetCtx.fill();
      targetCtx.restore();
      return;
    }

    if (points.length === 2) {
      targetCtx.beginPath();
      targetCtx.moveTo(points[0].x, points[0].y);
      targetCtx.lineTo(points[1].x, points[1].y);
      targetCtx.stroke();
      targetCtx.restore();
      return;
    }

    targetCtx.beginPath();
    targetCtx.moveTo(points[0].x, points[0].y);

    for (var i = 1; i < points.length - 1; i += 1) {
      var midX = (points[i].x + points[i + 1].x) / 2;
      var midY = (points[i].y + points[i + 1].y) / 2;
      targetCtx.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
    }

    var lastPoint = points[points.length - 1];
    targetCtx.lineTo(lastPoint.x, lastPoint.y);
    targetCtx.stroke();
    targetCtx.restore();
  }

  function renderCanvas() {
    var scaleX = canvasEl.width / EXPORT_WIDTH;
    var scaleY = canvasEl.height / EXPORT_HEIGHT;

    ctx.save();
    ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, EXPORT_WIDTH, EXPORT_HEIGHT);

    for (var i = 0; i < state.strokes.length; i += 1) {
      renderStroke(ctx, state.strokes[i]);
    }

    if (state.currentStroke) {
      renderStroke(ctx, state.currentStroke);
    }
    ctx.restore();
  }

  function resizeCanvas() {
    var rect = canvasStageEl.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return;
    }

    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var targetWidth = Math.round(rect.width * dpr);
    var targetHeight = Math.round(rect.height * dpr);

    if (canvasEl.width !== targetWidth || canvasEl.height !== targetHeight) {
      canvasEl.width = targetWidth;
      canvasEl.height = targetHeight;
    }

    renderCanvas();
  }

  function exportWhiteboardPngDataUrl() {
    var offscreen = document.createElement('canvas');
    offscreen.width = EXPORT_WIDTH;
    offscreen.height = EXPORT_HEIGHT;

    var offCtx = offscreen.getContext('2d');
    offCtx.fillStyle = '#FFFFFF';
    offCtx.fillRect(0, 0, EXPORT_WIDTH, EXPORT_HEIGHT);

    for (var i = 0; i < state.strokes.length; i += 1) {
      renderStroke(offCtx, state.strokes[i]);
    }

    return offscreen.toDataURL('image/png');
  }

  function getPenStrokes() {
    return state.strokes.filter(function (stroke) {
      return stroke.tool === 'pen';
    });
  }

  function getPenColorsUsed(penStrokes) {
    var colors = [];
    for (var i = 0; i < penStrokes.length; i += 1) {
      if (colors.indexOf(penStrokes[i].color) === -1) {
        colors.push(penStrokes[i].color);
      }
    }
    return colors;
  }

  function updateUiState() {
    var hasStrokes = state.strokes.length > 0;
    var isDrawingNow = state.currentStroke !== null;
    var penCount = getPenStrokes().length;

    btnUndo.disabled = !hasStrokes || state.isUploading;
    btnRedo.disabled = state.redoStack.length === 0 || state.isUploading;
    btnClear.disabled = !hasStrokes || state.isUploading;

    canvasPlaceholderEl.hidden = hasStrokes || isDrawingNow;
    strokeCounterEl.textContent = penCount + ' nét vẽ';
  }

  function updatePenPreview() {
    var previewDiameter = Math.max(4, Math.min(state.penSize, 22));
    penPreviewDotEl.style.width = previewDiameter + 'px';
    penPreviewDotEl.style.height = previewDiameter + 'px';
    penPreviewDotEl.style.backgroundColor = state.tool === 'eraser' ? '#9CA3AF' : state.penColor;
    penSizeValueEl.textContent = state.penSize + ' px';
    penSizeSlider.value = String(state.penSize);

    sizePresetButtons.forEach(function (btn) {
      var presetSize = Number(btn.getAttribute('data-size'));
      btn.classList.toggle('is-active', presetSize === state.penSize);
    });
  }

  function setPenColor(color) {
    state.penColor = color;
    state.tool = 'pen';

    colorButtons.forEach(function (btn) {
      var isMatch = btn.getAttribute('data-color') === color;
      btn.classList.toggle('is-active', isMatch);
      btn.setAttribute('aria-pressed', isMatch ? 'true' : 'false');
    });

    updateToolButtons();
    updatePenPreview();
  }

  function setTool(toolName) {
    state.tool = toolName;
    updateToolButtons();
    updatePenPreview();
  }

  function updateToolButtons() {
    var isPen = state.tool === 'pen';
    toolPenBtn.classList.toggle('is-active', isPen);
    toolPenBtn.setAttribute('aria-pressed', isPen ? 'true' : 'false');

    toolEraserBtn.classList.toggle('is-active', !isPen);
    toolEraserBtn.setAttribute('aria-pressed', !isPen ? 'true' : 'false');

    canvasEl.style.cursor = isPen ? 'crosshair' : 'cell';
  }

  function setPenSize(sizeValue) {
    var clamped = Math.max(2, Math.min(24, Number(sizeValue) || 6));
    state.penSize = clamped;
    updatePenPreview();
  }

  function setMode(nextMode) {
    state.mode = nextMode;
    var isPrompt = nextMode === 'prompt';

    modePromptBtn.classList.toggle('is-active', isPrompt);
    modePromptBtn.setAttribute('aria-selected', isPrompt ? 'true' : 'false');

    modeFreeBtn.classList.toggle('is-active', !isPrompt);
    modeFreeBtn.setAttribute('aria-selected', !isPrompt ? 'true' : 'false');

    promptPanelEl.hidden = !isPrompt;
    freePanelEl.hidden = isPrompt;

    if (!isPrompt) {
      freeLabelInput.focus();
    }
  }

  function loadNextPrompt() {
    if (!promptGenerator || typeof promptGenerator.generate !== 'function') {
      return;
    }
    state.currentPrompt = promptGenerator.generate(state.category);
    promptDisplayEl.textContent = state.currentPrompt;
  }

  function handleUndo() {
    if (state.strokes.length === 0 || state.isUploading) {
      return;
    }
    var popped = state.strokes.pop();
    state.redoStack.push(popped);
    renderCanvas();
    updateUiState();
  }

  function handleRedo() {
    if (state.redoStack.length === 0 || state.isUploading) {
      return;
    }
    var restored = state.redoStack.pop();
    state.strokes.push(restored);
    renderCanvas();
    updateUiState();
  }

  function clearBoard() {
    state.strokes = [];
    state.redoStack = [];
    state.currentStroke = null;
    renderCanvas();
    updateUiState();
  }

  function setUploading(loading) {
    state.isUploading = loading;
    btnSave.disabled = loading;
    btnDownload.disabled = loading;
    btnSave.classList.toggle('is-loading', loading);
    btnSaveTextEl.textContent = loading ? 'Đang gửi dữ liệu...' : 'Lưu & Gửi dữ liệu';
    updateUiState();
  }

  function insertSymbolAtCursor(symbol) {
    var start = freeLabelInput.selectionStart;
    var end = freeLabelInput.selectionEnd;
    var currentVal = freeLabelInput.value;

    if (typeof start !== 'number' || typeof end !== 'number') {
      freeLabelInput.value = currentVal + symbol;
      freeLabelInput.focus();
      return;
    }

    var nextVal = currentVal.slice(0, start) + symbol + currentVal.slice(end);
    freeLabelInput.value = nextVal;

    var cursorOffset = symbol === 'sqrt()' ? start + 5 : start + symbol.length;
    freeLabelInput.focus();
    freeLabelInput.setSelectionRange(cursorOffset, cursorOffset);
  }

  function formatLocalFilenameStamp() {
    var now = new Date();
    function pad(num) {
      return num < 10 ? '0' + num : String(num);
    }
    return (
      now.getFullYear() +
      pad(now.getMonth() + 1) +
      pad(now.getDate()) +
      '_' +
      pad(now.getHours()) +
      pad(now.getMinutes()) +
      pad(now.getSeconds())
    );
  }

  function handleDownload() {
    var penStrokes = getPenStrokes();
    if (penStrokes.length === 0) {
      showToast('Bảng vẽ đang trống. Vui lòng viết biểu thức trước khi tải ảnh.', 'error');
      return;
    }

    var dataUrl = exportWhiteboardPngDataUrl();
    var link = document.createElement('a');
    link.href = dataUrl;
    link.download = 'math_' + formatLocalFilenameStamp() + '.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast('Đã tải ảnh PNG nền trắng về máy.', 'success');
  }

  function handleSave() {
    if (state.isUploading) {
      return;
    }

    var penStrokes = getPenStrokes();
    if (penStrokes.length === 0) {
      showToast('Bảng vẽ đang trống. Vui lòng viết biểu thức trước khi lưu.', 'error');
      return;
    }

    var label = '';
    if (state.mode === 'prompt') {
      label = state.currentPrompt;
    } else {
      label = freeLabelInput.value.trim();
      if (!label && !allowEmptyLabelCheckbox.checked) {
        showToast('Vui lòng nhập nhãn biểu thức tương ứng hoặc tích "Lưu không cần nhãn".', 'error');
        freeLabelInput.focus();
        return;
      }
    }

    var appsScriptUrl = config.APPS_SCRIPT_URL;
    if (!isValidAppsScriptUrl(appsScriptUrl)) {
      showToast('Chưa cấu hình APPS_SCRIPT_URL trong config.js. Bạn có thể dùng "Tải ảnh PNG" để thử nghiệm.', 'error');
      return;
    }

    var dataUrl = exportWhiteboardPngDataUrl();
    var imageBase64 = dataUrl.replace(/^data:image\/png;base64,/, '');
    var payload = {
      secret: config.SHARED_SECRET || '',
      imageBase64: imageBase64,
      label: label,
      mode: state.mode,
      penColorsUsed: getPenColorsUsed(penStrokes),
      strokeCount: penStrokes.length,
      penSize: state.penSize,
      clientTimestamp: new Date().toISOString(),
      viewport: window.innerWidth + 'x' + window.innerHeight
    };

    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timeoutId = null;
    if (controller) {
      timeoutId = window.setTimeout(function () {
        controller.abort();
      }, UPLOAD_TIMEOUT_MS);
    }

    setUploading(true);

    fetch(appsScriptUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(payload),
      redirect: 'follow',
      signal: controller ? controller.signal : undefined
    })
      .then(function (response) {
        if (!response.ok) {
          throw new Error('Máy chủ trả về mã lỗi HTTP ' + response.status);
        }
        return response.text();
      })
      .then(function (rawText) {
        var result;
        try {
          result = JSON.parse(rawText);
        } catch (parseErr) {
          throw new Error('Phản hồi từ Apps Script không đúng định dạng JSON.');
        }

        if (!result || result.success !== true) {
          throw new Error((result && result.error) || 'Không thể lưu dữ liệu lên Google Drive.');
        }

        state.sessionCount += 1;
        saveSessionCount();
        showToast('Đã lưu lên Drive: ' + (result.fileName || 'thanh cong'), 'success');

        clearBoard();
        if (state.mode === 'prompt') {
          loadNextPrompt();
        } else {
          freeLabelInput.value = '';
          freeLabelInput.focus();
        }
      })
      .catch(function (error) {
        if (error && error.name === 'AbortError') {
          showToast('Quá thời gian kết nối khi gửi ảnh. Nét vẽ vẫn được giữ nguyên, hãy thử lại.', 'error');
        } else {
          var message = error && error.message ? error.message : 'Lỗi kết nối khi gửi dữ liệu.';
          showToast('Gửi thất bại: ' + message, 'error');
        }
      })
      .finally(function () {
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId);
        }
        setUploading(false);
      });
  }

  function handlePointerDown(e) {
    if (state.isUploading) {
      return;
    }
    if (e.pointerType === 'mouse' && e.button !== 0) {
      return;
    }
    if (state.activePointerId !== null) {
      return;
    }

    e.preventDefault();
    state.activePointerId = e.pointerId;
    try {
      canvasEl.setPointerCapture(e.pointerId);
    } catch (err) {
      // Một số trình duyệt cũ không hỗ trợ capture đầy đủ
    }

    var startPoint = getLogicalPoint(e.clientX, e.clientY);
    state.redoStack = [];
    state.currentStroke = {
      tool: state.tool,
      color: state.penColor,
      size: state.penSize,
      points: [startPoint]
    };

    renderCanvas();
    updateUiState();
  }

  function handlePointerMove(e) {
    if (!state.currentStroke || e.pointerId !== state.activePointerId) {
      return;
    }

    e.preventDefault();
    var events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [e];
    if (!events || events.length === 0) {
      events = [e];
    }

    var points = state.currentStroke.points;
    var added = false;

    for (var i = 0; i < events.length; i += 1) {
      var nextPoint = getLogicalPoint(events[i].clientX, events[i].clientY);
      var prevPoint = points[points.length - 1];
      if (distanceSquared(prevPoint, nextPoint) >= 0.25) {
        points.push(nextPoint);
        added = true;
      }
    }

    if (added) {
      renderCanvas();
    }
  }

  function finishStroke(e) {
    if (!state.currentStroke || e.pointerId !== state.activePointerId) {
      return;
    }

    try {
      if (canvasEl.hasPointerCapture && canvasEl.hasPointerCapture(e.pointerId)) {
        canvasEl.releasePointerCapture(e.pointerId);
      }
    } catch (err) {
      // Bỏ qua nếu capture đã tự hủy
    }

    state.strokes.push(state.currentStroke);
    state.currentStroke = null;
    state.activePointerId = null;

    renderCanvas();
    updateUiState();
  }

  function isFormElementFocused(target) {
    if (!target || !target.tagName) {
      return false;
    }
    var tag = target.tagName.toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select';
  }

  function handleKeyDown(e) {
    var hasModifier = e.ctrlKey || e.metaKey;

    if (hasModifier && e.key === 'Enter') {
      e.preventDefault();
      handleSave();
      return;
    }

    if (isFormElementFocused(e.target)) {
      return;
    }

    if (hasModifier && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) {
        handleRedo();
      } else {
        handleUndo();
      }
      return;
    }

    if (hasModifier && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      handleRedo();
      return;
    }

    if (hasModifier || e.altKey) {
      return;
    }

    if (e.key === '1') {
      setPenColor('#111111');
    } else if (e.key === '2') {
      setPenColor('#1D4ED8');
    } else if (e.key === '3') {
      setPenColor('#DC2626');
    } else if (e.key.toLowerCase() === 'e') {
      setTool(state.tool === 'eraser' ? 'pen' : 'eraser');
    }
  }

  function bindEvents() {
    modePromptBtn.addEventListener('click', function () {
      setMode('prompt');
    });

    modeFreeBtn.addEventListener('click', function () {
      setMode('free');
    });

    promptCategoryEl.addEventListener('change', function () {
      state.category = promptCategoryEl.value;
      loadNextPrompt();
    });

    btnNextPrompt.addEventListener('click', loadNextPrompt);

    quickSymbolButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        insertSymbolAtCursor(btn.getAttribute('data-symbol') || '');
      });
    });

    colorButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        setPenColor(btn.getAttribute('data-color') || '#111111');
      });
    });

    toolPenBtn.addEventListener('click', function () {
      setTool('pen');
    });

    toolEraserBtn.addEventListener('click', function () {
      setTool('eraser');
    });

    penSizeSlider.addEventListener('input', function () {
      setPenSize(penSizeSlider.value);
    });

    sizePresetButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        setPenSize(btn.getAttribute('data-size'));
      });
    });

    btnUndo.addEventListener('click', handleUndo);
    btnRedo.addEventListener('click', handleRedo);

    btnToggleGrid.addEventListener('click', function () {
      state.showGrid = !state.showGrid;
      canvasStageEl.classList.toggle('has-grid', state.showGrid);
      btnToggleGrid.classList.toggle('is-active', state.showGrid);
      btnToggleGrid.setAttribute('aria-pressed', state.showGrid ? 'true' : 'false');
    });

    btnClear.addEventListener('click', function () {
      if (state.strokes.length === 0 || state.isUploading) {
        return;
      }
      clearBoard();
      showToast('Đã xóa sạch bảng vẽ.', 'info');
    });

    btnDownload.addEventListener('click', handleDownload);
    btnSave.addEventListener('click', handleSave);

    canvasEl.addEventListener('pointerdown', handlePointerDown);
    canvasEl.addEventListener('pointermove', handlePointerMove);
    canvasEl.addEventListener('pointerup', finishStroke);
    canvasEl.addEventListener('pointercancel', finishStroke);

    document.addEventListener('keydown', handleKeyDown);

    if (typeof ResizeObserver !== 'undefined') {
      var observer = new ResizeObserver(function () {
        resizeCanvas();
      });
      observer.observe(canvasStageEl);
    } else {
      window.addEventListener('resize', resizeCanvas);
    }
  }

  function init() {
    configWarningEl.hidden = isValidAppsScriptUrl(config.APPS_SCRIPT_URL);
    loadSessionCount();
    loadNextPrompt();
    setPenColor(state.penColor);
    setPenSize(state.penSize);
    setMode('prompt');
    bindEvents();
    resizeCanvas();
    updateUiState();
  }

  init();
})();
