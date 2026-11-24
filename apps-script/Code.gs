/**
 * Google Apps Script Web App nhận ảnh PNG base64 và nhãn biểu thức từ frontend,
 * kiểm lọc chống spam / kiểm tra nhị phân PNG 1200x500, lưu ảnh vào Google Drive
 * và ghi log kèm trạng thái duyệt vào Google Sheet.
 */

var TARGET_FOLDER_ID = '1EJpOyHiLZC5NbozPsghEwcYTZoLa3z4_';
var LOG_SHEET_NAME = 'Math_Dataset_Labels';
var SHARED_SECRET = 'math-ink-2026';
var MAX_BASE64_LENGTH = 5 * 1024 * 1024;

var MIN_PNG_BYTES = 2600;
var MAX_PNG_BYTES = 600 * 1024;
var EXPECTED_WIDTH = 1200;
var EXPECTED_HEIGHT = 500;
var RATE_LIMIT_PER_CLIENT_PER_MIN = 6;
var RATE_LIMIT_GLOBAL_PER_MIN = 35;
var DUPLICATE_CACHE_SECONDS = 21600;

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return jsonResponse_({
    success: true,
    status: 'ok',
    message: 'Math Ink Collector API is ready'
  });
}

function validatePngBytes_(bytes) {
  if (!bytes || bytes.length < MIN_PNG_BYTES) {
    return {
      valid: false,
      error: 'Anh qua nhe hoac khong co du lieu net ve hop le.'
    };
  }

  if (bytes.length > MAX_PNG_BYTES) {
    return {
      valid: false,
      error: 'Dung luong anh PNG vuot qua gioi han cho phep.'
    };
  }

  var pngSignature = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
  for (var i = 0; i < pngSignature.length; i += 1) {
    if ((bytes[i] & 0xFF) !== pngSignature[i]) {
      return {
        valid: false,
        error: 'Dinh dang file khong phai anh PNG hop le.'
      };
    }
  }

  var ihdrSignature = [0x49, 0x48, 0x44, 0x52];
  for (var j = 0; j < ihdrSignature.length; j += 1) {
    if ((bytes[12 + j] & 0xFF) !== ihdrSignature[j]) {
      return {
        valid: false,
        error: 'Cau truc header anh PNG khong hop le.'
      };
    }
  }

  var width = (
    ((bytes[16] & 0xFF) << 24) |
    ((bytes[17] & 0xFF) << 16) |
    ((bytes[18] & 0xFF) << 8) |
    (bytes[19] & 0xFF)
  ) >>> 0;

  var height = (
    ((bytes[20] & 0xFF) << 24) |
    ((bytes[21] & 0xFF) << 16) |
    ((bytes[22] & 0xFF) << 8) |
    (bytes[23] & 0xFF)
  ) >>> 0;

  if (width !== EXPECTED_WIDTH || height !== EXPECTED_HEIGHT) {
    return {
      valid: false,
      error: 'Kich thuoc anh khong dung chuan ' + EXPECTED_WIDTH + 'x' + EXPECTED_HEIGHT + '.'
    };
  }

  return { valid: true };
}

function computeSha256Hex_(bytes) {
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes);
  var hex = '';
  for (var i = 0; i < digest.length; i += 1) {
    hex += ('0' + (digest[i] & 0xFF).toString(16)).slice(-2);
  }
  return hex;
}

function checkRateLimit_(cache, clientId) {
  var minuteBucket = Math.floor(Date.now() / 60000);
  var globalKey = 'rl_g_' + minuteBucket;
  var clientKey = 'rl_c_' + clientId + '_' + minuteBucket;

  var globalCount = parseInt(cache.get(globalKey) || '0', 10) || 0;
  if (globalCount >= RATE_LIMIT_GLOBAL_PER_MIN) {
    return {
      valid: false,
      error: 'He thong dang nhan qua nhieu du lieu cung luc. Vui long thu lai sau it phut.'
    };
  }

  var clientCount = parseInt(cache.get(clientKey) || '0', 10) || 0;
  if (clientCount >= RATE_LIMIT_PER_CLIENT_PER_MIN) {
    return {
      valid: false,
      error: 'Ban gui qua nhanh (toi da 6 mau/phut). Vui long viet cham va ro rang hon.'
    };
  }

  return {
    valid: true,
    globalKey: globalKey,
    globalCount: globalCount,
    clientKey: clientKey,
    clientCount: clientCount
  };
}

function incrementRateLimit_(cache, rlState) {
  cache.put(rlState.globalKey, String(rlState.globalCount + 1), 90);
  cache.put(rlState.clientKey, String(rlState.clientCount + 1), 90);
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse_({
        success: false,
        error: 'Khong nhan duoc du lieu POST.'
      });
    }

    var data = JSON.parse(e.postData.contents);

    if (SHARED_SECRET && data.secret !== SHARED_SECRET) {
      return jsonResponse_({
        success: false,
        error: 'Unauthorized: Secret khong khop.'
      });
    }

    if (data.honeypot && String(data.honeypot).trim() !== '') {
      return jsonResponse_({
        success: false,
        error: 'Yeu cau bi tu choi.'
      });
    }

    var clientId = data.clientId ? String(data.clientId).trim() : '';
    if (!/^[a-zA-Z0-9_-]{12,64}$/.test(clientId)) {
      return jsonResponse_({
        success: false,
        error: 'Thieu dinh danh phien lam viec hop le.'
      });
    }

    var strokeCount = Number(data.strokeCount);
    if (isNaN(strokeCount) || strokeCount < 2 || strokeCount > 150) {
      return jsonResponse_({
        success: false,
        error: 'So luong net ve khong hop le (yeu cau 2 den 150 net).'
      });
    }

    var drawDurationMs = Number(data.drawDurationMs);
    if (isNaN(drawDurationMs) || drawDurationMs < 500) {
      return jsonResponse_({
        success: false,
        error: 'Thao tac ve qua nhanh hoac thieu thoi gian ve hop le.'
      });
    }

    var penSize = Number(data.penSize);
    if (isNaN(penSize) || penSize < 2 || penSize > 24) {
      return jsonResponse_({
        success: false,
        error: 'Co ngoi but khong hop le.'
      });
    }

    var labelText = data.label !== undefined && data.label !== null ? String(data.label).trim() : '';
    if (labelText.length > 120) {
      return jsonResponse_({
        success: false,
        error: 'Nhan bieu thuc vuot qua 120 ky tu.'
      });
    }
    if (labelText && !/^[0-9a-zA-Z+\-*/^=().,\s<>[\]{}|\\]+$/.test(labelText)) {
      return jsonResponse_({
        success: false,
        error: 'Nhan bieu thuc chua ky tu khong hop le.'
      });
    }

    var rawBase64 = typeof data.imageBase64 === 'string' ? data.imageBase64 : '';
    var cleanBase64 = rawBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');

    if (!cleanBase64) {
      return jsonResponse_({
        success: false,
        error: 'Thieu du lieu anh imageBase64.'
      });
    }

    if (cleanBase64.length > MAX_BASE64_LENGTH) {
      return jsonResponse_({
        success: false,
        error: 'Dung luong anh vuot qua gioi han cho phep.'
      });
    }

    var cache = CacheService.getScriptCache();
    var rlState = checkRateLimit_(cache, clientId);
    if (!rlState.valid) {
      return jsonResponse_({
        success: false,
        error: rlState.error
      });
    }

    var decodedBytes = Utilities.base64Decode(cleanBase64);
    var pngCheck = validatePngBytes_(decodedBytes);
    if (!pngCheck.valid) {
      return jsonResponse_({
        success: false,
        error: pngCheck.error
      });
    }

    var imageHash = computeSha256Hex_(decodedBytes);
    var dupKey = 'img_' + imageHash.slice(0, 40);
    if (cache.get(dupKey)) {
      return jsonResponse_({
        success: false,
        error: 'Anh nay da duoc gui truoc do (phat hien trung lap).'
      });
    }

    incrementRateLimit_(cache, rlState);

    var folder = DriveApp.getFolderById(TARGET_FOLDER_ID);
    var now = new Date();
    var timeStamp = Utilities.formatDate(now, 'Asia/Ho_Chi_Minh', 'yyyyMMdd_HHmmss');
    var shortId = Utilities.getUuid().slice(0, 6);
    var fileName = 'math_' + timeStamp + '_' + shortId + '.png';

    var blob = Utilities.newBlob(decodedBytes, 'image/png', fileName);
    var file = folder.createFile(blob);

    cache.put(dupKey, '1', DUPLICATE_CACHE_SECONDS);

    var modeText = data.mode ? String(data.mode) : 'unknown';
    var penColors = Array.isArray(data.penColorsUsed) ? data.penColorsUsed.join(', ') : '';
    var submittedAtVn = Utilities.formatDate(now, 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd HH:mm:ss');
    var clientViewport = data.viewport ? String(data.viewport) : '';

    appendLabelLog_(folder, {
      fileName: file.getName(),
      label: labelText,
      mode: modeText,
      fileId: file.getId(),
      fileUrl: file.getUrl(),
      penColors: penColors,
      strokeCount: strokeCount,
      penSize: penSize,
      submittedAtVn: submittedAtVn,
      clientViewport: clientViewport,
      status: 'PENDING'
    });

    return jsonResponse_({
      success: true,
      fileName: file.getName(),
      fileId: file.getId(),
      fileUrl: file.getUrl(),
      label: labelText
    });
  } catch (err) {
    return jsonResponse_({
      success: false,
      error: err && err.message ? err.message : String(err)
    });
  }
}

function getOrCreateLogSpreadsheet_(folder) {
  var props = PropertiesService.getScriptProperties();
  var savedId = props.getProperty('SPREADSHEET_ID');

  if (savedId) {
    try {
      var existingFile = DriveApp.getFileById(savedId);
      if (!existingFile.isTrashed()) {
        return SpreadsheetApp.openById(savedId);
      }
    } catch (ignoreErr) {
      // File khong ton tai hoac khong truy cap duoc, tim lai theo ten
    }
  }

  var files = folder.getFilesByName(LOG_SHEET_NAME);
  while (files.hasNext()) {
    var candidate = files.next();
    if (!candidate.isTrashed() && candidate.getMimeType() === MimeType.GOOGLE_SHEETS) {
      props.setProperty('SPREADSHEET_ID', candidate.getId());
      return SpreadsheetApp.openById(candidate.getId());
    }
  }

  var newSs = SpreadsheetApp.create(LOG_SHEET_NAME);
  DriveApp.getFileById(newSs.getId()).moveTo(folder);
  props.setProperty('SPREADSHEET_ID', newSs.getId());
  return newSs;
}

function ensureSheetHeaders_(sheet) {
  var headers = [
    'file_name',
    'label',
    'mode',
    'file_id',
    'drive_url',
    'pen_colors',
    'stroke_count',
    'pen_size',
    'submitted_at_vn',
    'client_viewport',
    'status'
  ];

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    return;
  }

  var statusHeader = String(sheet.getRange(1, 11).getValue()).trim();
  if (!statusHeader) {
    sheet.getRange(1, 11).setValue('status');
  }
}

function appendLabelLog_(folder, logData) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    var ss = getOrCreateLogSpreadsheet_(folder);
    var sheet = ss.getSheets()[0];
    ensureSheetHeaders_(sheet);

    var safeLabel = /^[=+\-@]/.test(logData.label) ? "'" + logData.label : logData.label;
    var nextRow = sheet.getLastRow() + 1;

    var rowValues = [
      logData.fileName,
      safeLabel,
      logData.mode,
      logData.fileId,
      logData.fileUrl,
      logData.penColors,
      logData.strokeCount,
      logData.penSize,
      logData.submittedAtVn,
      logData.clientViewport,
      logData.status || 'PENDING'
    ];

    sheet.getRange(nextRow, 1, 1, rowValues.length).setValues([rowValues]);
    sheet.getRange(nextRow, 2).setNumberFormat('@');
  } finally {
    lock.releaseLock();
  }
}

/**
 * Chay ham nay 1 lan trong Google Apps Script Editor de cap quyen Drive + Sheets
 * va kiem tra quyen truy cap thu muc dich truoc khi Deploy Web App.
 */
function testSetup() {
  var folder = DriveApp.getFolderById(TARGET_FOLDER_ID);
  var ss = getOrCreateLogSpreadsheet_(folder);
  var sheet = ss.getSheets()[0];
  ensureSheetHeaders_(sheet);

  Logger.log('Ket noi thanh cong thu muc Drive: ' + folder.getName() + ' (' + folder.getId() + ')');
  Logger.log('File Google Sheet log: ' + ss.getName() + ' (' + ss.getUrl() + ')');
}
