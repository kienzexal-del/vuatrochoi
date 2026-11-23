import {GOOGLE_CLIENT_ID, googleClaims, googleProfile, readGoogleSession, requestGoogleSession, saveGoogleSession, subscribeGoogleSession} from './google-session.mjs';
import {plans,money,states,normalizeOrders,validOrder,request,getPlan} from './shop-model.mjs';
const $ = id => document.getElementById(id);
let user = null, selected = plans[0], orders = [], loading = true, creating = false, timer, revision = 0;
const el = (tag,text,cls) => {const node = document.createElement(tag); if(text !== undefined) node.textContent = text; if(cls) node.className = cls; return node;};
function button(text,action,cls='') {const b=el('button',text,cls); b.addEventListener('click',action); return b;}
function error(message) {$('alert').textContent=message; $('alert').hidden=!message;}
function toast(message) {$('toast').textContent=message; $('toast').hidden=false; setTimeout(()=>$('toast').hidden=true,3000);}
let gisReady = false, credential = '';
const signInSource = new URLSearchParams(location.search).get('signin');
let loginOpening = false;
async function login() {
  if (!$('demo').hidden) {
    location.assign(signInSource === 'catalog' ? '/auth/login?signin=catalog' : '/auth/login');
    return;
  }
  if (loginOpening || document.querySelector('.login-dialog[open]')) return;
  loginOpening = true;
  try {
    error('');
    await startGoogleSignIn();
  } catch {
    error('Chưa tải được đăng nhập Google. Hãy thử lại hoặc mở trang bằng Chrome hoặc Safari.');
    return;
  } finally {
    loginOpening = false;
  }
  const dialog = el('dialog', undefined, 'login-dialog');
  dialog.setAttribute('aria-label', 'Đăng nhập bằng Google');
  const slot = el('div', undefined, 'google-button');
  dialog.append(
    el('h2', 'Đăng nhập bằng Google'),
    slot,
    el('p', 'Nếu mở từ Telegram hoặc ứng dụng khác, hãy mở trang bằng Safari hoặc Chrome rồi thử lại.', 'fine'),
    button('Đóng', () => dialog.close(), 'wide')
  );
  dialog.addEventListener('close', () => dialog.remove(), {once:true});
  document.body.append(dialog);
  dialog.showModal();
  google.accounts.id.renderButton(slot, {
    theme:'outline', size:'large', text:'signin_with', locale:'vi',
    width:Math.min(360, Math.floor(slot.getBoundingClientRect().width))
  });
}
const API_URL = 'https://script.google.com/macros/s/AKfycbzsJ4SvFtnCRROeB3SZHNcq65oReT-wlBQJlwF9eG4WUsDI9cJT4JuXLLuH9Y6TYZdRJg/exec';
const BANK_CONFIG = { bank: 'MB', account: '0000125042003', name: 'NGUYEN VAN KIEN' };
const SAVED_ORDERS_KEY = 'vtch_saved_orders';

function safeOrder(o) {
  if (!o || typeof o !== 'object') return null;
  const id = typeof o.id === 'string' ? o.id : (typeof o.orderId === 'string' ? o.orderId : '');
  if (!/^[A-Z0-9-]{6,64}$/.test(id)) return null;
  const matchedPlan = getPlan(o.plan || o.tier, o.amount);
  const plan = matchedPlan ? matchedPlan.id : 'lifetime';
  const amount = Number.isSafeInteger(o.amount) && o.amount > 0 ? o.amount : (matchedPlan ? matchedPlan.price : 100000);
  const status = Object.hasOwn(states, o.status) ? o.status : 'PENDING';
  const createdAt = Number.isFinite(Date.parse(o.createdAt)) ? o.createdAt : new Date().toISOString();
  return {
    id,
    plan,
    amount,
    status,
    createdAt,
    key: typeof o.key === 'string' ? o.key : '',
    secretToken: typeof o.secretToken === 'string' ? o.secretToken : (localStorage.getItem(`vtch_token_${id}`) || ''),
    payment: o.payment || BANK_CONFIG
  };
}

function getSavedOrders() {
  try {
    const raw = localStorage.getItem(SAVED_ORDERS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return (Array.isArray(list) ? list : []).map(safeOrder).filter(Boolean);
  } catch {
    return [];
  }
}

function syncSavedOrders(list) {
  try {
    const sanitized = (Array.isArray(list) ? list : []).map(safeOrder).filter(Boolean);
    localStorage.setItem(SAVED_ORDERS_KEY, JSON.stringify(sanitized));
  } catch {}
}

function saveSavedOrder(order, secretToken = '') {
  try {
    const safe = safeOrder(order);
    if (!safe) return;
    if (secretToken) safe.secretToken = secretToken;
    const list = getSavedOrders();
    const index = list.findIndex(o => o.id === safe.id);
    if (index >= 0) {
      list[index] = {
        ...list[index],
        ...safe,
        key: safe.key || list[index].key || '',
        secretToken: safe.secretToken || list[index].secretToken || ''
      };
    } else {
      list.unshift(safe);
    }
    syncSavedOrders(list);
  } catch {}
}

function mergeOrders(apiOrders = [], localOrders = []) {
  const map = new Map();
  for (const raw of localOrders) {
    const o = safeOrder(raw);
    if (o) map.set(o.id, o);
  }
  for (const raw of apiOrders) {
    const o = safeOrder(raw);
    if (!o) continue;
    const existing = map.get(o.id);
    if (existing) {
      map.set(o.id, {
        ...existing,
        ...o,
        key: o.key || existing.key || '',
        secretToken: existing.secretToken || o.secretToken || ''
      });
    } else {
      map.set(o.id, o);
    }
  }
  const merged = Array.from(map.values());
  merged.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return merged;
}

async function refreshLocalOrders(localList) {
  const list = (Array.isArray(localList) ? localList : []).map(safeOrder).filter(Boolean);
  await Promise.allSettled(list.map(async item => {
    const token = item.secretToken || localStorage.getItem(`vtch_token_${item.id}`) || '';
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}?action=check_order&orderId=${encodeURIComponent(item.id)}&token=${encodeURIComponent(token)}`, {
        signal: AbortSignal.timeout(5000)
      });
      const data = await res.json();
      if (data && (data.status === 'PAID' || data.status === 'PENDING' || data.status === 'UNDERPAID')) {
        item.status = data.status;
        if (data.key) item.key = data.key;
        if (data.amount && Number.isSafeInteger(data.amount)) item.amount = data.amount;
        if (data.tier) {
          const matched = plans.find(p => p.id === data.tier || p.name === data.tier);
          if (matched) item.plan = matched.id;
        }
      }
    } catch {}
  }));
  syncSavedOrders(list);
  return list;
}

async function directGasRequest(action, fields = {}) {
  if (action === 'me') {
    const payload = googleClaims(credential);
    return { user: { name: payload ? (payload.name || payload.email.split('@')[0]) : 'Tài khoản Google' } };
  }

  if (action === 'list') {
    const res = await fetch(`${API_URL}?action=my_orders&id_token=${encodeURIComponent(credential)}`);
    const data = await res.json();
    if (!data || !data.success) throw new Error(data?.message || 'Không thể tải danh sách đơn.');
    const orders = (data.orders || []).map(o => ({
      id: o.orderId,
      plan: plans.find(p => p.id === o.tier || p.name === o.tier || p.price === o.amount)?.id || 'lifetime',
      amount: o.amount,
      status: o.status,
      createdAt: o.createdAt || new Date().toISOString(),
      key: o.key || ''
    }));
    return { orders };
  }

  if (action === 'create') {
    const plan = plans.find(p => p.id === fields.plan) || selected;
    const res = await fetch(`${API_URL}?action=create_order&tier=${encodeURIComponent(plan.id)}&amount=${plan.price}&id_token=${encodeURIComponent(credential)}`);
    const data = await res.json();
    if (!data || !data.success) throw new Error(data?.message || 'Không thể tạo đơn hàng.');
    const order = {
      id: data.orderId,
      plan: plan.id,
      amount: plan.price,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
      payment: BANK_CONFIG
    };
    try {
      localStorage.setItem(`vtch_token_${data.orderId}`, data.secretToken);
      saveSavedOrder(order, data.secretToken);
    } catch(e) {}
    return { order };
  }

  if (action === 'detail') {
    const orderId = fields.orderId;
    let token = '';
    try {
      token = localStorage.getItem(`vtch_token_${orderId}`) || '';
    } catch(e) {}
    if (!token) {
      const local = getSavedOrders().find(o => o.id === orderId);
      if (local?.secretToken) token = local.secretToken;
    }

    let order = null;
    if (token) {
      try {
        const res = await fetch(`${API_URL}?action=check_order&orderId=${encodeURIComponent(orderId)}&token=${encodeURIComponent(token)}`);
        const data = await res.json();
        if (data && (data.status === 'PAID' || data.status === 'PENDING' || data.status === 'UNDERPAID')) {
          order = {
            id: orderId,
            plan: plans.find(p => p.price === data.amount || p.name === data.tier)?.id || selected.id,
            amount: data.amount || selected.price,
            status: data.status,
            createdAt: new Date().toISOString(),
            key: data.key || '',
            payment: BANK_CONFIG
          };
          saveSavedOrder(order, token);
        }
      } catch(e) {}
    }

    if (!order && credential) {
      try {
        const res = await fetch(`${API_URL}?action=my_orders&id_token=${encodeURIComponent(credential)}`);
        const data = await res.json();
        if (data && data.success && Array.isArray(data.orders)) {
          const found = data.orders.find(o => o.orderId === orderId);
          if (found) {
            order = {
              id: found.orderId,
              plan: plans.find(p => p.id === found.tier || p.name === found.tier || p.price === found.amount)?.id || 'lifetime',
              amount: found.amount,
              status: found.status,
              createdAt: found.createdAt || new Date().toISOString(),
              key: found.key || '',
              payment: BANK_CONFIG
            };
            saveSavedOrder(order);
          }
        }
      } catch(e) {}
    }

    if (!order) {
      const saved = getSavedOrders().find(o => o.id === orderId);
      if (saved) {
        order = safeOrder(saved);
      }
    }

    if (!order) throw new Error('Không tìm thấy đơn hàng.');
    return { order };
  }

  throw new Error('Hành động không hợp lệ');
}

async function accountRequest(action, fields = {}) {
  if (!googleProfile(credential)) {
    credential = '';
    user = null;
    orders = [];
    saveGoogleSession('');
    account();
    route();
    throw new Error('Yêu cầu đăng nhập tài khoản');
  }
  try {
    return await request('/api/shop-account', {
      method:'POST', body:JSON.stringify({action, credential, ...fields})
    });
  } catch (err) {
    return await directGasRequest(action, fields);
  }
}
async function copy(value) {try {await navigator.clipboard.writeText(value); toast('Đã sao chép.');} catch {toast('Chưa sao chép được. Bạn có thể chọn và sao chép nội dung trực tiếp.');}}
function userIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(svg.namespaceURI, 'path');
  path.setAttribute('d', 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m12-13a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z');
  svg.append(path);
  return svg;
}
function googleAvatar(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && /^lh\d+\.googleusercontent\.com$/.test(url.hostname) ? url.href : '';
  } catch { return ''; }
}
function account() {
  $('account').replaceChildren();
  if(user) {
    const menu = el('details', undefined, 'profile-menu');
    const trigger = el('summary', undefined, 'profile-trigger');
    trigger.setAttribute('aria-label', 'Menu tài khoản');
    trigger.append(userIcon());
    const avatar = googleAvatar(user.picture);
    if(avatar) {
      const photo = el('img');
      photo.alt = '';
      photo.referrerPolicy = 'no-referrer';
      photo.addEventListener('load', () => trigger.replaceChildren(photo), {once:true});
      photo.src = avatar;
    }
    const panel = el('div', undefined, 'profile-panel');
    const historyLink = el('a','Đơn hàng của tôi');
    historyLink.href = '#orders';
    historyLink.addEventListener('click', () => {menu.open=false;});
    panel.append(historyLink,button('Đăng xuất',async()=>{
    try {
      if(credential) {
        credential='';
        saveGoogleSession('');
        window.google?.accounts?.id?.disableAutoSelect();
      }
      else await request('/api/logout',{method:'POST'});
      user=null;orders=[];clearTimeout(timer);revision++;account();location.hash='shop';route();
    }
    catch(e){error(e.message);}
    }));
    menu.append(trigger,panel);
    $('account').append(menu);
  } else {
    const signIn = button('Đăng nhập',login,'profile-login');
    signIn.prepend(userIcon());
    $('account').append(signIn);
  }
  $('buy').textContent=creating?'Đang tạo đơn…':user?'Tiếp tục thanh toán':'Đăng nhập để mua';
  $('buy').disabled=loading||creating;
  $('buy-note').textContent=user?'Đơn hàng được lưu trong tài khoản này. Bạn có thể quay lại bất cứ lúc nào.':'Đăng nhập để giữ đơn hàng và xem lại key trên các thiết bị của bạn.';
}
function select(plan) {
  selected=plan;
  for(const node of $('plans').children) {const active=node.dataset.plan===plan.id;node.classList.toggle('selected',active);node.setAttribute('aria-pressed',String(active));}
  $('selected-name').textContent=plan.name;$('selected-price').textContent=money(plan.price);
}

function renderGameCheckoutCard(info) {
  const introH1 = document.querySelector('#shop-view .intro h1');
  if (introH1) introH1.textContent = 'Thanh toán tài khoản Steam Offline';
  const introP = document.querySelector('#shop-view .intro p');
  if (introP) introP.textContent = 'Nhận tài khoản, mật khẩu & mã Steam Guard tự động ngay sau khi thanh toán.';

  const plansBox = $('plans');
  plansBox.replaceChildren();

  const card = el('div', undefined, 'game-checkout-card');
  if (info.banner) {
    const img = el('img', undefined, 'game-checkout-cover');
    img.src = info.banner;
    img.alt = info.title;
    card.append(img);
  }
  const badge = el('span', info.badge, info.banner ? 'game-checkout-badge single' : 'game-checkout-badge');
  const title = el('h2', info.title, 'game-checkout-title');
  const priceRow = el('div', undefined, 'game-checkout-price-row');
  priceRow.append(
    el('span', money(info.price), 'game-checkout-price'),
    el('span', money(info.origPrice), 'game-checkout-orig'),
    el('span', info.discount, 'hero-discount')
  );
  const featBox = el('div', undefined, 'game-checkout-features');
  for (const f of info.features) {
    featBox.append(el('div', '✓ ' + f));
  }
  const back = el('a', '← Xem danh mục game khác', 'game-checkout-back');
  back.href = '/games/';
  card.append(badge, title, priceRow, featBox, back);
  plansBox.append(card);

  $('selected-name').textContent = selected.name;
  $('selected-price').textContent = money(selected.price);
  $('buy').textContent = creating ? 'Đang tạo đơn…' : (user ? 'Tiếp tục thanh toán' : 'Đăng nhập để mua');
}

function renderStandardPlans() {
  const plansBox = $('plans');
  plansBox.replaceChildren();
  for(const plan of plans) {
    const b=button('',()=>select(plan),'plan');b.dataset.plan=plan.id;
    const radio=el('span',undefined,'radio');radio.setAttribute('aria-hidden','true');
    const name=el('span');const strong=el('strong',plan.name);
    if(plan.id==='lifetime'||plan.id==='combo_31') strong.append(el('span','Thanh toán một lần','plan-tag'));
    name.append(strong,el('small',plan.description));b.append(radio,name,el('span',money(plan.price),'price'));plansBox.append(b);
  }
  select(selected);
}

async function initShop() {
  const searchParams = new URLSearchParams(location.search);
  const itemParam = searchParams.get('item');
  const gameParam = searchParams.get('game');

  if (itemParam === 'combo_31' || itemParam === 'combo') {
    selected = {
      id: 'combo_31',
      name: 'Gói Siêu Combo (Trọn Bộ 31 Game Steam AAA)',
      price: 100000,
      isGame: true,
      type: 'combo'
    };
    renderGameCheckoutCard({
      badge: 'TRỌN BỘ 31 GAME BOM TẤN • TIẾT KIỆM 93%',
      title: 'Gói Siêu Combo (Trọn Bộ 31 Game Bom Tấn Steam)',
      price: 100000,
      origPrice: 1550000,
      discount: '-93%',
      features: [
        'Sở hữu vĩnh viễn 1 tài khoản Steam Offline trọn bộ 31 Game AAA (Black Myth: Wukong, Baldur\'s Gate 3, Elden Ring, The Last of Us I & II, Cyberpunk 2077...).',
        'Chơi offline không giới hạn thời gian, lưu save game trên máy của bạn.',
        'Tải game trực tiếp tốc độ cao từ máy chủ Steam chính hãng.',
        'Tự động cấp tài khoản, mật khẩu và mã Steam Guard 24/7.',
        'Bảo hành 1 đổi 1 và hỗ trợ trọn đời.'
      ]
    });
    return;
  }

  if (gameParam) {
    let gameTitle = 'Game Lẻ Steam Offline';
    let gameBanner = '';
    try {
      const res = await fetch('/games/games.json');
      if (res.ok) {
        const list = await res.json();
        const found = list.find(g => String(g.id) === String(gameParam));
        if (found) {
          gameTitle = found.name;
          gameBanner = found.banner;
        }
      }
    } catch(e) {}

    selected = {
      id: `game_${gameParam}`,
      name: `Tài khoản Steam: ${gameTitle}`,
      price: 50000,
      isGame: true,
      gameId: gameParam,
      gameTitle,
      banner: gameBanner
    };

    renderGameCheckoutCard({
      badge: 'TÀI KHOẢN STEAM OFFLINE CHÍNH HÃNG • 50.000đ',
      title: `Tài khoản Steam: ${gameTitle}`,
      banner: gameBanner,
      price: 50000,
      origPrice: 1200000,
      discount: '-95%',
      features: [
        `1 tài khoản Steam riêng chơi game ${gameTitle} vĩnh viễn.`,
        'Chơi offline không giới hạn thời gian, lưu save game trên máy của bạn.',
        'Tải game trực tiếp tốc độ cao từ máy chủ Steam chính hãng.',
        'Tự động cấp tài khoản, mật khẩu và mã Steam Guard 24/7.',
        'Bảo hành 1 đổi 1 và hỗ trợ trọn đời.'
      ]
    });
    return;
  }

  renderStandardPlans();
}
initShop();

function empty(title,description,action,label) {const box=el('div',undefined,'empty');box.append(el('h2',title),el('p',description));if(action)box.append(button(label,action,'primary'));return box;}
function showOrders() {
  const list=$('orders');list.replaceChildren();
  if(!orders.length){list.append(empty('Chưa có đơn hàng','Khi bạn mua bản quyền, đơn hàng sẽ xuất hiện tại đây.',()=>location.hash='shop','Chọn gói bản quyền'));return;}
  const container=el('div',undefined,'orders');
  for(const order of orders) {
    const row=el('article',undefined,'order');const name=el('div');name.append(el('h3',getPlan(order.plan, order.amount).name),el('small',order.id));
    const status=el('div');status.append(el('span',states[order.status],`badge ${order.status}`),el('small',new Date(order.createdAt).toLocaleString('vi-VN')));
    row.append(name,status,el('strong',money(order.amount),'order-amount'),button(order.status==='PAID'?'Xem key':'Xem đơn',()=>location.hash=`order/${order.id}`));container.append(row);
  }
  list.append(container);
}
async function loadOrders() {
  const version = revision;
  $('orders').replaceChildren(el('p', 'Đang tải đơn hàng…', 'loading'));
  $('refresh').disabled = true;

  try {
    let apiOrders = [];
    if (credential) {
      try {
        const result = await accountRequest('list');
        apiOrders = result.orders || [];
      } catch (err) {
        // Quietly fallback to local orders without displaying warning
      }
    } else {
      try {
        const result = await request('/api/orders');
        apiOrders = result.orders || [];
      } catch (err) {
        // Quietly fallback
      }
    }

    if (version !== revision) return;

    let localOrders = getSavedOrders();
    if (localOrders.some(o => o.status !== 'PAID' || !o.key)) {
      localOrders = await refreshLocalOrders(localOrders);
    }
    if (version !== revision) return;

    const merged = mergeOrders(apiOrders, localOrders);
    syncSavedOrders(merged);
    orders = normalizeOrders(merged);
    showOrders();
    error('');
  } catch (e) {
    if (version !== revision) return;
    let localOrders = getSavedOrders();
    if (localOrders.length > 0) {
      localOrders = await refreshLocalOrders(localOrders);
      if (version !== revision) return;
      orders = normalizeOrders(localOrders);
      showOrders();
    } else {
      showOrders();
    }
  } finally {
    $('refresh').disabled = false;
  }
}
function displayOrder(order) {
  if (order?.id) saveSavedOrder(order);
  const planInfo = getPlan(order.plan, order.amount);
  const isGameOrder = order.plan === 'combo_31' || String(order.plan).startsWith('game_') || order.amount === 50000 || (order.amount === 100000 && String(order.plan).includes('combo'));
  const box=$('detail');box.replaceChildren();box.append(el('span',states[order.status],`badge ${order.status}`),el('h2',planInfo.name),el('p',`Mã đơn: ${order.id}`,'muted'));
  if(order.status==='PAID') {
    if(typeof order.key!=='string'||!order.key){box.append(el('p', isGameOrder ? 'Thanh toán đã xác nhận. Tài khoản Steam đang được cấp; hãy kiểm tra lại sau ít phút.' : 'Thanh toán đã xác nhận. Key đang được xử lý; hãy kiểm tra lại sau ít phút.'));}
    else {box.append(el('p', isGameOrder ? 'Tài khoản & mã Steam Guard của bạn:' : 'Key của bạn được lưu tại đây. Chỉ chia sẻ với người bạn tin tưởng.'),el('code',order.key,'key'),button(isGameOrder ? 'Sao chép thông tin' : 'Sao chép key',()=>copy(order.key),'primary'));}
  } else if(order.status==='PENDING') {
    const bank=order.payment;
    if(!bank||typeof bank.account!=='string'||!/^\d{6,30}$/.test(bank.account)||typeof bank.bank!=='string'||!/^[A-Za-z0-9]{2,20}$/.test(bank.bank)||typeof bank.name!=='string') {
      box.append(el('p','Chưa lấy được thông tin thanh toán. Vui lòng kiểm tra lại đơn.'));return;
    }
    const grid=el('div',undefined,'payment-grid');
    if(!order.demo) {
      const img=el('img',undefined,'qr');img.alt=`Mã QR thanh toán đơn ${order.id}`;
      img.src=`https://img.vietqr.io/image/${encodeURIComponent(bank.bank)}-${encodeURIComponent(bank.account)}-compact2.png?amount=${order.amount}&addInfo=${encodeURIComponent(order.id)}&accountName=${encodeURIComponent(bank.name)}`;
      img.addEventListener('error',()=>{img.hidden=true;toast('Không tải được QR. Thông tin chuyển khoản vẫn ở bên dưới.');});grid.append(img);
    } else grid.append(el('div','QR minh họa đã tắt để tránh chuyển nhầm tiền.','notice'));
    const rows=el('div');
    for(const [label,value] of [['Ngân hàng',bank.bank],['Chủ tài khoản',bank.name],['Số tài khoản',bank.account],['Số tiền',money(order.amount)],['Nội dung chuyển khoản',order.id]]) {const row=el('div',undefined,'bank-row');row.append(el('small',label),el('strong',value));rows.append(row);}
    grid.append(rows);box.append(grid,button('Sao chép nội dung chuyển khoản',()=>copy(order.id)),el('p','Chuyển đúng số tiền và nội dung. Bạn có thể đóng trang này rồi quay lại từ “Đơn hàng của tôi”.','fine'));
  } else {box.append(el('p',order.status==='UNDERPAID'?'Số tiền chưa đủ theo đơn. Giữ mã đơn và biên lai để nhờ shop đối soát; không thanh toán lại toàn bộ.':'Đơn này không còn chờ thanh toán. Nếu bạn đã chuyển tiền, giữ mã đơn và biên lai để nhờ shop đối soát.'));}
  const actions=el('div',undefined,'detail-actions');actions.append(button('Kiểm tra thanh toán',()=>loadDetail(order.id)));box.append(actions);
}
async function loadDetail(id,quiet=false) {
  clearTimeout(timer); const version=revision;
  if(!quiet)$('detail').replaceChildren(el('p','Đang tải đơn hàng…','loading'));
  try {
    const result=await (credential ? accountRequest('detail',{orderId:id}) : request(`/api/orders/${encodeURIComponent(id)}`));
    if(version!==revision||location.hash!==`#order/${id}`)return;
    if(!validOrder(result.order))throw new Error('Dữ liệu đơn hàng chưa hợp lệ. Vui lòng thử lại.');
    displayOrder(result.order);error('');
    if(result.order.status==='PENDING')timer=setTimeout(()=>loadDetail(id,true),5000);
  } catch(e) {
    if(version!==revision)return;
    if(!quiet)$('detail').replaceChildren(empty('Chưa mở được đơn hàng',e.message,()=>loadDetail(id),'Thử lại'));
    else error('Tạm mất kết nối kiểm tra thanh toán. Đơn hàng vẫn được giữ; bấm “Kiểm tra thanh toán” để thử lại.');
  }
}
function route() {
  revision++;clearTimeout(timer);error('');
  const hash=location.hash.slice(1)||'shop';const detail=/^order\/[A-Z0-9-]{6,64}$/.test(hash);
  const view=hash==='orders'?'orders':detail?'detail':'shop';
  for(const name of ['shop','orders','detail'])$(`${name}-view`).hidden=name!==view;
  const shopLink = document.querySelector('#site-menu a[href="/buy#shop"]');
  shopLink?.setAttribute('aria-current', hash === 'shop' ? 'page' : 'false');
  if(view==='shop')return;
  if(loading){$(view==='orders'?'orders':'detail').replaceChildren(el('p','Đang kiểm tra phiên đăng nhập…','loading'));return;}
  if(!user){$(view==='orders'?'orders':'detail').replaceChildren(empty('Đơn hàng đi cùng tài khoản','Đăng nhập bằng tài khoản đã dùng để mua. Bạn có thể xem lại đơn và key trên thiết bị này.',login,'Đăng nhập'));return;}
  if(view==='orders')loadOrders();else loadDetail(hash.slice(6));
}
$('buy').addEventListener('click',async()=>{
  if(!user){login();return;}if(creating)return;
  creating=true;account();error('');
  try {
    const requestId=crypto.randomUUID();
    const result=await (credential ? accountRequest('create',{plan:selected.id,requestId}) :
      request('/api/orders',{method:'POST',headers:{'Idempotency-Key':requestId},body:JSON.stringify({plan:selected.id})}));
    if(!validOrder(result.order))throw new Error('Chưa xác nhận được đơn hàng. Hãy xem “Đơn hàng của tôi” trước khi thử mua lại.');
    location.hash=`order/${result.order.id}`;
  }catch(e){error(`${e.message} Bạn có thể kiểm tra “Đơn hàng của tôi” trước khi tạo đơn khác.`);}
  finally {creating=false;account();}
});
$('refresh').addEventListener('click',loadOrders);
$('back').addEventListener('click',()=>location.hash='orders');
window.addEventListener('hashchange', () => {
  route();
  if (location.hash === '#mobile-install') location.replace('/mobile/');
  else window.scrollTo({top: 0, behavior: 'instant'});
});
route();
async function startGoogleSignIn() {
  if (gisReady) return;
  if (!window.google?.accounts?.id) {
    await new Promise((resolve, reject) => {
      const script = el('script');
      const timeout = setTimeout(() => fail(), 8000);
      function fail() {
        clearTimeout(timeout);
        script.remove();
        reject(new Error('Google SDK unavailable'));
      }
      script.src = 'https://accounts.google.com/gsi/client';
      script.onload = () => {
        clearTimeout(timeout);
        resolve();
      };
      script.onerror = fail;
      document.head.append(script);
    });
  }
  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: async result => {
      try {
        credential = result.credential;
        const profile = (await accountRequest('me')).user;
        user = {...profile, picture: profile?.picture || googleClaims(credential)?.picture};
        saveGoogleSession(credential);
        document.querySelector('.login-dialog[open]')?.close();
        if (signInSource === 'catalog') {
          location.replace('/games/');
          return;
        }
        account();
        route();
      } catch {
        credential = '';
        saveGoogleSession('');
        error('Không xác nhận được tài khoản Google. Vui lòng thử lại.');
      }
    }
  });
  gisReady = true;
}

if (['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) {
  try {
    const options = {signal: AbortSignal.timeout(2000)};
    if ((await request('/api/shop-config', options)).demo) {
      $('demo').hidden = false;
      user = (await request('/api/me', options)).user;
    }
  } catch {
    // A local static preview can still display the store.
  }
}
if ($('demo').hidden) {
  credential = readGoogleSession();
  user = googleProfile(credential);
  subscribeGoogleSession(value => {
    credential = value;
    user = googleProfile(value);
    orders = [];
    if (user) document.querySelector('.login-dialog[open]')?.close();
    if (user && signInSource === 'catalog') {
      location.replace('/games/');
      return;
    }
    account();
    route();
  });
  requestGoogleSession();
}
loading = false;
account();
route();
if (signInSource === 'catalog' && user) location.replace('/games/');
else if (!user && (signInSource === 'catalog' || signInSource === '1')) void login();
