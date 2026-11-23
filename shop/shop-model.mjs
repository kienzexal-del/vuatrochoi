export const plans = [
  {id:'combo_31', name:'Gói Siêu Combo (31 Game Steam AAA)', price:100000, description:'Trọn bộ 31 Game Bom Tấn Steam trong 1 tài khoản, chơi vĩnh viễn.'},
  {id:'single_game', name:'Game Lẻ Steam Offline', price:50000, description:'Tài khoản riêng 1 game Steam Offline tự chọn, chơi vĩnh viễn.'},
  {id:'trial_1', name:'1 ngày', price:10000, description:'Trải nghiệm trước khi chọn gói dài hạn.'},
  {id:'trial_3', name:'3 ngày', price:20000, description:'Một cuối tuần dành cho những trận game.'},
  {id:'trial_7', name:'7 ngày', price:50000, description:'Thêm thời gian trải nghiệm trên thiết bị của bạn.'},
  {id:'lifetime', name:'Vĩnh viễn', price:100000, description:'Thanh toán một lần cho bản quyền vĩnh viễn.'}
];
export const money = value => new Intl.NumberFormat('vi-VN', {style:'currency', currency:'VND'}).format(value);
export const states = {PENDING:'Chờ thanh toán', PAID:'Đã thanh toán', UNDERPAID:'Cần hỗ trợ', EXPIRED:'Đã hết hạn', CANCELLED:'Đã hủy'};

export function getPlan(planId, amount) {
  const p = plans.find(p => p.id === planId || p.name === planId);
  if (p) return p;
  if (planId === 'combo_31' || (amount === 100000 && String(planId).includes('combo'))) {
    return {id:'combo_31', name:'Gói Siêu Combo (31 Game Steam AAA)', price:100000, description:'Trọn bộ 31 Game Bom Tấn Steam.'};
  }
  if (String(planId).startsWith('game_') || amount === 50000) {
    return {id:String(planId), name:'Game Lẻ Steam Offline', price:50000, description:'Tài khoản riêng 1 game Steam Offline.'};
  }
  return {id:String(planId||'lifetime'), name:'Bản quyền ' + (planId||''), price:amount||100000, description:''};
}

export function validOrder(value) {
  return !!value && typeof value.id === 'string' && /^[A-Z0-9-]{6,64}$/.test(value.id)
    && (plans.some(p => p.id === value.plan) || String(value.plan).startsWith('game_') || String(value.plan).includes('combo'))
    && Number.isSafeInteger(value.amount) && value.amount > 0
    && Object.hasOwn(states, value.status) && Number.isFinite(Date.parse(value.createdAt));
}
export function normalizeOrders(value) {
  if (!Array.isArray(value) || !value.every(validOrder)) throw new Error('Dữ liệu đơn hàng chưa hợp lệ. Vui lòng thử lại.');
  return [...value].sort((a,b) => Date.parse(b.createdAt)-Date.parse(a.createdAt));
}
export async function request(path, options = {}, fetcher = fetch) {
  const response = await fetcher(path, {...options, credentials:'same-origin', headers:{'Content-Type':'application/json', ...options.headers}});
  let result;
  try { result = await response.json(); } catch { throw new Error('Máy chủ chưa phản hồi đúng. Vui lòng thử lại.'); }
  if (!response.ok) {
    const error = new Error(response.status === 401 ? 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.' : 'Chưa thể hoàn tất yêu cầu. Vui lòng thử lại.');
    error.status = response.status;
    throw error;
  }
  return result;
}
