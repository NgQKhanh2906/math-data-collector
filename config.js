/**
 * Cấu hình ứng dụng Math Ink Collector.
 * Sau khi deploy Google Apps Script Web App, dán URL Web App vào APPS_SCRIPT_URL.
 */
(function (globalScope) {
  "use strict";

  globalScope.APP_CONFIG = Object.freeze({
    APPS_SCRIPT_URL:
      "https://script.google.com/macros/s/AKfycbzcPLBiDm6pLHxB4HZDsODeQHqHoCux0kKS3dDfJT9ebKUdzzCNtzEpOfm-_iOfG99c_Q/exec",
    SHARED_SECRET: "math-ink-2026",
    EXPORT_WIDTH: 1200,
    EXPORT_HEIGHT: 500,
    UPLOAD_TIMEOUT_MS: 25000,
    DEFAULT_PEN_COLOR: "#111111",
    DEFAULT_PEN_SIZE: 6,
    SUBMIT_COOLDOWN_MS: 4000,
    MIN_DRAW_DURATION_MS: 600,
    MIN_PEN_STROKES: 2,
    MIN_TOTAL_INK_LENGTH: 45,
    MIN_BBOX_WIDTH: 28,
    MIN_BBOX_HEIGHT: 16,
    MAX_INK_COVERAGE_RATIO: 0.35,
    EDGE_MARGIN_PX: 18,
    SESSION_GOAL: 10,
    DEFICIT_TARGETS: Object.freeze({
      div_colon: Object.freeze({ label: 'Chia :', target: 50, baseCount: 1 }),
      mul_implicit: Object.freeze({ label: 'Nhân liền (a)b', target: 45, baseCount: 6 }),
      pow_caret: Object.freeze({ label: 'Mũ ^', target: 45, baseCount: 6 }),
      mul_dot: Object.freeze({ label: 'Nhân chấm ·', target: 35, baseCount: 18 }),
    }),
  });
})(typeof window !== "undefined" ? window : globalThis);
