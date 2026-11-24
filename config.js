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
  });
})(typeof window !== "undefined" ? window : globalThis);
