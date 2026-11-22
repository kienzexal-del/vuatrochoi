// =========================================================================
// 👑 VUA TRÒ CHƠI - HỆ THỐNG QUẢN LÝ LICENSE KEY (GOOGLE APPS SCRIPT)
// TÁCH BIỆT 2 TRANG TÍNH: 
//   1. Trang 'Keys_Lifetime' (hoặc 'Keys'): Quản lý Key Vĩnh Viễn
//   2. Trang 'Keys_Trial': Quản lý Key Dùng Thử (Bộ đếm ngược & Tự động xóa khi hết hạn)
// Hoạt động 100% MIỄN PHÍ trên Google Sheets - 0 đồng chi phí máy chủ
// =========================================================================

function doGet(e) {
  try {
    var params = e.parameter || {};
    var action = params.action || "verify";

    // 1. KIỂM TRA TRẠNG THÁI ĐƠN HÀNG (DÀNH CHO WEB BÁN HÀNG TỰ ĐỘNG)
    if (action === "check_order" || action === "checkOrder") {
      var orderId = (params.orderId || params.order_id || "").trim().toUpperCase();
      return handleCheckOrder(orderId);
    }

    var key = (params.key || "").trim().toUpperCase();
    var hwid = (params.hwid || "").trim();

    // 2. Kiểm tra tham số đầu vào cho hành động xác thực bản quyền
    if (!key) {
      return responseJson({
        success: false,
        message: "Vui lòng nhập Mã Bản Quyền (License Key)!"
      });
    }

    // 3. MẬT KHẨU TỔNG MASTER (Dành cho Admin khi cài hộ, vĩnh viễn không bao giờ hết hạn)
    var MASTER_KEY = "VTCH@ADMIN#2026";
    if (key === MASTER_KEY) {
      return responseJson({
        success: true,
        message: "Xác thực Quyền Quản trị viên (Master Admin) thành công!",
        customer: "Admin Owner",
        isMaster: true,
        isTrial: false
      });
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // 4. TÌM KIẾM KEY TRÊN CẢ 2 TRANG TÍNH (VĨNH VIỄN & DÙNG THỬ)
    var targetSheet = null;
    var foundRowIndex = -1;
    var rowData = null;
    var isTrialSheet = false;

    var sheetLifetime = ss.getSheetByName("Keys_Lifetime") || ss.getSheetByName("Keys");
    var sheetTrial = ss.getSheetByName("Keys_Trial") || ss.getSheetByName("Keys_DungThu");

    // A. Tìm trong Sheet Vĩnh Viễn trước
    if (sheetLifetime) {
      var dataLifetime = sheetLifetime.getDataRange().getValues();
      for (var i = 1; i < dataLifetime.length; i++) {
        if (String(dataLifetime[i][0]).trim().toUpperCase() === key) {
          targetSheet = sheetLifetime;
          foundRowIndex = i + 1;
          rowData = dataLifetime[i];
          isTrialSheet = false;
          break;
        }
      }
    }

    // B. Nếu chưa thấy, tìm tiếp trong Sheet Dùng Thử
    if (!targetSheet && sheetTrial) {
      var dataTrial = sheetTrial.getDataRange().getValues();
      for (var j = 1; j < dataTrial.length; j++) {
        if (String(dataTrial[j][0]).trim().toUpperCase() === key) {
          targetSheet = sheetTrial;
          foundRowIndex = j + 1;
          rowData = dataTrial[j];
          isTrialSheet = true;
          break;
        }
      }
    }

    // C. Không tìm thấy ở cả 2 trang tính
    if (!targetSheet || foundRowIndex === -1) {
      return responseJson({
        success: false,
        message: "Mã bản quyền không tồn tại hoặc đã bị vô hiệu hóa / xóa khỏi hệ thống!"
      });
    }

    // 4. XỬ LÝ TRẠNG THÁI VÀ THỜI HẠN
    var status = String(rowData[1] || "").trim().toLowerCase();
    var registeredHwid = String(rowData[2] || "").trim();
    var customerNote = String(rowData[4] || "Khách hàng");
    var durationDays = isTrialSheet ? (parseFloat(rowData[5]) || 1) : 0;
    var rawExpiresAt = isTrialSheet ? rowData[6] : "";

    // Kiểm tra trạng thái khóa thủ công bởi Admin (Killswitch)
    if (status === "disabled" || status === "khoa" || status === "locked") {
      return responseJson({
        success: false,
        isLocked: true,
        message: "Mã bản quyền này đã bị khóa từ xa bởi Quản trị viên!"
      });
    }

    // Kiểm tra hết hạn tự động (dành cho Key Dùng Thử)
    var now = new Date();
    if (isTrialSheet && rawExpiresAt) {
      var expDate = new Date(rawExpiresAt);
      if (!isNaN(expDate.getTime()) && now.getTime() > expDate.getTime()) {
        // Cập nhật trạng thái hết hạn trên Sheet
        targetSheet.getRange(foundRowIndex, 2).setValue("Expired");
        targetSheet.getRange(foundRowIndex, 8).setValue("⛔ HẾT HẠN");
        return responseJson({
          success: false,
          isExpired: true,
          message: "Bản dùng thử đã HẾT HẠN vào lúc " + Utilities.formatDate(expDate, "GMT+7", "yyyy-MM-dd HH:mm:ss") + "! Vui lòng liên hệ Admin để mua bản quyền vĩnh viễn."
        });
      }
    }

    // 5. TRƯỜNG HỢP 1: Key mới tinh, chưa từng kích hoạt máy nào
    if (!registeredHwid) {
      var expiresStr = "";
      var expiresTimestamp = 0;
      var remainingText = "";

      if (isTrialSheet) {
        var expDate = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
        expiresStr = Utilities.formatDate(expDate, "GMT+7", "yyyy-MM-dd HH:mm:ss");
        expiresTimestamp = Math.floor(expDate.getTime() / 1000);
        remainingText = "⏳ Còn " + durationDays + " ngày";

        targetSheet.getRange(foundRowIndex, 2).setValue("Trial");
        targetSheet.getRange(foundRowIndex, 7).setValue(expiresStr);
        targetSheet.getRange(foundRowIndex, 8).setValue(remainingText);
      } else {
        targetSheet.getRange(foundRowIndex, 2).setValue("Used");
        // NÂNG CẤP LÊN VĨNH VIỄN: Tự động xóa sạch key dùng thử cũ của HWID này trong sheet Keys_Trial!
        if (sheetTrial) {
          cleanTrialKeysForHwid(sheetTrial, hwid);
        }
      }

      targetSheet.getRange(foundRowIndex, 3).setValue(hwid);
      targetSheet.getRange(foundRowIndex, 4).setValue(Utilities.formatDate(now, "GMT+7", "yyyy-MM-dd HH:mm:ss"));

      return responseJson({
        success: true,
        message: isTrialSheet 
          ? ("Kích hoạt dùng thử " + durationDays + " ngày thành công! Hạn dùng đến: " + expiresStr)
          : "Kích hoạt bản quyền VĨNH VIỄN thành công!",
        customer: customerNote,
        isNew: true,
        isTrial: isTrialSheet,
        durationDays: durationDays,
        expiresAt: expiresStr,
        expiresTimestamp: expiresTimestamp,
        remainingText: remainingText
      });
    }

    // 6. TRƯỜNG HỢP 2: Key đã kích hoạt -> Kiểm tra xem có đúng máy cũ không
    if (registeredHwid.toLowerCase() === hwid.toLowerCase()) {
      var expiresStr = String(rawExpiresAt || "");
      var expiresTimestamp = 0;
      var remainingText = "";

      if (isTrialSheet && rawExpiresAt) {
        var expDate = new Date(rawExpiresAt);
        expiresTimestamp = Math.floor(expDate.getTime() / 1000);
        var diffMs = expDate.getTime() - now.getTime();
        if (diffMs > 0) {
          var hours = Math.floor(diffMs / (1000 * 60 * 60));
          var mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
          remainingText = hours >= 24 
            ? ("Còn " + Math.floor(hours / 24) + " ngày " + (hours % 24) + " giờ")
            : ("Còn " + hours + " giờ " + mins + " phút");
          targetSheet.getRange(foundRowIndex, 8).setValue("⏳ " + remainingText);
        }
      }

      return responseJson({
        success: true,
        message: "Xác thực bản quyền thành công! (Thiết bị hợp lệ đã đăng ký).",
        customer: customerNote,
        isNew: false,
        isTrial: isTrialSheet,
        durationDays: durationDays,
        expiresAt: expiresStr,
        expiresTimestamp: expiresTimestamp,
        remainingText: remainingText
      });
    } else {
      // Khách mang Key sang máy thứ 2 (hoặc Admin đã xóa HWID khỏi Sheet để thu hồi!)
      return responseJson({
        success: false,
        message: "Mã bản quyền này đã được kích hoạt trên một máy tính khác! Vui lòng liên hệ Admin để đổi thiết bị."
      });
    }

  } catch (err) {
    return responseJson({
      success: false,
      message: "Lỗi hệ thống máy chủ: " + err.toString()
    });
  }
}

function responseJson(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// =========================================================================
// 💳 TỰ ĐỘNG HÓA THANH TOÁN SEPAY & NHẢ KEY TỰ ĐỘNG
// =========================================================================

function doPost(e) {
  try {
    var postData = "";
    if (e && e.postData && e.postData.contents) {
      postData = e.postData.contents;
    }
    
    if (!postData) {
      return responseJson({ success: false, message: "Không nhận được dữ liệu (Empty payload)" });
    }

    var payload = JSON.parse(postData);
    return handleSepayWebhook(payload);
  } catch (err) {
    return responseJson({
      success: false,
      message: "Lỗi xử lý Webhook: " + err.toString()
    });
  }
}

function handleSepayWebhook(data) {
  // Chỉ nhận tiền vào (transferType: "in")
  var transferType = String(data.transferType || "in").toLowerCase();
  if (transferType !== "in") {
    return responseJson({ success: true, message: "Bỏ qua giao dịch tiền ra" });
  }

  var amount = parseFloat(data.transferAmount || 0);
  var content = String(data.content || data.description || "").trim();
  var gateway = String(data.gateway || "MBBank");
  var refCode = String(data.referenceCode || data.id || "");
  var txDate = String(data.transactionDate || Utilities.formatDate(new Date(), "GMT+7", "yyyy-MM-dd HH:mm:ss"));

  // 1. Trích xuất mã đơn hàng dạng VTCHxxxx từ nội dung chuyển khoản
  var orderMatch = content.match(/VTCH[A-Z0-9_]+/i);
  var orderId = orderMatch ? orderMatch[0].toUpperCase() : ("VTCH" + Math.floor(1000 + Math.random() * 9000));

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 2. Đảm bảo có Sheet 'Orders' để lưu lịch sử giao dịch
  var sheetOrders = ss.getSheetByName("Orders") || ss.getSheetByName("DonHang");
  if (!sheetOrders) {
    sheetOrders = ss.insertSheet("Orders");
    var orderHeaders = ["OrderId", "Amount", "Tier", "Key", "Status", "Date", "Gateway", "RefCode", "Content"];
    sheetOrders.getRange(1, 1, 1, orderHeaders.length).setValues([orderHeaders]);
    sheetOrders.getRange(1, 1, 1, orderHeaders.length).setFontWeight("bold").setBackground("#D9EAD3");
  }

  // Chống xử lý trùng lặp (Idempotency)
  var existingOrders = sheetOrders.getDataRange().getValues();
  for (var i = 1; i < existingOrders.length; i++) {
    var exOrderId = String(existingOrders[i][0]).trim().toUpperCase();
    var exRefCode = String(existingOrders[i][7]).trim();
    if ((orderMatch && exOrderId === orderId) || (refCode && exRefCode === refCode)) {
      return responseJson({
        success: true,
        message: "Giao dịch đã được ghi nhận trước đó",
        orderId: exOrderId,
        key: existingOrders[i][3]
      });
    }
  }

  // 3. Phân loại gói theo số tiền (10k, 20k, 50k, 100k)
  var tier = "lifetime";
  var durationDays = 0;
  var tierName = "Vĩnh Viễn";

  if (amount >= 100000) {
    tier = "lifetime";
    durationDays = 0;
    tierName = "Bản Quyền Vĩnh Viễn";
  } else if (amount >= 50000) {
    tier = "trial";
    durationDays = 7;
    tierName = "Dùng Thử 7 Ngày";
  } else if (amount >= 20000) {
    tier = "trial";
    durationDays = 3;
    tierName = "Dùng Thử 3 Ngày";
  } else if (amount >= 10000) {
    tier = "trial";
    durationDays = 1;
    tierName = "Dùng Thử 1 Ngày";
  } else {
    var newRowLess = [orderId, amount, "Không Hợp Lệ (<10k)", "", "REJECTED_AMOUNT", txDate, gateway, refCode, content];
    sheetOrders.appendRow(newRowLess);
    return responseJson({ success: false, message: "Số tiền không đủ mức gói tối thiểu (10.000đ)" });
  }

  // 4. Bốc Key từ kho tương ứng (hoặc tự động tạo nếu kho hết)
  var dispensedKey = "";
  var sheetLifetime = ss.getSheetByName("Keys_Lifetime") || ss.getSheetByName("Keys");
  var sheetTrial = ss.getSheetByName("Keys_Trial") || ss.getSheetByName("Keys_DungThu");

  if (tier === "lifetime") {
    if (!sheetLifetime) sheetLifetime = ss.insertSheet("Keys_Lifetime");
    var dataL = sheetLifetime.getDataRange().getValues();
    var foundIndex = -1;
    for (var r = 1; r < dataL.length; r++) {
      var kStatus = String(dataL[r][1] || "").trim().toLowerCase();
      var kHwid = String(dataL[r][2] || "").trim();
      if (kStatus === "active" && !kHwid) {
        dispensedKey = String(dataL[r][0]).trim().toUpperCase();
        foundIndex = r + 1;
        break;
      }
    }

    if (dispensedKey && foundIndex !== -1) {
      sheetLifetime.getRange(foundIndex, 2).setValue("Sold");
      sheetLifetime.getRange(foundIndex, 5).setValue("SePay: " + orderId + " (" + amount + "đ)");
    } else {
      // Tự động sinh key mới nếu hết hàng
      var chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
      dispensedKey = "VTCH-" + getRandomString(4, chars) + "-" + getRandomString(4, chars) + "-" + getRandomString(4, chars);
      sheetLifetime.appendRow([dispensedKey, "Sold", "", "", "SePay Tự Động: " + orderId]);
    }
  } else {
    if (!sheetTrial) sheetTrial = ss.insertSheet("Keys_Trial");
    var dataT = sheetTrial.getDataRange().getValues();
    var foundTIndex = -1;
    for (var t = 1; t < dataT.length; t++) {
      var tStatus = String(dataT[t][1] || "").trim().toLowerCase();
      var tHwid = String(dataT[t][2] || "").trim();
      var tDur = parseFloat(dataT[t][5]) || 0;
      if (tStatus === "active" && !tHwid && (tDur === durationDays || tDur === 0)) {
        dispensedKey = String(dataT[t][0]).trim().toUpperCase();
        foundTIndex = t + 1;
        break;
      }
    }

    if (dispensedKey && foundTIndex !== -1) {
      sheetTrial.getRange(foundTIndex, 2).setValue("Sold");
      sheetTrial.getRange(foundTIndex, 5).setValue("SePay: " + orderId + " (" + amount + "đ)");
    } else {
      // Tự động sinh key dùng thử mới nếu hết hàng
      var charsT = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
      dispensedKey = "VTCH-T" + durationDays + "-" + getRandomString(4, charsT) + "-" + getRandomString(4, charsT);
      sheetTrial.appendRow([dispensedKey, "Sold", "", "", "SePay Tự Động: " + orderId, durationDays, "", ""]);
    }
  }

  // 5. Ghi vào danh sách Đơn Hàng
  var orderRow = [orderId, amount, tierName, dispensedKey, "PAID", txDate, gateway, refCode, content];
  sheetOrders.appendRow(orderRow);

  return responseJson({
    success: true,
    message: "Xử lý đơn hàng thành công!",
    orderId: orderId,
    key: dispensedKey,
    tier: tierName,
    amount: amount
  });
}

function handleCheckOrder(orderId) {
  if (!orderId) {
    return responseJson({ success: false, message: "Thiếu mã đơn hàng" });
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetOrders = ss.getSheetByName("Orders") || ss.getSheetByName("DonHang");
  if (!sheetOrders) {
    return responseJson({ success: true, status: "PENDING", orderId: orderId, message: "Đang chờ thanh toán..." });
  }

  var data = sheetOrders.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    var rowOrderId = String(data[i][0]).trim().toUpperCase();
    var status = String(data[i][4]).trim().toUpperCase();
    if (rowOrderId === orderId.toUpperCase() && status === "PAID") {
      return responseJson({
        success: true,
        status: "PAID",
        orderId: rowOrderId,
        amount: data[i][1],
        tier: data[i][2],
        key: data[i][3],
        command: "irm tinyurl.com/vtch-win | iex",
        message: "Thanh toán thành công! Mã bản quyền của bạn đã sẵn sàng."
      });
    }
  }

  return responseJson({
    success: true,
    status: "PENDING",
    orderId: orderId,
    message: "Đang chờ thanh toán..."
  });
}

// =========================================================================
// 🎲 MENU QUẢN TRỊ TRÊN GOOGLE SHEETS
// =========================================================================

function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu("👑 VUA TRÒ CHƠI")
    .addItem("♾️ Tạo 10 Key VĨNH VIỄN (vào trang Keys_Lifetime)", "generate10LifetimeKeys")
    .addItem("♾️ Tạo 30 Key VĨNH VIỄN (vào trang Keys_Lifetime)", "generate30LifetimeKeys")
    .addSeparator()
    .addItem("⏱️ Tạo 10 Key DÙNG THỬ 1 Ngày (vào trang Keys_Trial)", "generate10Trial1Day")
    .addItem("⏱️ Tạo 10 Key DÙNG THỬ 3 Ngày (vào trang Keys_Trial)", "generate10Trial3Days")
    .addItem("⏱️ Tạo 10 Key DÙNG THỬ 7 Ngày (vào trang Keys_Trial)", "generate10Trial7Days")
    .addSeparator()
    .addItem("⏳ Cập nhật Bộ Đếm Ngược (Countdown) Keys_Trial", "updateTrialCountdowns")
    .addItem("🗑️ Quét & Tự Động XÓA BỎ Key Hết Hạn (Vô Hiệu Hóa Ngay)", "manualDeleteExpiredKeys")
    .addItem("⏰ Cài Đặt Tự Động Quét & Xóa 24/7 trên Mây", "installAutoCleanTrigger")
    .addSeparator()
    .addItem("📊 Thống Kê Tổng Hợp Cả 2 Trang Tính", "showDualSheetStats")
    .addToUi();
}

// --- Tạo Key Vĩnh Viễn vào Sheet 'Keys_Lifetime' (hoặc 'Keys') ---
function generate10LifetimeKeys() { generateLifetime(10); }
function generate30LifetimeKeys() { generateLifetime(30); }

function generateLifetime(count) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Keys_Lifetime") || ss.getSheetByName("Keys");
  
  if (!sheet) {
    sheet = ss.insertSheet("Keys_Lifetime");
  }

  var headers = ["Key", "Status", "HWID", "ActivatedAt", "CustomerNote"];
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, 5).setValues([headers]);
    sheet.getRange(1, 1, 1, 5).setFontWeight("bold").setBackground("#D9EAD3");
  }

  var chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  var newRows = [];
  for (var i = 0; i < count; i++) {
    var p1 = getRandomString(4, chars);
    var p2 = getRandomString(4, chars);
    var p3 = getRandomString(4, chars);
    var key = "VTCH-" + p1 + "-" + p2 + "-" + p3;
    newRows.push([key, "Active", "", "", "Khách Vĩnh Viễn"]);
  }

  var lastRow = sheet.getLastRow();
  sheet.getRange(lastRow + 1, 1, newRows.length, 5).setValues(newRows);
  SpreadsheetApp.getUi().alert("🎉 Đã tạo thành công " + count + " mã Key Vĩnh Viễn vào trang '" + sheet.getName() + "'!");
}

// --- Tạo Key Dùng Thử vào Sheet 'Keys_Trial' (Có Cột Countdown) ---
function generate10Trial1Day()  { generateTrial(10, 1); }
function generate10Trial3Days() { generateTrial(10, 3); }
function generate10Trial7Days() { generateTrial(10, 7); }

function generateTrial(count, days) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Keys_Trial") || ss.getSheetByName("Keys_DungThu");
  
  if (!sheet) {
    sheet = ss.insertSheet("Keys_Trial");
  }

  var headers = ["Key", "Status", "HWID", "ActivatedAt", "CustomerNote", "DurationDays", "ExpiresAt", "Countdown"];
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, 8).setValues([headers]);
    sheet.getRange(1, 1, 1, 8).setFontWeight("bold").setBackground("#FFF2CC");
  }

  var chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  var newRows = [];
  for (var i = 0; i < count; i++) {
    var p1 = getRandomString(4, chars);
    var p2 = getRandomString(4, chars);
    var p3 = getRandomString(4, chars);
    var key = "VTCH-T" + days + "-" + p1 + "-" + p2 + "-" + p3;
    newRows.push([key, "Active", "", "", "Dùng thử " + days + " ngày", days, "", "Chưa kích hoạt"]);
  }

  var lastRow = sheet.getLastRow();
  sheet.getRange(lastRow + 1, 1, newRows.length, 8).setValues(newRows);
  SpreadsheetApp.getUi().alert("🎉 Đã tạo thành công " + count + " mã Key Dùng Thử (" + days + " ngày) vào trang '" + sheet.getName() + "'!");
}

function getRandomString(len, chars) {
  var res = "";
  for (var i = 0; i < len; i++) {
    var idx = Math.floor(Math.random() * chars.length);
    res += chars.charAt(idx);
  }
  return res;
}

// ⏳ 1. Cập nhật Bộ Đếm Ngược (Countdown) trực quan cho tất cả key trong Keys_Trial
function updateTrialCountdowns() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Keys_Trial") || ss.getSheetByName("Keys_DungThu");
  if (!sheet) {
    SpreadsheetApp.getUi().alert("Chưa tìm thấy trang 'Keys_Trial'!");
    return;
  }

  var data = sheet.getDataRange().getValues();
  var now = new Date().getTime();
  var updatedCount = 0;

  for (var i = 1; i < data.length; i++) {
    var status = String(data[i][1] || "").toLowerCase();
    var expRaw = data[i][6];

    if (status === "trial" && expRaw) {
      var expDate = new Date(expRaw).getTime();
      if (!isNaN(expDate)) {
        var diffMs = expDate - now;
        if (diffMs <= 0) {
          sheet.getRange(i + 1, 2).setValue("Expired");
          sheet.getRange(i + 1, 8).setValue("⛔ HẾT HẠN");
        } else {
          var hours = Math.floor(diffMs / (1000 * 60 * 60));
          var mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
          var text = hours >= 24 
            ? ("⏳ Còn " + Math.floor(hours / 24) + " ngày " + (hours % 24) + " giờ")
            : ("⏳ Còn " + hours + " giờ " + mins + " phút");
          sheet.getRange(i + 1, 8).setValue(text);
          updatedCount++;
        }
      }
    } else if (status === "active") {
      sheet.getRange(i + 1, 8).setValue("Chưa kích hoạt");
    } else if (status === "expired") {
      sheet.getRange(i + 1, 8).setValue("⛔ HẾT HẠN");
    }
  }

  SpreadsheetApp.getUi().alert("⏳ Đã cập nhật xong Bộ Đếm Ngược Countdown cho " + updatedCount + " key đang chạy!");
}

// 🗑️ 2. Tự động XÓA HẲN các Key đã hết hạn khỏi hệ thống để Vô Hiệu Hóa hoàn toàn
function manualDeleteExpiredKeys() {
  var count = purgeExpiredKeys();
  SpreadsheetApp.getUi().alert("🗑️ Đã quét và XÓA HẲN " + count + " mã Key hết hạn khỏi hệ thống! Bảng tính đã được dọn sạch sẽ và các máy đó bị vô hiệu hóa 100%.");
}

function purgeExpiredKeys() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Keys_Trial") || ss.getSheetByName("Keys_DungThu");
  if (!sheet) return 0;

  // Tự động tạo trang 'Keys_Trial_LichSu' để lưu vết dự phòng trước khi xóa khỏi bảng chính
  var historySheet = ss.getSheetByName("Keys_Trial_LichSu");
  if (!historySheet) {
    historySheet = ss.insertSheet("Keys_Trial_LichSu");
    var histHeaders = ["Key", "Status", "HWID", "ActivatedAt", "CustomerNote", "DurationDays", "ExpiresAt", "ThoiDiemXoa"];
    historySheet.getRange(1, 1, 1, 8).setValues([histHeaders]);
    historySheet.getRange(1, 1, 1, 8).setFontWeight("bold").setBackground("#F4CCCC");
  }

  var data = sheet.getDataRange().getValues();
  var now = new Date().getTime();
  var deletedCount = 0;

  // Xóa từ dòng dưới lên dòng trên để tránh lệch index hàng
  for (var i = data.length - 1; i >= 1; i--) {
    var status = String(data[i][1] || "").toLowerCase();
    var expRaw = data[i][6];
    var isExpired = false;

    if (status === "expired") {
      isExpired = true;
    } else if (expRaw) {
      var expDate = new Date(expRaw).getTime();
      if (!isNaN(expDate) && now >= expDate) {
        isExpired = true;
      }
    }

    if (isExpired) {
      // 1. Lưu bản ghi sang trang Lịch Sử
      var rowToArchive = data[i].slice(0, 7);
      rowToArchive.push(Utilities.formatDate(new Date(), "GMT+7", "yyyy-MM-dd HH:mm:ss"));
      historySheet.appendRow(rowToArchive);

      // 2. XÓA BỎ HOÀN TOÀN KHỎI TRANG KEYS_TRIAL CHÍNH (Vô hiệu hóa key ngay lập tức)
      sheet.deleteRow(i + 1);
      deletedCount++;
    }
  }

  return deletedCount;
}

// ⏰ 3. Cài đặt Trigger tự động quét & xóa ngầm 24/7 trên máy chủ Google (Không cần mở máy tính)
function installAutoCleanTrigger() {
  // Xóa các trigger cũ cùng tên nếu có
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "autoCleanJob24h") {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  // Tạo trigger mới: Chạy mỗi 1 giờ
  ScriptApp.newTrigger("autoCleanJob24h")
    .timeBased()
    .everyHours(1)
    .create();

  SpreadsheetApp.getUi().alert("✅ ĐÃ BẬT TỰ ĐỘNG QUÉT & XÓA 24/7!\n\nCứ mỗi 1 giờ, máy chủ Google sẽ tự động quét ngầm: nếu có key nào hết hạn 24h thì tự động XÓA KHỎI HỆ THỐNG để vô hiệu hóa ngay, bạn không cần phải mở máy hay thao tác gì nữa!");
}

// Hàm chạy ngầm của Trigger
function autoCleanJob24h() {
  purgeExpiredKeys();
}

// 📊 4. Thống kê tổng hợp cho cả 2 trang tính
function showDualSheetStats() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetL = ss.getSheetByName("Keys_Lifetime") || ss.getSheetByName("Keys");
  var sheetT = ss.getSheetByName("Keys_Trial") || ss.getSheetByName("Keys_DungThu");

  var msg = "📊 THỐNG KÊ TỔNG HỢP VUA TRÒ CHƠI:\n\n";

  if (sheetL) {
    var dataL = sheetL.getDataRange().getValues();
    var totalL = Math.max(0, dataL.length - 1);
    var actL = 0, usedL = 0;
    for (var i = 1; i < dataL.length; i++) {
      var s = String(dataL[i][1]).toLowerCase();
      if (s === "active") actL++;
      else if (s === "used") usedL++;
    }
    msg += "♾️ TRANG VĨNH VIỄN (" + sheetL.getName() + "):\n" +
           "- Tổng Key: " + totalL + " | Chưa bán: " + actL + " | Đang dùng: " + usedL + "\n\n";
  }

  if (sheetT) {
    var dataT = sheetT.getDataRange().getValues();
    var totalT = Math.max(0, dataT.length - 1);
    var actT = 0, trialT = 0;
    for (var j = 1; j < dataT.length; j++) {
      var st = String(dataT[j][1]).toLowerCase();
      if (st === "active") actT++;
      else if (st === "trial") trialT++;
    }
    msg += "⏱️ TRANG DÙNG THỬ (" + sheetT.getName() + "):\n" +
           "- Tổng Key: " + totalT + " | Chưa phát: " + actT + " | Đang thử: " + trialT + "\n";
  }

  SpreadsheetApp.getUi().alert(msg);
}

// Hàm dọn sạch key dùng thử cũ khi khách nâng cấp lên Vĩnh Viễn
function cleanTrialKeysForHwid(sheetTrial, hwid) {
  try {
    if (!sheetTrial || !hwid) return;
    var data = sheetTrial.getDataRange().getValues();
    for (var i = data.length - 1; i >= 1; i--) {
      var rowHwid = String(data[i][2] || "").trim().toLowerCase();
      if (rowHwid && rowHwid === hwid.trim().toLowerCase()) {
        sheetTrial.deleteRow(i + 1);
      }
    }
  } catch (e) {}
}
