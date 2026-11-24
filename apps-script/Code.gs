/**
 * Google Apps Script Web App nhận ảnh PNG base64 và nhãn biểu thức từ frontend,
 * lưu ảnh vào thư mục Google Drive chỉ định và ghi log vào Google Sheet.
 */

var TARGET_FOLDER_ID = '1EJpOyHiLZC5NbozPsghEwcYTZoLa3z4_';
var LOG_SHEET_NAME = 'Math_Dataset_Labels';
var SHARED_SECRET = 'math-ink-2026';
var MAX_BASE64_LENGTH = 5 * 1024 * 1024;

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
        error: 'Dung luong anh vuot qua gioi han 5MB.'
      });
    }

    var folder = DriveApp.getFolderById(TARGET_FOLDER_ID);
    var now = new Date();
    var timeStamp = Utilities.formatDate(now, 'Asia/Ho_Chi_Minh', 'yyyyMMdd_HHmmss');
    var shortId = Utilities.getUuid().slice(0, 6);
    var fileName = 'math_' + timeStamp + '_' + shortId + '.png';

    var decodedBytes = Utilities.base64Decode(cleanBase64);
    var blob = Utilities.newBlob(decodedBytes, 'image/png', fileName);
    var file = folder.createFile(blob);

    var labelText = data.label !== undefined && data.label !== null ? String(data.label).trim() : '';
    var modeText = data.mode ? String(data.mode) : 'unknown';
    var penColors = Array.isArray(data.penColorsUsed) ? data.penColorsUsed.join(', ') : '';
    var strokeCount = Number(data.strokeCount) || 0;
    var penSize = Number(data.penSize) || 0;
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
      clientViewport: clientViewport
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
  if (sheet.getLastRow() > 0) {
    return;
  }

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
    'client_viewport'
  ];

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
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
      logData.clientViewport
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
