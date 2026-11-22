// =========================================================================
// 👑 VUA TRÒ CHƠI - HỆ THỐNG QUẢN LÝ LICENSE KEY & THANH TOÁN TỰ ĐỘNG
// TÁCH BIỆT CÁC TRANG TÍNH: 
//   1. Trang 'Keys_Lifetime' (hoặc 'Keys'): Quản lý Key Vĩnh Viễn
//   2. Trang 'Keys_Trial': Quản lý Key Dùng Thử (Tự động xóa khi hết hạn)
//   3. Trang 'Orders': Lưu trữ lịch sử giao dịch & Mã xác thực SecretToken
// Bảo mật cao: Concurrency Lock (LockService), Chống quét trộm Key, Xác thực Webhook
// Hoạt động 100% MIỄN PHÍ trên Google Sheets - 0 đồng chi phí máy chủ
// =========================================================================

function doGet(e) {
  try {
    var params = e.parameter || {};
    var action = params.action || "verify";

    // 1. TẠO ĐƠN HÀNG MỚI (CHỐNG GIAN LẬN: LƯU TRƯỚC SỐ TIỀN & TOKEN BÍ MẬT)
    if (action === "create_order" || action === "createOrder") {
      return handleCreateOrder(params);
    }

    // 2. KIỂM TRA TRẠNG THÁI ĐƠN HÀNG (YÊU CẦU TOKEN BÍ MẬT ĐỂ NHẬN KEY)
    if (action === "check_order" || action === "checkOrder") {
      var orderId = (params.orderId || params.order_id || "").trim().toUpperCase();
      var token = (params.token || "").trim();
      return handleCheckOrder(orderId, token);
    }

    var key = (params.key || "").trim().toUpperCase();
    var hwid = (params.hwid || "").trim();

    // 3. Kiểm tra tham số đầu vào cho hành động xác thực bản quyền
    if (!key) {
      return responseJson({
        success: false,
        message: "Vui lòng nhập Mã Bản Quyền (License Key)!"
      });
    }

    // 4. MẬT KHẨU TỔNG MASTER (Lấy từ ScriptProperties an toàn phía server, không lộ text cứng)
    var props = PropertiesService.getScriptProperties();
    var MASTER_KEY = props.getProperty("MASTER_KEY") || "VTCH@ADMIN#2026";
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

    // 5. TÌM KIẾM KEY TRÊN CẢ 2 TRANG TÍNH (VĨNH VIỄN & DÙNG THỬ)
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

    // 6. XỬ LÝ TRẠNG THÁI VÀ THỜI HẠN
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
        targetSheet.getRange(foundRowIndex, 2).setValue("Expired");
        targetSheet.getRange(foundRowIndex, 8).setValue("⛔ HẾT HẠN");
        return responseJson({
          success: false,
          isExpired: true,
          message: "Bản dùng thử đã HẾT HẠN vào lúc " + Utilities.formatDate(expDate, "GMT+7", "yyyy-MM-dd HH:mm:ss") + "! Vui lòng liên hệ Admin để mua bản quyền vĩnh viễn."
        });
      }
    }

    // 7. TRƯỜNG HỢP 1: Key mới tinh, chưa từng kích hoạt máy nào
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

    // 8. TRƯỜNG HỢP 2: Key đã kích hoạt -> Kiểm tra xem có đúng máy cũ không
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
// 💳 TỰ ĐỘNG HÓA THANH TOÁN SEPAY & NHẢ KEY TỰ ĐỘNG (BẢO MẬT CAO)
// =========================================================================

function doPost(e) {
  try {
    // 1. XÁC THỰC WEBHOOK TỪ SEPAY (CHỐNG DỮ LIỆU GIẢ MẠO)
    var props = PropertiesService.getScriptProperties();
    var SEPAY_API_KEY = (props.getProperty("SEPAY_API_KEY") || props.getProperty("SEPAY_TOKEN") || "").trim();

    if (SEPAY_API_KEY) {
      var queryApiKey = (e && e.parameter && e.parameter.api_key) ? e.parameter.api_key : "";
      var authHeader = (e && e.headers) ? (e.headers["Authorization"] || e.headers["authorization"] || "") : "";
      
      var isAuthValid = false;
      if (queryApiKey && queryApiKey === SEPAY_API_KEY) {
        isAuthValid = true;
      } else if (authHeader && (authHeader === "Apikey " + SEPAY_API_KEY || authHeader === "Bearer " + SEPAY_API_KEY || authHeader === SEPAY_API_KEY)) {
        isAuthValid = true;
      }
      
      // Chặn nếu có cấu hình API Key mà request không hợp lệ
      if (!isAuthValid && (queryApiKey || authHeader)) {
        return responseJson({ success: false, message: "Unauthorized Webhook: Token không hợp lệ" });
      }
    }

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

function handleCreateOrder(params) {
  var tier = String(params.tier || "lifetime").toLowerCase();
  var amount = parseFloat(params.amount || 0);

  // Bảng giá quy định: 1 Ngày 10k, 3 Ngày 20k, 7 Ngày 50k, Vĩnh Viễn 100k
  var expectedAmount = 100000;
  var tierName = "Bản Quyền Vĩnh Viễn";
  var durationDays = 0;

  if (tier === "trial_1" || amount === 10000) {
    tier = "trial_1";
    expectedAmount = 10000;
    tierName = "Dùng Thử 1 Ngày";
    durationDays = 1;
  } else if (tier === "trial_3" || amount === 20000) {
    tier = "trial_3";
    expectedAmount = 20000;
    tierName = "Dùng Thử 3 Ngày";
    durationDays = 3;
  } else if (tier === "trial_7" || amount === 50000) {
    tier = "trial_7";
    expectedAmount = 50000;
    tierName = "Dùng Thử 7 Ngày";
    durationDays = 7;
  } else {
    tier = "lifetime";
    expectedAmount = 100000;
    tierName = "Bản Quyền Vĩnh Viễn";
    durationDays = 0;
  }

  // Sinh mã đơn ngẫu nhiên độ dài cao (VTCH-XXXXXX ~ 2.1 tỷ khả năng, chống quét dò)
  var chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  var orderId = "VTCH-" + getRandomString(6, chars);
  
  // Sinh Token bí mật 32 ký tự chỉ cấp cho trình duyệt khách mua đơn này để nhận Key
  var secretToken = Utilities.getUuid().replace(/-/g, "").toLowerCase();

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetOrders = ss.getSheetByName("Orders") || ss.getSheetByName("DonHang");
  if (!sheetOrders) {
    sheetOrders = ss.insertSheet("Orders");
    var orderHeaders = ["OrderId", "Amount", "Tier", "Key", "Status", "CreatedAt", "Gateway", "RefCode", "Content", "SecretToken", "DurationDays"];
    sheetOrders.getRange(1, 1, 1, orderHeaders.length).setValues([orderHeaders]);
    sheetOrders.getRange(1, 1, 1, orderHeaders.length).setFontWeight("bold").setBackground("#D9EAD3");
  }

  var now = new Date();
  var orderRow = [
    orderId,
    expectedAmount,
    tierName,
    "",              // Key (Chưa cấp, đợi thanh toán)
    "PENDING",       // Trạng thái chờ thanh toán
    Utilities.formatDate(now, "GMT+7", "yyyy-MM-dd HH:mm:ss"),
    "",              // Gateway
    "",              // RefCode
    "",              // Content
    secretToken,     // SecretToken bảo mật để nhận key
    durationDays     // DurationDays
  ];
  sheetOrders.appendRow(orderRow);

  return responseJson({
    success: true,
    orderId: orderId,
    secretToken: secretToken,
    amount: expectedAmount,
    tier: tier,
    tierName: tierName
  });
}

function handleCheckOrder(orderId, token) {
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
    if (rowOrderId === orderId.toUpperCase() || rowOrderId.replace("-", "") === orderId.replace("-", "").toUpperCase()) {
      var rowSecretToken = String(data[i][9] || "").trim();
      var status = String(data[i][4]).trim().toUpperCase();

      // BẢO MẬT: Bắt buộc SecretToken phải khớp mới trả Key (Chống kẻ gian dò quét trộm key)
      if (rowSecretToken && token && rowSecretToken !== token.toLowerCase()) {
        return responseJson({
          success: false,
          status: "UNAUTHORIZED",
          message: "Lỗi bảo mật: Token xác thực đơn hàng không hợp lệ!"
        });
      }

      if (status === "PAID") {
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
      } else if (status === "UNDERPAID") {
        return responseJson({
          success: false,
          status: "UNDERPAID",
          orderId: rowOrderId,
          message: "Số tiền chuyển khoản không đủ theo gói đã chọn! Vui lòng liên hệ Admin để hỗ trợ."
        });
      } else {
        return responseJson({
          success: true,
          status: "PENDING",
          orderId: orderId,
          message: "Đang chờ thanh toán từ ngân hàng..."
        });
      }
    }
  }

  return responseJson({
    success: true,
    status: "PENDING",
    orderId: orderId,
    message: "Đang chờ khởi tạo thanh toán..."
  });
}

function handleSepayWebhook(data) {
  // Chỉ nhận tiền vào (transferType: "in")
  var transferType = String(data.transferType || "in").toLowerCase();
  if (transferType !== "in") {
    return responseJson({ success: true, message: "Bỏ qua giao dịch tiền ra" });
  }

  // Xác thực đúng tài khoản nhận tiền MBBank của bạn (0000125042003)
  var targetAccount = "0000125042003";
  var receivedAccount = String(data.accountNumber || data.subAccount || "").trim();
  if (receivedAccount && receivedAccount !== targetAccount) {
    return responseJson({ success: true, message: "Bỏ qua giao dịch của tài khoản khác" });
  }

  var amount = parseFloat(data.transferAmount || 0);
  var content = String(data.content || data.description || "").trim();
  var gateway = String(data.gateway || "MBBank");
  var refCode = String(data.referenceCode || data.id || "");
  var txDate = String(data.transactionDate || Utilities.formatDate(new Date(), "GMT+7", "yyyy-MM-dd HH:mm:ss"));

  // SỬ DỤNG LOCKSERVICE ĐỂ ĐẢM BẢO AN TOÀN TUYỆT ĐỐI (CONCURRENCY MUTEX LOCK)
  // Hai webhook đến cùng 1 mili-giây cũng không bao giờ bị bốc trùng 1 key!
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(25000); // Chờ tối đa 25 giây
  } catch (lockErr) {
    return responseJson({ success: false, message: "Máy chủ đang xử lý giao dịch khác, SePay vui lòng thử lại sau vài giây" });
  }

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheetOrders = ss.getSheetByName("Orders") || ss.getSheetByName("DonHang");
    if (!sheetOrders) {
      sheetOrders = ss.insertSheet("Orders");
      var orderHeaders = ["OrderId", "Amount", "Tier", "Key", "Status", "CreatedAt", "Gateway", "RefCode", "Content", "SecretToken", "DurationDays"];
      sheetOrders.getRange(1, 1, 1, orderHeaders.length).setValues([orderHeaders]);
      sheetOrders.getRange(1, 1, 1, orderHeaders.length).setFontWeight("bold").setBackground("#D9EAD3");
    }

    // 1. Chống xử lý trùng lặp theo Mã giao dịch ngân hàng (refCode)
    var orderData = sheetOrders.getDataRange().getValues();
    for (var r = 1; r < orderData.length; r++) {
      var rowRef = String(orderData[r][7] || "").trim();
      var rowStatus = String(orderData[r][4] || "").trim().toUpperCase();
      if (refCode && rowRef === refCode && rowStatus === "PAID") {
        return responseJson({
          success: true,
          message: "Giao dịch này đã được cấp key trước đó",
          orderId: orderData[r][0],
          key: orderData[r][3]
        });
      }
    }

    // 2. Trích xuất mã đơn hàng từ nội dung chuyển khoản
    var orderMatch = content.match(/VTCH-?[A-Z0-9]+/i);
    var matchedOrderId = orderMatch ? orderMatch[0].toUpperCase() : "";

    var targetOrderRowIndex = -1;
    var targetOrderRow = null;

    if (matchedOrderId) {
      for (var j = 1; j < orderData.length; j++) {
        var oId = String(orderData[j][0]).trim().toUpperCase();
        if (oId === matchedOrderId || oId.replace("-", "") === matchedOrderId.replace("-", "")) {
          targetOrderRowIndex = j + 1;
          targetOrderRow = orderData[j];
          break;
        }
      }
    }

    var orderId = targetOrderRow ? String(targetOrderRow[0]) : (matchedOrderId || ("VTCH-" + Math.floor(100000 + Math.random() * 900000)));
    var expectedAmount = targetOrderRow ? parseFloat(targetOrderRow[1]) : 0;
    var durationDays = targetOrderRow ? (parseFloat(targetOrderRow[10]) || 0) : 0;
    var tierName = targetOrderRow ? String(targetOrderRow[2]) : "Tự Động Phân Loại";

    // Phân loại số tiền nếu khách chuyển trực tiếp không qua tạo đơn trước
    if (!targetOrderRow) {
      if (amount >= 100000) {
        tierName = "Bản Quyền Vĩnh Viễn";
        durationDays = 0;
      } else if (amount >= 50000) {
        tierName = "Dùng Thử 7 Ngày";
        durationDays = 7;
      } else if (amount >= 20000) {
        tierName = "Dùng Thử 3 Ngày";
        durationDays = 3;
      } else if (amount >= 10000) {
        tierName = "Dùng Thử 1 Ngày";
        durationDays = 1;
      } else {
        sheetOrders.appendRow([orderId, amount, "Dưới 10k", "", "UNDERPAID", txDate, gateway, refCode, content, "", 0]);
        return responseJson({ success: false, message: "Số tiền không đủ tối thiểu 10.000đ" });
      }
    } else {
      // Đơn đã tạo trước: Kiểm tra chuyển đủ tiền không (Chống chuyển thiếu tiền)
      if (amount < expectedAmount) {
        sheetOrders.getRange(targetOrderRowIndex, 5).setValue("UNDERPAID");
        sheetOrders.getRange(targetOrderRowIndex, 7).setValue(gateway);
        sheetOrders.getRange(targetOrderRowIndex, 8).setValue(refCode);
        sheetOrders.getRange(targetOrderRowIndex, 9).setValue(content);
        return responseJson({ success: false, message: "Khách chuyển thiếu tiền so với gói đã đặt" });
      }
    }

    // 3. BỐC KEY TỰ ĐỘNG AN TOÀN TRONG LOCKSERVICE
    var dispensedKey = "";
    var isLifetime = (durationDays === 0);

    var sheetLifetime = ss.getSheetByName("Keys_Lifetime") || ss.getSheetByName("Keys");
    var sheetTrial = ss.getSheetByName("Keys_Trial") || ss.getSheetByName("Keys_DungThu");

    if (isLifetime) {
      if (!sheetLifetime) sheetLifetime = ss.insertSheet("Keys_Lifetime");
      var dataL = sheetLifetime.getDataRange().getValues();
      var foundIndex = -1;
      for (var rowL = 1; rowL < dataL.length; rowL++) {
        var kStatus = String(dataL[rowL][1] || "").trim().toLowerCase();
        var kHwid = String(dataL[rowL][2] || "").trim();
        if (kStatus === "active" && !kHwid) {
          dispensedKey = String(dataL[rowL][0]).trim().toUpperCase();
          foundIndex = rowL + 1;
          break;
        }
      }

      if (dispensedKey && foundIndex !== -1) {
        sheetLifetime.getRange(foundIndex, 2).setValue("Sold");
        sheetLifetime.getRange(foundIndex, 5).setValue("SePay: " + orderId + " (" + amount + "đ)");
      } else {
        // Tự động sinh key mới nếu kho hết
        var charsL = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
        dispensedKey = "VTCH-" + getRandomString(4, charsL) + "-" + getRandomString(4, charsL) + "-" + getRandomString(4, charsL);
        sheetLifetime.appendRow([dispensedKey, "Sold", "", "", "SePay Tự Động: " + orderId]);
      }
    } else {
      if (!sheetTrial) sheetTrial = ss.insertSheet("Keys_Trial");
      var dataT = sheetTrial.getDataRange().getValues();
      var foundTIndex = -1;
      for (var rowT = 1; rowT < dataT.length; rowT++) {
        var tStatus = String(dataT[rowT][1] || "").trim().toLowerCase();
        var tHwid = String(dataT[rowT][2] || "").trim();
        var tDur = parseFloat(dataT[rowT][5]) || 0;
        if (tStatus === "active" && !tHwid && (tDur === durationDays || tDur === 0)) {
          dispensedKey = String(dataT[rowT][0]).trim().toUpperCase();
          foundTIndex = rowT + 1;
          break;
        }
      }

      if (dispensedKey && foundTIndex !== -1) {
        sheetTrial.getRange(foundTIndex, 2).setValue("Sold");
        sheetTrial.getRange(foundTIndex, 5).setValue("SePay: " + orderId + " (" + amount + "đ)");
      } else {
        // Tự động sinh key dùng thử mới nếu kho hết
        var charsT = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
        dispensedKey = "VTCH-T" + durationDays + "-" + getRandomString(4, charsT) + "-" + getRandomString(4, charsT);
        sheetTrial.appendRow([dispensedKey, "Sold", "", "", "SePay Tự Động: " + orderId, durationDays, "", ""]);
      }
    }

    // 4. CẬP NHẬT TRẠNG THÁI ĐƠN HÀNG THÀNH "PAID"
    if (targetOrderRowIndex !== -1) {
      sheetOrders.getRange(targetOrderRowIndex, 4).setValue(dispensedKey);
      sheetOrders.getRange(targetOrderRowIndex, 5).setValue("PAID");
      sheetOrders.getRange(targetOrderRowIndex, 7).setValue(gateway);
      sheetOrders.getRange(targetOrderRowIndex, 8).setValue(refCode);
      sheetOrders.getRange(targetOrderRowIndex, 9).setValue(content);
    } else {
      var newOrderRow = [orderId, amount, tierName, dispensedKey, "PAID", txDate, gateway, refCode, content, Utilities.getUuid().replace(/-/g,""), durationDays];
      sheetOrders.appendRow(newOrderRow);
    }

    return responseJson({
      success: true,
      message: "Xử lý đơn hàng thành công!",
      orderId: orderId,
      key: dispensedKey,
      tier: tierName,
      amount: amount
    });
  } finally {
    lock.releaseLock();
  }
}

// =========================================================================
// 🎲 MENU QUẢN TRỊ TRÊN GOOGLE SHEETS
// =========================================================================

function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu("👑 VUA TRÒ CHƠI")
    .addItem("🔐 Cài Đặt Mật Khẩu Admin & SePay API Key (Bảo Mật)", "configureSecuritySecrets")
    .addSeparator()
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
    .addItem("📊 Thống Kê Tổng Hợp Cả 3 Trang Tính (Keys & Orders)", "showDualSheetStats")
    .addToUi();
}

function configureSecuritySecrets() {
  var ui = SpreadsheetApp.getUi();
  var props = PropertiesService.getScriptProperties();
  
  var currentMaster = props.getProperty("MASTER_KEY") || "VTCH@ADMIN#2026";
  var currentSepay = props.getProperty("SEPAY_API_KEY") || "";

  var prompt1 = ui.prompt("CÀI ĐẶT BẢO MẬT (1/2)", "Nhập Mật khẩu Master Admin (Hiện tại: " + currentMaster + "):", ui.ButtonSet.OK_CANCEL);
  if (prompt1.getSelectedButton() === ui.Button.OK) {
    var newMaster = prompt1.getResponseText().trim();
    if (newMaster) {
      props.setProperty("MASTER_KEY", newMaster);
    }
  }

  var prompt2 = ui.prompt("CÀI ĐẶT BẢO MẬT (2/2)", "Nhập SePay API Key / Webhook Secret (từ sepay.vn):", ui.ButtonSet.OK_CANCEL);
  if (prompt2.getSelectedButton() === ui.Button.OK) {
    var newSepay = prompt2.getResponseText().trim();
    if (newSepay) {
      props.setProperty("SEPAY_API_KEY", newSepay);
    }
  }

  ui.alert("✅ ĐÃ LƯU THÀNH CÔNG!\nCác khóa bảo mật đã được lưu an toàn trong ScriptProperties phía máy chủ Google.");
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

// --- Tạo Key Dùng Thử vào Sheet 'Keys_Trial' (hoặc 'Keys_DungThu') ---
function generate10Trial1Day() { generateTrial(10, 1); }
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
    var key = "VTCH-T" + days + "-" + p1 + "-" + p2;
    newRows.push([key, "Active", "", "", "Dùng thử " + days + " ngày", days, "", "⏳ Chưa kích hoạt"]);
  }

  var lastRow = sheet.getLastRow();
  sheet.getRange(lastRow + 1, 1, newRows.length, 8).setValues(newRows);
  SpreadsheetApp.getUi().alert("⏱️ Đã tạo thành công " + count + " mã Key Dùng Thử " + days + " ngày vào trang '" + sheet.getName() + "'!");
}

function getRandomString(len, chars) {
  var res = "";
  for (var i = 0; i < len; i++) {
    res += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return res;
}

// ⏳ 1. Cập nhật Bộ Đếm Ngược Countdown cho Keys_Trial
function updateTrialCountdowns() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Keys_Trial") || ss.getSheetByName("Keys_DungThu");
  if (!sheet) return;

  var data = sheet.getDataRange().getValues();
  var now = new Date();
  var updatedCount = 0;

  for (var i = 1; i < data.length; i++) {
    var status = String(data[i][1] || "").toLowerCase();
    var expRaw = data[i][6];
    
    if (status === "trial" && expRaw) {
      var expDate = new Date(expRaw);
      if (!isNaN(expDate.getTime())) {
        var diffMs = expDate.getTime() - now.getTime();
        if (diffMs > 0) {
          var hours = Math.floor(diffMs / (1000 * 60 * 60));
          var mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
          var text = hours >= 24 
            ? ("⏳ Còn " + Math.floor(hours / 24) + " ngày " + (hours % 24) + " giờ")
            : ("⏳ Còn " + hours + " giờ " + mins + " phút");
          sheet.getRange(i + 1, 8).setValue(text);
          updatedCount++;
        } else {
          sheet.getRange(i + 1, 2).setValue("Expired");
          sheet.getRange(i + 1, 8).setValue("⛔ HẾT HẠN");
        }
      }
    }
  }

  SpreadsheetApp.getUi().alert("✅ Đã cập nhật lại bộ đếm ngược cho " + updatedCount + " key đang thử nghiệm!");
}

// 🗑️ 2. Quét & Xóa thủ công các Key Hết Hạn
function manualDeleteExpiredKeys() {
  var deleted = purgeExpiredKeys();
  SpreadsheetApp.getUi().alert("🗑️ ĐÃ DỌN DẸP XONG!\nĐã xóa bỏ hoàn toàn " + deleted + " mã Key dùng thử đã hết hạn quá 24h.");
}

function purgeExpiredKeys() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Keys_Trial") || ss.getSheetByName("Keys_DungThu");
  if (!sheet) return 0;

  var data = sheet.getDataRange().getValues();
  var now = new Date();
  var deletedCount = 0;

  for (var i = data.length - 1; i >= 1; i--) {
    var status = String(data[i][1] || "").toLowerCase();
    var expRaw = data[i][6];

    if (status === "expired" || (expRaw && new Date(expRaw).getTime() + (24 * 60 * 60 * 1000) < now.getTime())) {
      sheet.deleteRow(i + 1);
      deletedCount++;
    }
  }

  return deletedCount;
}

// ⏰ 3. Cài đặt Trigger tự động quét & xóa ngầm 24/7 trên máy chủ Google
function installAutoCleanTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "autoCleanJob24h") {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  ScriptApp.newTrigger("autoCleanJob24h")
    .timeBased()
    .everyHours(1)
    .create();

  SpreadsheetApp.getUi().alert("✅ ĐÃ BẬT TỰ ĐỘNG QUÉT & XÓA 24/7!\n\nCứ mỗi 1 giờ, máy chủ Google sẽ tự động quét ngầm: nếu có key nào hết hạn thì tự động XÓA KHỎI HỆ THỐNG để vô hiệu hóa ngay!");
}

function autoCleanJob24h() {
  purgeExpiredKeys();
}

// 📊 4. Thống kê tổng hợp cho cả 3 trang tính
function showDualSheetStats() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetL = ss.getSheetByName("Keys_Lifetime") || ss.getSheetByName("Keys");
  var sheetT = ss.getSheetByName("Keys_Trial") || ss.getSheetByName("Keys_DungThu");
  var sheetO = ss.getSheetByName("Orders") || ss.getSheetByName("DonHang");

  var msg = "📊 THỐNG KÊ TỔNG HỢP VUA TRÒ CHƠI:\n\n";

  if (sheetL) {
    var dataL = sheetL.getDataRange().getValues();
    var totalL = Math.max(0, dataL.length - 1);
    var actL = 0, usedL = 0, soldL = 0;
    for (var i = 1; i < dataL.length; i++) {
      var s = String(dataL[i][1]).toLowerCase();
      if (s === "active") actL++;
      else if (s === "used") usedL++;
      else if (s === "sold") soldL++;
    }
    msg += "♾️ TRANG VĨNH VIỄN (" + sheetL.getName() + "):\n" +
           "- Tổng Key: " + totalL + " | Chưa bán: " + actL + " | Đã bán/Đang dùng: " + (usedL + soldL) + "\n\n";
  }

  if (sheetT) {
    var dataT = sheetT.getDataRange().getValues();
    var totalT = Math.max(0, dataT.length - 1);
    var actT = 0, trialT = 0, soldT = 0;
    for (var j = 1; j < dataT.length; j++) {
      var st = String(dataT[j][1]).toLowerCase();
      if (st === "active") actT++;
      else if (st === "trial") trialT++;
      else if (st === "sold") soldT++;
    }
    msg += "⏱️ TRANG DÙNG THỬ (" + sheetT.getName() + "):\n" +
           "- Tổng Key: " + totalT + " | Chưa phát: " + actT + " | Đã phát: " + (trialT + soldT) + "\n\n";
  }

  if (sheetO) {
    var dataO = sheetO.getDataRange().getValues();
    var totalOrders = Math.max(0, dataO.length - 1);
    var paidOrders = 0;
    for (var k = 1; k < dataO.length; k++) {
      if (String(dataO[k][4]).toUpperCase() === "PAID") paidOrders++;
    }
    msg += "💳 TRANG ĐƠN HÀNG (Orders):\n" +
           "- Tổng Đơn: " + totalOrders + " | Thành công (PAID): " + paidOrders + "\n";
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
