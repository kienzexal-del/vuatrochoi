// Cloudflare Pages Function: /api/sepay/webhook
// Listens to incoming bank transfers from SePay and marks orders as PAID

export async function onRequestPost(context) {
  const { request } = context;
  try {
    const payload = await request.json().catch(() => ({}));
    const { transferType, accountNumber, content, transferAmount } = payload || {};

    if (!transferType) {
      return new Response(JSON.stringify({ success: false, error: 'INVALID_TRANSFER_TYPE' }), { status: 400 });
    }
    if (transferType !== 'in') {
      return new Response(JSON.stringify({ success: false, message: 'Bỏ qua chuyển khoản không phải tiền vào' }), { status: 200 });
    }
    if (accountNumber !== '0000125042003') {
      return new Response(JSON.stringify({ success: false, error: 'INVALID_ACCOUNT' }), { status: 400 });
    }

    const match = String(content || '').match(/(VTCH(?:-[A-Z0-9]+)+)/i) || String(content || '').match(/(VTCH-?[A-Z0-9]+)/i);
    if (!match) {
      return new Response(JSON.stringify({ success: false, error: 'ORDER_NOT_FOUND_IN_CONTENT' }), { status: 400 });
    }

    const orderId = match[1].toUpperCase();
    return new Response(JSON.stringify({ success: true, orderId, message: 'Giao dịch đã xác nhận' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e.message }), { status: 500 });
  }
}
