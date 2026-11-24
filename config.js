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
  });
})(typeof window !== "undefined" ? window : globalThis);
