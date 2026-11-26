/**
 * Logic bảng vẽ chữ viết tay, phân khu bổ sung data thiếu, đồng bộ tiến độ Sheet,
 * con trỏ đầu bút trực quan, lọc chống spam và gửi PNG nền trắng chuẩn lên Apps Script.
 */
(function () {
  'use strict';

  var config = window.APP_CONFIG || {};
  var promptGenerator = window.MathPromptGenerator;

  var EXPORT_WIDTH = Number(config.EXPORT_WIDTH) || 1200;
  var EXPORT_HEIGHT = Number(config.EXPORT_HEIGHT) || 500;
  var UPLOAD_TIMEOUT_MS = Number(config.UPLOAD_TIMEOUT_MS) || 25000;
  var SUBMIT_COOLDOWN_MS = Number(config.SUBMIT_COOLDOWN_MS) || 4000;
  var MIN_DRAW_DURATION_MS = Number(config.MIN_DRAW_DURATION_MS) || 600;
  var MIN_PEN_STROKES = Number(config.MIN_PEN_STROKES) || 2;
  var MIN_TOTAL_INK_LENGTH = Number(config.MIN_TOTAL_INK_LENGTH) || 45;
  var MIN_BBOX_WIDTH = Number(config.MIN_BBOX_WIDTH) || 28;
  var MIN_BBOX_HEIGHT = Number(config.MIN_BBOX_HEIGHT) || 16;
  var MAX_INK_COVERAGE_RATIO = Number(config.MAX_INK_COVERAGE_RATIO) || 0.35;
  var EDGE_MARGIN_PX = Number(config.EDGE_MARGIN_PX) || 18;
  var SESSION_GOAL = Number(config.SESSION_GOAL) || 10;

  var DEFICIT_TARGETS = config.DEFICIT_TARGETS || {
    div_colon: { label: 'Chia :', target: 50, baseCount: 1 },
    mul_implicit: { label: 'Nhân liền (a)b', target: 45, baseCount: 6 },
    pow_caret: { label: 'Mũ ^', target: 45, baseCount: 6 },
    mul_dot: { label: 'Nhân chấm ·', target: 35, baseCount: 18 }
  };

  var VALID_COLORS = ['#111111', '#1D4ED8', '#DC2626'];
  var SESSION_STORAGE_KEY = 'math_ink_session_count';
  var CLIENT_ID_STORAGE_KEY = 'math_ink_client_id';
  var PREFS_STORAGE_KEY = 'math_ink_prefs_v1';

  var configWarningEl = document.getElementById('config-warning');
  var sessionCountEl = document.getElementById('session-count');
  var sessionGoalTargetEl = document.getElementById('session-goal-target');
  var sessionProgressFillEl = document.getElementById('session-progress-fill');

  var modeDeficitBtn = document.getElementById('mode-deficit');
  var modePromptBtn = document.getElementById('mode-prompt');
  var modeFreeBtn = document.getElementById('mode-free');

  var deficitPanelEl = document.getElementById('deficit-panel');
  var promptPanelEl = document.getElementById('prompt-panel');
  var freePanelEl = document.getElementById('free-panel');

  var deficitFilterButtons = Array.prototype.slice.call(document.querySelectorAll('.deficit-filter-btn'));
  var countDivColonEl = document.getElementById('count-div_colon');
  var countMulImplicitEl = document.getElementById('count-mul_implicit');
  var countPowCaretEl = document.getElementById('count-pow_caret');
  var countMulDotEl = document.getElementById('count-mul_dot');
  var liveSyncStatusEl = document.getElementById('live-sync-status');
  var deficitActiveTagEl = document.getElementById('deficit-active-tag');
  var deficitPromptDisplayEl = document.getElementById('deficit-prompt-display');
  var btnNextDeficit = document.getElementById('btn-next-deficit');
  var deficitRuleHintEl = document.getElementById('deficit-rule-hint');
  var deficitCanonicalPreviewEl = document.getElementById('deficit-canonical-preview');

  var promptCategoryEl = document.getElementById('prompt-category');
  var promptDisplayEl = document.getElementById('prompt-display');
  var btnNextPrompt = document.getElementById('btn-next-prompt');

  var freeLabelInput = document.getElementById('free-label-input');
  var freeStyleTagEl = document.getElementById('free-style-tag');
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
  var btnStylusOnly = document.getElementById('btn-stylus-only');
  var btnClear = document.getElementById('btn-clear');

  var canvasStageEl = document.getElementById('canvas-stage');
  var canvasEl = document.getElementById('drawing-canvas');
  var brushCursorEl = document.getElementById('brush-cursor');
  var brushCursorCenterEl = brushCursorEl ? brushCursorEl.querySelector('.brush-cursor-center') : null;
  var edgeWarningPillEl = document.getElementById('edge-warning-pill');
  var canvasPlaceholderEl = document.getElementById('canvas-placeholder');
  var strokeCounterEl = document.getElementById('stroke-counter');

  var btnDownload = document.getElementById('btn-download');
  var btnSave = document.getElementById('btn-save');
  var btnSaveTextEl = btnSave.querySelector('.btn-save-text');
  var honeypotInputEl = document.getElementById('website-hp');
  var toastContainerEl = document.getElementById('toast-container');

  var ctx = canvasEl.getContext('2d');

  var state = {
    mode: 'deficit',
    deficitFilter: 'auto',
    currentDeficitItem: {
      display: '144 : 12',
      canonical: '144 / 12',
      styleTag: 'div_colon',
      highlightToken: ':',
      ruleHint: 'Viết rõ dấu hai chấm : (không viết dấu / hay gạch phân số).'
    },
    category: 'mixed',
    currentGeneralItem: {
      display: '47 + 86',
      canonical: '47 + 86',
      styleTag: 'general_basic',
      highlightToken: '',
      ruleHint: ''
    },
    sheetCounts: {
      div_colon: 0,
      mul_implicit: 0,
      pow_caret: 0,
      mul_dot: 0
    },
    penColor: config.DEFAULT_PEN_COLOR || '#111111',
    penSize: Number(config.DEFAULT_PEN_SIZE) || 6,
    tool: 'pen',
    showGrid: false,
    stylusOnly: false,
    strokes: [],
    redoStack: [],
    currentStroke: null,
    activePointerId: null,
    isUploading: false,
    sessionCount: 0,
    clientId: '',
    totalDrawDurationMs: 0,
    strokeStartTime: 0,
    cooldownUntil: 0,
    cooldownTimerId: null,
    cursorVisible: false,
    lastCursorStageX: 0,
    lastCursorStageY: 0,
    lastPointerType: 'mouse'
  };

  function isValidAppsScriptUrl(url) {
    return (
      typeof url === 'string' &&
      url.indexOf('https://') === 0 &&
      url.indexOf('PASTE_YOUR_GOOGLE_APPS_SCRIPT') === -1
    );
  }

  function loadPrefs() {
    try {
      var raw = window.localStorage.getItem(PREFS_STORAGE_KEY);
      if (!raw) {
        return;
      }
      var parsed = JSON.parse(raw);
      if (parsed && VALID_COLORS.indexOf(parsed.penColor) !== -1) {
        state.penColor = parsed.penColor;
      }
      if (parsed && typeof parsed.penSize === 'number' && parsed.penSize >= 2 && parsed.penSize <= 24) {
        state.penSize = Math.round(parsed.penSize);
      }
      if (parsed && typeof parsed.showGrid === 'boolean') {
        state.showGrid = parsed.showGrid;
      }
      if (parsed && typeof parsed.stylusOnly === 'boolean') {
        state.stylusOnly = parsed.stylusOnly;
      }
    } catch (err) {
      // Bỏ qua khi không đọc được localStorage
    }
  }

  function savePrefs() {
    try {
      window.localStorage.setItem(
        PREFS_STORAGE_KEY,
        JSON.stringify({
          penColor: state.penColor,
          penSize: state.penSize,
          showGrid: state.showGrid,
          stylusOnly: state.stylusOnly
        })
      );
    } catch (err) {
      // Bỏ qua khi trình duyệt chặn localStorage
    }
  }

  function loadOrCreateClientId() {
    var existing = '';
    try {
      existing = window.localStorage.getItem(CLIENT_ID_STORAGE_KEY) || '';
    } catch (err) {
      existing = '';
    }

    if (/^[a-zA-Z0-9_-]{12,64}$/.test(existing)) {
      state.clientId = existing;
      return;
    }

    var generated =
      'cid_' +
      Date.now().toString(36) +
      '_' +
      Math.random().toString(36).slice(2, 12) +
      Math.random().toString(36).slice(2, 6);

    state.clientId = generated.slice(0, 32);
    try {
      window.localStorage.setItem(CLIENT_ID_STORAGE_KEY, state.clientId);
    } catch (err) {
      // Bỏ qua khi trình duyệt chặn localStorage
    }
  }

  function updateSessionProgressUi() {
    sessionCountEl.textContent = String(state.sessionCount);
    if (sessionGoalTargetEl) {
      sessionGoalTargetEl.textContent = String(SESSION_GOAL);
    }
    if (sessionProgressFillEl) {
      var pct = Math.min(100, Math.round((state.sessionCount / SESSION_GOAL) * 100));
      sessionProgressFillEl.style.width = pct + '%';
      sessionProgressFillEl.classList.toggle('is-complete', state.sessionCount >= SESSION_GOAL);
    }
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
    updateSessionProgressUi();
  }

  function saveSessionCount() {
    try {
      window.localStorage.setItem(SESSION_STORAGE_KEY, String(state.sessionCount));
    } catch (err) {
      // Bỏ qua khi trình duyệt chặn localStorage
    }
    updateSessionProgressUi();
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

  function getCombinedDeficitCounts() {
    return {
      div_colon: (DEFICIT_TARGETS.div_colon.baseCount || 0) + (state.sheetCounts.div_colon || 0),
      mul_implicit: (DEFICIT_TARGETS.mul_implicit.baseCount || 0) + (state.sheetCounts.mul_implicit || 0),
      pow_caret: (DEFICIT_TARGETS.pow_caret.baseCount || 0) + (state.sheetCounts.pow_caret || 0),
      mul_dot: (DEFICIT_TARGETS.mul_dot.baseCount || 0) + (state.sheetCounts.mul_dot || 0)
    };
  }

  function updateDeficitCountBadges() {
    var combined = getCombinedDeficitCounts();
    var countElements = {
      div_colon: countDivColonEl,
      mul_implicit: countMulImplicitEl,
      pow_caret: countPowCaretEl,
      mul_dot: countMulDotEl
    };

    Object.keys(countElements).forEach(function (key) {
      var countEl = countElements[key];
      var target = DEFICIT_TARGETS[key] ? DEFICIT_TARGETS[key].target : 40;
      var current = combined[key] || 0;
      if (countEl) {
        countEl.textContent = current + '/' + target;
      }
      var parentBtn = countEl ? countEl.closest('.deficit-filter-btn') : null;
      if (parentBtn) {
        parentBtn.classList.toggle('is-target-met', current >= target);
      }
    });
  }

  function fetchLiveDeficitStats() {
    var appsScriptUrl = config.APPS_SCRIPT_URL;
    if (!isValidAppsScriptUrl(appsScriptUrl)) {
      if (liveSyncStatusEl) {
        liveSyncStatusEl.textContent = 'Chế độ offline';
      }
      return;
    }

    if (liveSyncStatusEl) {
      liveSyncStatusEl.textContent = 'Đang đồng bộ...';
    }

    var statsUrl =
      appsScriptUrl + (appsScriptUrl.indexOf('?') === -1 ? '?' : '&') + 'action=stats';
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timeoutId = null;
    if (controller) {
      timeoutId = window.setTimeout(function () {
        controller.abort();
      }, 8000);
    }

    fetch(statsUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: controller ? controller.signal : undefined
    })
      .then(function (response) {
        if (!response.ok) {
          throw new Error('HTTP ' + response.status);
        }
        return response.text();
      })
      .then(function (rawText) {
        var data = JSON.parse(rawText);
        if (data && data.success === true && data.counts) {
          state.sheetCounts.div_colon = Number(data.counts.div_colon) || 0;
          state.sheetCounts.mul_implicit = Number(data.counts.mul_implicit) || 0;
          state.sheetCounts.pow_caret = Number(data.counts.pow_caret) || 0;
          state.sheetCounts.mul_dot = Number(data.counts.mul_dot) || 0;
          updateDeficitCountBadges();
          if (liveSyncStatusEl) {
            liveSyncStatusEl.textContent = 'Đã đồng bộ Drive';
          }
        } else if (liveSyncStatusEl) {
          liveSyncStatusEl.textContent = 'Dùng số liệu mặc định';
        }
      })
      .catch(function () {
        if (liveSyncStatusEl) {
          liveSyncStatusEl.textContent = 'Dùng số liệu mặc định';
        }
      })
      .finally(function () {
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId);
        }
      });
  }

  function appendHighlightSpan(containerEl, text) {
    var span = document.createElement('span');
    span.className = 'prompt-op-highlight';
    span.textContent = text;
    containerEl.appendChild(span);
  }

  function renderHighlightedExpression(containerEl, displayText, highlightToken) {
    containerEl.textContent = '';

    if (!highlightToken) {
      containerEl.textContent = displayText;
      return;
    }

    if (highlightToken === 'implicit') {
      var buffer = '';
      var i = 0;
      while (i < displayText.length) {
        var ch = displayText.charAt(i);
        var next = i + 1 < displayText.length ? displayText.charAt(i + 1) : '';
        var isImplicitPair =
          (ch === ')' && next === '(') ||
          (ch === ')' && /[0-9]/.test(next)) ||
          (/[0-9]/.test(ch) && next === '(');

        if (isImplicitPair) {
          if (buffer) {
            containerEl.appendChild(document.createTextNode(buffer));
            buffer = '';
          }
          appendHighlightSpan(containerEl, ch + next);
          i += 2;
        } else {
          buffer += ch;
          i += 1;
        }
      }
      if (buffer) {
        containerEl.appendChild(document.createTextNode(buffer));
      }
      return;
    }

    var parts = displayText.split(highlightToken);
    for (var p = 0; p < parts.length; p += 1) {
      if (parts[p]) {
        containerEl.appendChild(document.createTextNode(parts[p]));
      }
      if (p < parts.length - 1) {
        appendHighlightSpan(containerEl, highlightToken);
      }
    }
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

  function syncBrushCursorAppearance() {
    if (!brushCursorEl) {
      return;
    }

    var rect = canvasStageEl.getBoundingClientRect();
    var logicalDia = state.tool === 'eraser' ? Math.max(state.penSize * 2.2, 16) : state.penSize;
    var scale = (rect.width || EXPORT_WIDTH) / EXPORT_WIDTH;
    var visualDia = Math.max(8, Math.round(logicalDia * scale));

    brushCursorEl.style.width = visualDia + 'px';
    brushCursorEl.style.height = visualDia + 'px';

    if (state.tool === 'eraser') {
      brushCursorEl.classList.add('is-eraser');
      brushCursorEl.style.borderColor = '#4B5563';
      if (brushCursorCenterEl) {
        brushCursorCenterEl.style.backgroundColor = '#4B5563';
      }
    } else {
      brushCursorEl.classList.remove('is-eraser');
      brushCursorEl.style.borderColor = state.penColor;
      if (brushCursorCenterEl) {
        brushCursorCenterEl.style.backgroundColor = state.penColor;
      }
    }

    brushCursorEl.style.transform =
      'translate3d(' + state.lastCursorStageX + 'px, ' + state.lastCursorStageY + 'px, 0) translate(-50%, -50%)';
  }

  function hideBrushCursor() {
    if (!brushCursorEl) {
      return;
    }
    state.cursorVisible = false;
    brushCursorEl.hidden = true;
    canvasStageEl.classList.remove('has-custom-cursor');
  }

  function updateBrushCursorFromEvent(e) {
    if (!brushCursorEl || !e) {
      return;
    }

    if (e.pointerType) {
      state.lastPointerType = e.pointerType;
    }

    if (e.pointerType === 'touch') {
      hideBrushCursor();
      return;
    }

    if (typeof e.clientX !== 'number' || typeof e.clientY !== 'number') {
      return;
    }

    var stageRect = canvasStageEl.getBoundingClientRect();
    var stageX = e.clientX - stageRect.left;
    var stageY = e.clientY - stageRect.top;

    if (stageX < 0 || stageY < 0 || stageX > stageRect.width || stageY > stageRect.height) {
      hideBrushCursor();
      return;
    }

    state.lastCursorStageX = stageX;
    state.lastCursorStageY = stageY;

    if (!state.cursorVisible) {
      state.cursorVisible = true;
      brushCursorEl.hidden = false;
      canvasStageEl.classList.add('has-custom-cursor');
      syncBrushCursorAppearance();
      return;
    }

    brushCursorEl.style.transform =
      'translate3d(' + stageX + 'px, ' + stageY + 'px, 0) translate(-50%, -50%)';
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
    syncBrushCursorAppearance();
  }

  function createExportOffscreenCanvas() {
    var offscreen = document.createElement('canvas');
    offscreen.width = EXPORT_WIDTH;
    offscreen.height = EXPORT_HEIGHT;

    var offCtx = offscreen.getContext('2d');
    offCtx.fillStyle = '#FFFFFF';
    offCtx.fillRect(0, 0, EXPORT_WIDTH, EXPORT_HEIGHT);

    for (var i = 0; i < state.strokes.length; i += 1) {
      renderStroke(offCtx, state.strokes[i]);
    }

    return offscreen;
  }

  function exportWhiteboardPngDataUrl() {
    return createExportOffscreenCanvas().toDataURL('image/png');
  }

  function exportAndInspectWhiteboard() {
    var offscreen = createExportOffscreenCanvas();
    var offCtx = offscreen.getContext('2d');
    var imgData = offCtx.getImageData(0, 0, EXPORT_WIDTH, EXPORT_HEIGHT).data;

    var totalSamples = 0;
    var inkSamples = 0;

    for (var y = 0; y < EXPORT_HEIGHT; y += 2) {
      for (var x = 0; x < EXPORT_WIDTH; x += 2) {
        var idx = (y * EXPORT_WIDTH + x) * 4;
        totalSamples += 1;
        if (imgData[idx] < 245 || imgData[idx + 1] < 245 || imgData[idx + 2] < 245) {
          inkSamples += 1;
        }
      }
    }

    if (inkSamples < 25) {
      return {
        valid: false,
        message: 'Bảng vẽ gần như trống trắng (có thể bạn đã tẩy hết nét). Vui lòng viết lại biểu thức.'
      };
    }

    if (totalSamples > 0 && inkSamples / totalSamples > MAX_INK_COVERAGE_RATIO) {
      return {
        valid: false,
        message: 'Bảng vẽ bị tô kín bất thường, không giống biểu thức toán học. Vui lòng xóa bảng và viết lại.'
      };
    }

    return {
      valid: true,
      dataUrl: offscreen.toDataURL('image/png')
    };
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

  function checkEdgeClipping() {
    if (!edgeWarningPillEl) {
      return;
    }

    var penStrokes = getPenStrokes();
    var isNearEdge = false;

    for (var i = 0; i < penStrokes.length && !isNearEdge; i += 1) {
      var pts = penStrokes[i].points;
      for (var j = 0; j < pts.length; j += 1) {
        var pt = pts[j];
        if (
          pt.x < EDGE_MARGIN_PX ||
          pt.x > EXPORT_WIDTH - EDGE_MARGIN_PX ||
          pt.y < EDGE_MARGIN_PX ||
          pt.y > EXPORT_HEIGHT - EDGE_MARGIN_PX
        ) {
          isNearEdge = true;
          break;
        }
      }
    }

    edgeWarningPillEl.hidden = !isNearEdge;
    canvasStageEl.classList.toggle('has-edge-warning', isNearEdge);
  }

  function validateDrawingQuality(penStrokes) {
    if (penStrokes.length < MIN_PEN_STROKES) {
      return {
        valid: false,
        message: 'Biểu thức quá ngắn hoặc chỉ có 1 nét quẹt. Vui lòng viết biểu thức toán học đầy đủ.'
      };
    }

    var totalInkLength = 0;
    var minX = Infinity;
    var maxX = -Infinity;
    var minY = Infinity;
    var maxY = -Infinity;

    for (var i = 0; i < penStrokes.length; i += 1) {
      var pts = penStrokes[i].points;
      for (var j = 0; j < pts.length; j += 1) {
        var pt = pts[j];
        if (pt.x < minX) minX = pt.x;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.y < minY) minY = pt.y;
        if (pt.y > maxY) maxY = pt.y;

        if (j > 0) {
          totalInkLength += Math.sqrt(distanceSquared(pts[j - 1], pt));
        }
      }
    }

    if (totalInkLength < MIN_TOTAL_INK_LENGTH) {
      return {
        valid: false,
        message: 'Nét vẽ quá ít dữ liệu. Vui lòng viết biểu thức rõ ràng hơn.'
      };
    }

    if (maxX - minX < MIN_BBOX_WIDTH || maxY - minY < MIN_BBOX_HEIGHT) {
      return {
        valid: false,
        message: 'Vùng viết biểu thức quá nhỏ hoặc không hợp lệ. Vui lòng viết rõ chữ số và phép tính.'
      };
    }

    if (state.totalDrawDurationMs < MIN_DRAW_DURATION_MS) {
      return {
        valid: false,
        message: 'Thao tác vẽ quá nhanh bất thường. Vui lòng viết biểu thức cẩn thận trước khi gửi.'
      };
    }

    return { valid: true };
  }

  function updateSaveButtonState() {
    if (state.isUploading) {
      btnSave.disabled = true;
      btnSave.classList.add('is-loading');
      btnSaveTextEl.textContent = 'Đang gửi dữ liệu...';
      return;
    }

    btnSave.classList.remove('is-loading');
    var remainingMs = state.cooldownUntil - Date.now();
    if (remainingMs > 0) {
      btnSave.disabled = true;
      btnSaveTextEl.textContent = 'Chờ ' + Math.ceil(remainingMs / 1000) + 's...';
    } else {
      btnSave.disabled = false;
      btnSaveTextEl.textContent = 'Lưu & Gửi dữ liệu';
    }
  }

  function startSubmitCooldown() {
    state.cooldownUntil = Date.now() + SUBMIT_COOLDOWN_MS;
    if (state.cooldownTimerId !== null) {
      window.clearInterval(state.cooldownTimerId);
    }

    updateSaveButtonState();
    state.cooldownTimerId = window.setInterval(function () {
      if (Date.now() >= state.cooldownUntil) {
        window.clearInterval(state.cooldownTimerId);
        state.cooldownTimerId = null;
        state.cooldownUntil = 0;
      }
      updateSaveButtonState();
    }, 250);
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
    updateSaveButtonState();
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

    syncBrushCursorAppearance();
  }

  function applyGridUi() {
    canvasStageEl.classList.toggle('has-grid', state.showGrid);
    btnToggleGrid.classList.toggle('is-active', state.showGrid);
    btnToggleGrid.setAttribute('aria-pressed', state.showGrid ? 'true' : 'false');
  }

  function applyStylusOnlyUi() {
    if (!btnStylusOnly) {
      return;
    }
    btnStylusOnly.classList.toggle('is-active', state.stylusOnly);
    btnStylusOnly.setAttribute('aria-pressed', state.stylusOnly ? 'true' : 'false');
  }

  function setPenColor(color, persist) {
    state.penColor = color;
    state.tool = 'pen';

    colorButtons.forEach(function (btn) {
      var isMatch = btn.getAttribute('data-color') === color;
      btn.classList.toggle('is-active', isMatch);
      btn.setAttribute('aria-pressed', isMatch ? 'true' : 'false');
    });

    updateToolButtons();
    updatePenPreview();
    if (persist) {
      savePrefs();
    }
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
    syncBrushCursorAppearance();
  }

  function setPenSize(sizeValue, persist) {
    var clamped = Math.max(2, Math.min(24, Number(sizeValue) || 6));
    state.penSize = clamped;
    updatePenPreview();
    if (persist) {
      savePrefs();
    }
  }

  function setMode(nextMode) {
    state.mode = nextMode;
    var isDeficit = nextMode === 'deficit';
    var isPrompt = nextMode === 'prompt';
    var isFree = nextMode === 'free';

    modeDeficitBtn.classList.toggle('is-active', isDeficit);
    modeDeficitBtn.setAttribute('aria-selected', isDeficit ? 'true' : 'false');

    modePromptBtn.classList.toggle('is-active', isPrompt);
    modePromptBtn.setAttribute('aria-selected', isPrompt ? 'true' : 'false');

    modeFreeBtn.classList.toggle('is-active', isFree);
    modeFreeBtn.setAttribute('aria-selected', isFree ? 'true' : 'false');

    deficitPanelEl.hidden = !isDeficit;
    promptPanelEl.hidden = !isPrompt;
    freePanelEl.hidden = !isFree;

    if (isFree) {
      freeLabelInput.focus();
    }
  }

  function setDeficitFilter(filterType) {
    state.deficitFilter = filterType || 'auto';
    deficitFilterButtons.forEach(function (btn) {
      var isMatch = btn.getAttribute('data-deficit') === state.deficitFilter;
      btn.classList.toggle('is-active', isMatch);
      btn.setAttribute('aria-pressed', isMatch ? 'true' : 'false');
    });
    loadNextDeficitPrompt();
  }

  function loadNextDeficitPrompt() {
    if (!promptGenerator || typeof promptGenerator.generateDeficit !== 'function') {
      return;
    }

    var item = promptGenerator.generateDeficit(
      state.deficitFilter,
      getCombinedDeficitCounts(),
      DEFICIT_TARGETS
    );
    state.currentDeficitItem = item;

    var targetCfg = DEFICIT_TARGETS[item.styleTag];
    if (deficitActiveTagEl) {
      deficitActiveTagEl.textContent = targetCfg ? targetCfg.label : item.styleTag;
    }

    renderHighlightedExpression(deficitPromptDisplayEl, item.display, item.highlightToken);

    if (deficitRuleHintEl) {
      deficitRuleHintEl.textContent = item.ruleHint;
    }
    if (deficitCanonicalPreviewEl) {
      deficitCanonicalPreviewEl.textContent = item.canonical;
    }
  }

  function loadNextPrompt() {
    if (!promptGenerator) {
      return;
    }
    if (typeof promptGenerator.generateGeneral === 'function') {
      state.currentGeneralItem = promptGenerator.generateGeneral(state.category);
    } else if (typeof promptGenerator.generate === 'function') {
      var text = promptGenerator.generate(state.category);
      state.currentGeneralItem = {
        display: text,
        canonical: text,
        styleTag: 'general_' + state.category,
        highlightToken: '',
        ruleHint: ''
      };
    }
    promptDisplayEl.textContent = state.currentGeneralItem.display;
  }

  function handleUndo() {
    if (state.strokes.length === 0 || state.isUploading) {
      return;
    }
    var popped = state.strokes.pop();
    state.redoStack.push(popped);
    renderCanvas();
    checkEdgeClipping();
    updateUiState();
  }

  function handleRedo() {
    if (state.redoStack.length === 0 || state.isUploading) {
      return;
    }
    var restored = state.redoStack.pop();
    state.strokes.push(restored);
    renderCanvas();
    checkEdgeClipping();
    updateUiState();
  }

  function clearBoard() {
    state.strokes = [];
    state.redoStack = [];
    state.currentStroke = null;
    state.totalDrawDurationMs = 0;
    state.strokeStartTime = 0;
    renderCanvas();
    checkEdgeClipping();
    updateUiState();
  }

  function setUploading(loading) {
    state.isUploading = loading;
    btnDownload.disabled = loading;
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

    if (Date.now() < state.cooldownUntil) {
      showToast('Vui lòng chờ vài giây trước khi gửi mẫu tiếp theo.', 'info');
      return;
    }

    var honeypotVal = honeypotInputEl ? honeypotInputEl.value : '';
    if (honeypotVal && honeypotVal.trim() !== '') {
      showToast('Yêu cầu bị từ chối.', 'error');
      return;
    }

    var penStrokes = getPenStrokes();
    if (penStrokes.length === 0) {
      showToast('Bảng vẽ đang trống. Vui lòng viết biểu thức trước khi lưu.', 'error');
      return;
    }

    var qualityCheck = validateDrawingQuality(penStrokes);
    if (!qualityCheck.valid) {
      showToast(qualityCheck.message, 'error');
      return;
    }

    var label = '';
    var displayExpr = '';
    var styleTag = '';

    if (state.mode === 'deficit') {
      label = state.currentDeficitItem.canonical;
      displayExpr = state.currentDeficitItem.display;
      styleTag = state.currentDeficitItem.styleTag;
    } else if (state.mode === 'prompt') {
      label = state.currentGeneralItem.canonical;
      displayExpr = state.currentGeneralItem.display;
      styleTag = state.currentGeneralItem.styleTag;
    } else {
      label = freeLabelInput.value.trim();
      displayExpr = label;
      styleTag = freeStyleTagEl ? freeStyleTagEl.value : 'free';

      if (!label && !allowEmptyLabelCheckbox.checked) {
        showToast('Vui lòng nhập nhãn biểu thức tương ứng hoặc tích "Lưu không cần nhãn".', 'error');
        freeLabelInput.focus();
        return;
      }
      if (label) {
        if (label.length > 120) {
          showToast('Nhãn biểu thức quá dài (tối đa 120 ký tự).', 'error');
          freeLabelInput.focus();
          return;
        }
        if (
          !/^[0-9a-zA-Z+\-*/^=().,:\u00B7\s<>[\]{}|\\]+$/.test(label) ||
          !/[0-9+\-*/^=():\u00B7]/.test(label)
        ) {
          showToast('Nhãn biểu thức chứa ký tự không hợp lệ hoặc không phải biểu thức toán học.', 'error');
          freeLabelInput.focus();
          return;
        }
      }
    }

    var appsScriptUrl = config.APPS_SCRIPT_URL;
    if (!isValidAppsScriptUrl(appsScriptUrl)) {
      showToast('Chưa cấu hình APPS_SCRIPT_URL trong config.js. Bạn có thể dùng "Tải PNG" để thử nghiệm.', 'error');
      return;
    }

    var exportInspection = exportAndInspectWhiteboard();
    if (!exportInspection.valid) {
      showToast(exportInspection.message, 'error');
      return;
    }

    var imageBase64 = exportInspection.dataUrl.replace(/^data:image\/png;base64,/, '');
    var payload = {
      secret: config.SHARED_SECRET || '',
      clientId: state.clientId,
      imageBase64: imageBase64,
      label: label,
      displayExpr: displayExpr,
      styleTag: styleTag,
      mode: state.mode,
      penColorsUsed: getPenColorsUsed(penStrokes),
      strokeCount: penStrokes.length,
      penSize: state.penSize,
      drawDurationMs: Math.round(state.totalDrawDurationMs),
      honeypot: honeypotVal,
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

        if (Object.prototype.hasOwnProperty.call(state.sheetCounts, styleTag)) {
          state.sheetCounts[styleTag] += 1;
          updateDeficitCountBadges();
        }

        showToast('Đã lưu lên Drive: ' + (result.fileName || 'thanh cong'), 'success');

        clearBoard();
        startSubmitCooldown();
        if (state.mode === 'deficit') {
          loadNextDeficitPrompt();
        } else if (state.mode === 'prompt') {
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
    if (state.stylusOnly && e.pointerType === 'touch') {
      return;
    }

    updateBrushCursorFromEvent(e);

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
    state.strokeStartTime = state.tool === 'pen' ? Date.now() : 0;

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
    updateBrushCursorFromEvent(e);

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

    if (state.currentStroke.tool === 'pen' && state.strokeStartTime > 0) {
      state.totalDrawDurationMs += Math.min(Date.now() - state.strokeStartTime, 15000);
    }
    state.strokeStartTime = 0;

    state.strokes.push(state.currentStroke);
    state.currentStroke = null;
    state.activePointerId = null;

    renderCanvas();
    checkEdgeClipping();
    updateUiState();
  }

  function handleMouseMoveFallback(e) {
    if (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) {
      return;
    }
    if (state.lastPointerType === 'touch') {
      return;
    }
    updateBrushCursorFromEvent(e);
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

    if (e.key === 'Escape') {
      if (state.strokes.length > 0 && !state.isUploading) {
        clearBoard();
        showToast('Đã xóa sạch bảng vẽ.', 'info');
      }
      return;
    }

    var lowerKey = e.key.toLowerCase();
    if (lowerKey === 'n') {
      if (state.mode === 'deficit') {
        loadNextDeficitPrompt();
      } else if (state.mode === 'prompt') {
        loadNextPrompt();
      }
    } else if (e.key === '1') {
      setPenColor('#111111', true);
    } else if (e.key === '2') {
      setPenColor('#1D4ED8', true);
    } else if (e.key === '3') {
      setPenColor('#DC2626', true);
    } else if (lowerKey === 'e') {
      setTool(state.tool === 'eraser' ? 'pen' : 'eraser');
    }
  }

  function bindEvents() {
    modeDeficitBtn.addEventListener('click', function () {
      setMode('deficit');
    });

    modePromptBtn.addEventListener('click', function () {
      setMode('prompt');
    });

    modeFreeBtn.addEventListener('click', function () {
      setMode('free');
    });

    deficitFilterButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        setDeficitFilter(btn.getAttribute('data-deficit'));
      });
    });

    btnNextDeficit.addEventListener('click', loadNextDeficitPrompt);

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
        setPenColor(btn.getAttribute('data-color') || '#111111', true);
      });
    });

    toolPenBtn.addEventListener('click', function () {
      setTool('pen');
    });

    toolEraserBtn.addEventListener('click', function () {
      setTool('eraser');
    });

    penSizeSlider.addEventListener('input', function () {
      setPenSize(penSizeSlider.value, true);
    });

    sizePresetButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        setPenSize(btn.getAttribute('data-size'), true);
      });
    });

    btnUndo.addEventListener('click', handleUndo);
    btnRedo.addEventListener('click', handleRedo);

    btnToggleGrid.addEventListener('click', function () {
      state.showGrid = !state.showGrid;
      applyGridUi();
      savePrefs();
    });

    if (btnStylusOnly) {
      btnStylusOnly.addEventListener('click', function () {
        state.stylusOnly = !state.stylusOnly;
        applyStylusOnlyUi();
        savePrefs();
        showToast(
          state.stylusOnly
            ? 'Đã bật Chỉ nhận bút: chặn chạm tay khi viết bằng bút cảm ứng.'
            : 'Đã tắt Chỉ nhận bút: cho phép vẽ bằng cả ngón tay và bút.',
          'info'
        );
      });
    }

    btnClear.addEventListener('click', function () {
      if (state.strokes.length === 0 || state.isUploading) {
        return;
      }
      clearBoard();
      showToast('Đã xóa sạch bảng vẽ.', 'info');
    });

    btnDownload.addEventListener('click', handleDownload);
    btnSave.addEventListener('click', handleSave);

    canvasEl.addEventListener('pointerenter', updateBrushCursorFromEvent);
    canvasEl.addEventListener('pointerleave', hideBrushCursor);
    canvasEl.addEventListener('pointerdown', handlePointerDown);
    canvasEl.addEventListener('pointermove', handlePointerMove);
    canvasEl.addEventListener('pointerup', finishStroke);
    canvasEl.addEventListener('pointercancel', finishStroke);
    canvasEl.addEventListener('mousemove', handleMouseMoveFallback);
    canvasEl.addEventListener('mouseleave', hideBrushCursor);

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
    loadPrefs();
    loadOrCreateClientId();
    loadSessionCount();
    applyGridUi();
    applyStylusOnlyUi();
    updateDeficitCountBadges();
    loadNextDeficitPrompt();
    loadNextPrompt();
    setPenColor(state.penColor, false);
    setPenSize(state.penSize, false);
    setMode('deficit');
    bindEvents();
    resizeCanvas();
    updateUiState();
    fetchLiveDeficitStats();
  }

  init();
})();
