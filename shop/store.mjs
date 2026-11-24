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
    } catch(e) {}
    return { order };
  }

  if (action === 'detail') {
    const result = await directGasRequest('list');
    const order = result.orders.find(item => item.id === fields.orderId);
    if (!order) throw new Error('Không tìm thấy đơn hàng trong tài khoản này.');
    return {order: {...order, payment: BANK_CONFIG}};
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
  updateCheckoutSummary();
}

function updateCheckoutSummary() {
  if (!selected) return;
  const titleEl = $('checkout-sidebar-title');
  if (titleEl) titleEl.textContent = 'Gói của bạn';
  const labelName = $('label-selected-name');
  if (labelName) labelName.textContent = 'Thời hạn';
  if ($('selected-name')) $('selected-name').textContent = selected.name;
  const labelQty = $('label-selected-qty');
  if (labelQty) labelQty.textContent = 'Số lượng';
  const valQty = $('selected-qty');
  if (valQty) valQty.textContent = '1 bản quyền';
  const rowDuration = $('row-selected-duration');
  if (rowDuration) rowDuration.hidden = true;
  const buyNote = $('buy-note');
  if (buyNote) buyNote.textContent = user ? 'Đơn hàng được lưu trong tài khoản này. Bạn có thể quay lại bất cứ lúc nào.' : 'Đăng nhập để giữ đơn hàng và xem lại key trên các thiết bị của bạn.';

  if ($('selected-price')) $('selected-price').textContent = money(selected.price);
  if ($('buy')) $('buy').textContent = creating ? 'Đang tạo đơn…' : (user ? 'Tiếp tục thanh toán' : 'Đăng nhập để mua');
}

function select(plan) {
  selected=plan;
  for(const node of $('plans').children) {const active=node.dataset.plan===plan.id;node.classList.toggle('selected',active);node.setAttribute('aria-pressed',String(active));}
  updateCheckoutSummary();
}

function renderStandardPlans() {
  const plansBox = $('plans');
  plansBox.replaceChildren();
  for(const plan of plans) {
    const b=button('',()=>select(plan),'plan');b.dataset.plan=plan.id;
    const radio=el('span',undefined,'radio');radio.setAttribute('aria-hidden','true');
    const name=el('span');const strong=el('strong',plan.name);
    if(plan.id==='lifetime') strong.append(el('span','Thanh toán một lần','plan-tag'));
    name.append(strong,el('small',plan.description));b.append(radio,name,el('span',money(plan.price),'price'));plansBox.append(b);
  }
  select(selected);
}

async function initShop() {
  const searchParams = new URLSearchParams(location.search);
  const itemParam = searchParams.get('item');
  const gameParam = searchParams.get('game');

  if (itemParam === 'combo_31' || itemParam === 'combo') {
    location.replace('/games/');
    return;
  }
  if (gameParam) {
    location.replace('/games/#game/' + encodeURIComponent(gameParam));
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
    const row=el('article',undefined,'order');const name=el('div');name.append(el('h3',order.title || getPlan(order.plan, order.amount).name),el('small',order.id));
    const status=el('div');status.append(el('span',states[order.status],`badge ${order.status}`),el('small',new Date(order.createdAt).toLocaleString('vi-VN')));
    row.append(name,status,el('strong',money(order.amount),'order-amount'),button(order.status==='PAID'?'Xem key':'Xem đơn',()=>location.hash=`order/${order.id}`));container.append(row);
  }
  list.append(container);
}
async function steamRequest(path, fields = {}) {
  return request('/api/steam/' + path, {
    method: 'POST', headers: {Authorization: 'Bearer ' + readGoogleSession()},
    body: JSON.stringify(fields)
  });
}
async function loadOrders() {
  const version = revision;
  $('orders').replaceChildren(el('p', 'Đang tải đơn hàng…', 'loading'));
  $('refresh').disabled = true;
  try {
    const results = await Promise.allSettled([
      accountRequest('list'), steamRequest('orders')
    ]);
    if (version !== revision) return;
    const failures = results.filter(result => result.status === 'rejected');
    if (failures.length === results.length) throw failures[0].reason;
    orders = normalizeOrders(results.flatMap(result => result.status === 'fulfilled' ? result.value.orders || [] : []));
    showOrders();
    error(failures.length ? 'Chưa tải đủ lịch sử từ máy chủ. Vui lòng làm mới hoặc đăng nhập lại.' : '');
  } catch (e) {
    if (version !== revision) return;
    orders = [];
    $('orders').replaceChildren(empty('Chưa tải được lịch sử', e.message, loadOrders, 'Thử lại'));
    error(e.message);
  } finally {
    $('refresh').disabled = false;
  }
}
function displayOrder(order) {
  const planInfo = getPlan(order.plan, order.amount);
  const isGameOrder = order.plan === 'combo_31' || String(order.plan).startsWith('game_') || order.amount === 50000 || (order.amount === 100000 && String(order.plan).includes('combo'));
  const box=$('detail');box.replaceChildren();box.append(el('span',states[order.status],`badge ${order.status}`),el('h2',planInfo.name),el('p',`Mã đơn: ${order.id}`,'muted'));
  if(order.status==='PAID') {
    const isGame = isGameOrder || Boolean(order.account && order.password) || Boolean(order.slotId);
    if (isGame && (order.account || order.key)) {
      box.append(el('p', 'Tài khoản & mã đăng nhập Steam Guard của bạn:', 'credential-intro'));

      // Steam Account & Password Box
      const credCard = el('div', undefined, 'steam-credentials-card');

      // Account row
      const accRow = el('div', undefined, 'credential-row');
      const accInfo = el('div', undefined, 'credential-info');
      accInfo.append(el('span', 'Tên tài khoản (Steam Account)', 'credential-label'));
      const accVal = el('strong', order.account || '', 'credential-val');
      accInfo.append(accVal);
      const accCopyBtn = button('Sao chép tài khoản', () => {
        copy(order.account || accVal.textContent);
        toast('Đã sao chép tài khoản!');
      }, 'btn-copy-cred');
      accRow.append(accInfo, accCopyBtn);

      // Password row
      const pwdRow = el('div', undefined, 'credential-row');
      const pwdInfo = el('div', undefined, 'credential-info');
      pwdInfo.append(el('span', 'Mật khẩu (Steam Password)', 'credential-label'));
      const pwdVal = el('strong', order.password || '', 'credential-val');
      pwdInfo.append(pwdVal);
      const pwdCopyBtn = button('Sao chép mật khẩu', () => {
        copy(order.password || pwdVal.textContent);
        toast('Đã sao chép mật khẩu!');
      }, 'btn-copy-cred');
      pwdRow.append(pwdInfo, pwdCopyBtn);

      credCard.append(accRow, pwdRow);
      box.append(credCard);

      // Steam Guard Retrieval Section
      const guardCard = el('div', undefined, 'steam-guard-card');
      const fetchBtn = button('🔑 Lấy mã đăng nhập', null, 'steam-guard-btn');
      fetchBtn.id = 'fetch-guard-btn';

      const codeBox = el('div', undefined, 'guard-code-box');
      codeBox.hidden = true;
      const codeLabel = el('span', 'Mã Steam Guard:', 'credential-label');
      const codeVal = el('strong', '', 'guard-code-val');
      const copyCodeBtn = button('Sao chép mã', () => {
        copy(codeVal.textContent);
        toast('Đã sao chép mã Steam Guard!');
      }, 'btn-copy-cred');
      codeBox.append(codeLabel, codeVal, copyCodeBtn);

      const quotaInfo = el('div', undefined, 'guard-quota-text');
      quotaInfo.innerHTML = 'Hạn mức slot: <strong id="guard-quota-count">5 lần / ngày</strong> • Hồi chiêu: <strong>3 giây</strong>';

      // 3-second countdown and trigger logic
      let cooldownTimer = null;
      fetchBtn.addEventListener('click', async () => {
        fetchBtn.disabled = true;
        let remaining = 3;
        fetchBtn.textContent = `Chờ ${remaining}s...`;

        cooldownTimer = setInterval(() => {
          remaining--;
          if (remaining > 0) {
            fetchBtn.textContent = `Chờ ${remaining}s...`;
          } else {
            clearInterval(cooldownTimer);
            fetchBtn.disabled = false;
            fetchBtn.textContent = 'LẤY LẠI MÃ STEAM GUARD KHÁC';
          }
        }, 1000);

        let delivered = false;
        try {
          const res = await fetch('/api/steam/guard', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              orderId: order.id,
              account: order.account,
              gameId: order.gameId,
              slotId: order.slotId
            })
          });
          const data = await res.json().catch(() => null);
          if (res.ok && data && data.ok && data.code) {
            codeVal.textContent = data.code;
            codeBox.hidden = false;
            delivered = true;
            toast('Đã nhận mã Steam Guard từ nhà cung cấp: ' + data.code);
            if (data.remainingCalls !== undefined) {
              const qc = $('guard-quota-count');
              if (qc) qc.textContent = `${data.remainingCalls} lần / ngày`;
            }
            if (data.slotRotated) {
              toast('Đã tự động đổi sang slot tài khoản dự phòng mới!');
              if (data.account) { order.account = data.account; accVal.textContent = data.account; }
              if (data.password) { order.password = data.password; pwdVal.textContent = data.password; }
            }
          } else {
            const msg = data?.message || 'Chưa nhận được mã từ Steam. Vui lòng bấm Đăng nhập trên Steam trước rồi thử lại.';
            toast(msg);
          }
        } catch (err) {
          toast('Lỗi kết nối máy chủ cấp mã. Vui lòng thử lại sau.');
        }
      });

      guardCard.append(fetchBtn, codeBox, quotaInfo);
      box.append(guardCard);

      // Offline guide
      const guideBox = el('div', undefined, 'offline-guide-box');
      guideBox.innerHTML = `
        <h4>📖 Hướng Dẫn 3 Bước Kích Hoạt & Chơi Game Offline:</h4>
        <ol>
          <li><strong>Bước 1:</strong> Mở ứng dụng Steam PC, nhập <strong>Tài khoản & Mật khẩu</strong> ở trên.</li>
          <li><strong>Bước 2:</strong> Nếu Steam hỏi mã xác thực, bấm nút <strong>Lấy mã đăng nhập</strong> ở trên để nhận mã 5 ký tự.</li>
          <li><strong>Bước 3:</strong> Vào Thư viện tải game, sau đó chọn <code>Steam</code> → <code>Go Offline</code> để chơi vĩnh viễn không lo bị đá văng.</li>
        </ol>
      `;
      box.append(guideBox);
    } else if(typeof order.key!=='string'||!order.key){
      box.append(el('p', 'Thanh toán đã xác nhận. Key đang được xử lý; hãy kiểm tra lại sau ít phút.'));
    } else {
      box.append(el('p', 'Key của bạn được lưu tại đây. Chỉ chia sẻ với người bạn tin tưởng.'),el('code',order.key,'key'),button('Sao chép key',()=>copy(order.key),'primary'));
    }
  } else if(order.status==='PENDING') {
    const bank=order.payment;
    if(!bank||typeof bank.account!=='string'||!/^\d{6,30}$/.test(bank.account)||typeof bank.bank!=='string'||!/^[A-Za-z0-9]{2,20}$/.test(bank.bank)||typeof bank.name!=='string') {
      box.append(el('p','Chưa lấy được thông tin thanh toán. Vui lòng kiểm tra lại đơn.'));return;
    }

    // Centered Order Header
    box.replaceChildren();
    const orderTitle = isGameOrder ? (order.title || (order.amount === 100000 ? 'Gói Siêu Combo: 31 Game Steam AAA' : planInfo.name)) : planInfo.name;
    const headerBox = el('div', undefined, 'order-pending-header');
    headerBox.append(
      el('span', states[order.status], `badge ${order.status}`),
      el('h2', orderTitle),
      el('p', `Mã đơn hàng: ${order.id}`, 'muted order-id-text')
    );
    box.append(headerBox);

    // Centered QR Section (QR Code right in the middle of the web)
    const qrSection = el('div', undefined, 'qr-centered-section');
    if(!order.demo) {
      const qrWrap = el('div', undefined, 'qr-img-wrapper');
      const img = el('img', undefined, 'qr qr-centered');
      img.alt = `Mã VietQR thanh toán đơn ${order.id}`;
      img.src = `https://img.vietqr.io/image/${encodeURIComponent(bank.bank)}-${encodeURIComponent(bank.account)}-compact2.png?amount=${order.amount}&addInfo=${encodeURIComponent(order.id)}&accountName=${encodeURIComponent(bank.name)}`;
      img.addEventListener('error', () => {
        img.hidden = true;
        toast('Không tải được QR. Thông tin chuyển khoản vẫn ở bên dưới.');
      });
      qrWrap.append(img);
      const hint = el('p', 'Quét mã VietQR bằng ứng dụng ngân hàng bất kỳ để thanh toán tự động', 'qr-hint-text');
      qrSection.append(qrWrap, hint);
    } else {
      qrSection.append(el('div', 'QR minh họa đã tắt để tránh chuyển nhầm tiền.', 'notice'));
    }
    box.append(qrSection);

    // Centered Bank Details Card
    const bankCard = el('div', undefined, 'bank-details-card');
    bankCard.append(el('div', 'Thông tin chuyển khoản chính xác:', 'bank-details-title'));

    const bankNameFormatted = bank.bank === 'MB' ? 'MB Bank (Quân Đội)' : bank.bank;
    const rowsData = [
      ['Ngân hàng', bankNameFormatted, bank.bank, false, false],
      ['Chủ tài khoản', bank.name, bank.name, false, false],
      ['Số tài khoản', bank.account, bank.account, true, false],
      ['Số tiền', money(order.amount), String(order.amount), true, true],
      ['Nội dung chuyển khoản', order.id, order.id, true, true]
    ];

    const rowsList = el('div', undefined, 'bank-rows-list');
    for (const [label, displayVal, copyVal, hasCopy, isHighlight] of rowsData) {
      const row = el('div', undefined, `bank-info-row ${isHighlight ? 'highlight' : ''}`);
      const labelCol = el('div', undefined, 'bank-row-label');
      labelCol.append(el('small', label));
      
      const valCol = el('div', undefined, 'bank-row-value');
      valCol.append(el('strong', displayVal));
      if (hasCopy) {
        const copyBtn = button('Sao chép', () => {
          copy(copyVal);
          toast(`Đã sao chép ${label.toLowerCase()}!`);
        }, 'btn-copy-small');
        valCol.append(copyBtn);
      }
      row.append(labelCol, valCol);
      rowsList.append(row);
    }
    bankCard.append(rowsList);
    box.append(bankCard);

    // Centered Action Buttons
    const actions = el('div', undefined, 'detail-actions centered');
    const checkBtn = button('Kiểm tra thanh toán', () => loadDetail(order.id));
    actions.append(checkBtn);
    box.append(actions);

    const note = el('p', 'Chuyển đúng số tiền và nội dung. Hệ thống sẽ tự động cấp tài khoản & mật khẩu sau khi nhận tiền.', 'fine order-note-centered');
    box.append(note);
    return;
  } else {
    box.append(el('p',order.status==='UNDERPAID'?'Số tiền chưa đủ theo đơn. Giữ mã đơn và biên lai để nhờ shop đối soát; không thanh toán lại toàn bộ.':'Đơn này không còn chờ thanh toán. Nếu bạn đã chuyển tiền, giữ mã đơn và biên lai để nhờ shop đối soát.'));
    const actions=el('div',undefined,'detail-actions');
    actions.append(button('Kiểm tra thanh toán',()=>loadDetail(order.id)));
    box.append(actions);
  }
}
async function loadDetail(id,quiet=false) {
  clearTimeout(timer); const version=revision;
  if(!quiet)$('detail').replaceChildren(el('p','Đang tải đơn hàng…','loading'));
  try {
    const result=await (/^SG[A-F0-9]{24}$/.test(id) ? steamRequest('order', {orderId: id}) : credential ? accountRequest('detail',{orderId:id}) : request(`/api/orders/${encodeURIComponent(id)}`));
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
