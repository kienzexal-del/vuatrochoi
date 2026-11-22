import {plans,money,states,normalizeOrders,validOrder,request} from './shop-model.mjs';
const $ = id => document.getElementById(id);
let user = null, selected = plans[0], orders = [], loading = true, creating = false, timer, revision = 0;
const el = (tag,text,cls) => {const node = document.createElement(tag); if(text !== undefined) node.textContent = text; if(cls) node.className = cls; return node;};
function button(text,action,cls='') {const b=el('button',text,cls); b.addEventListener('click',action); return b;}
function error(message) {$('alert').textContent=message; $('alert').hidden=!message;}
function toast(message) {$('toast').textContent=message; $('toast').hidden=false; setTimeout(()=>$('toast').hidden=true,3000);}
let gisReady = false, credential = '';
function login() {
  if (!gisReady) {
    if (!$('demo').hidden) location.assign('/auth/login');
    else error('Đăng nhập Google chưa sẵn sàng. Vui lòng tải lại trang.');
    return;
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
const GOOGLE_CLIENT_ID = '934644417883-72iujt055o25snvt6i1cr9egomvvgm2l.apps.googleusercontent.com';
const API_URL = 'https://script.google.com/macros/s/AKfycbzsJ4SvFtnCRROeB3SZHNcq65oReT-wlBQJlwF9eG4WUsDI9cJT4JuXLLuH9Y6TYZdRJg/exec';
const BANK_CONFIG = { bank: 'MB', account: '0000125042003', name: 'NGUYEN VAN KIEN' };

function parseJwt(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    return JSON.parse(jsonPayload);
  } catch(e) {
    return null;
  }
}

async function directGasRequest(action, fields = {}) {
  if (action === 'me') {
    const payload = parseJwt(credential);
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
    const orderId = fields.orderId;
    let token = '';
    try {
      token = localStorage.getItem(`vtch_token_${orderId}`) || '';
    } catch(e) {}

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
        }
      } catch(e) {}
    }

    if (!order && credential) {
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
        }
      }
    }

    if (!order) throw new Error('Không tìm thấy đơn hàng.');
    return { order };
  }

  throw new Error('Hành động không hợp lệ');
}

async function accountRequest(action, fields = {}) {
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
      if(gisReady) {credential=''; google.accounts.id.disableAutoSelect();}
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
for(const plan of plans) {
  const b=button('',()=>select(plan),'plan');b.dataset.plan=plan.id;
  const radio=el('span',undefined,'radio');radio.setAttribute('aria-hidden','true');
  const name=el('span');const strong=el('strong',plan.name);
  if(plan.id==='lifetime') strong.append(el('span','Thanh toán một lần','plan-tag'));
  name.append(strong,el('small',plan.description));b.append(radio,name,el('span',money(plan.price),'price'));$('plans').append(b);
}
select(selected);
function empty(title,description,action,label) {const box=el('div',undefined,'empty');box.append(el('h2',title),el('p',description));if(action)box.append(button(label,action,'primary'));return box;}
function showOrders() {
  const list=$('orders');list.replaceChildren();
  if(!orders.length){list.append(empty('Chưa có đơn hàng','Khi bạn mua bản quyền, đơn hàng sẽ xuất hiện tại đây.',()=>location.hash='shop','Chọn gói bản quyền'));return;}
  const container=el('div',undefined,'orders');
  for(const order of orders) {
    const row=el('article',undefined,'order');const name=el('div');name.append(el('h3',plans.find(p=>p.id===order.plan).name),el('small',order.id));
    const status=el('div');status.append(el('span',states[order.status],`badge ${order.status}`),el('small',new Date(order.createdAt).toLocaleString('vi-VN')));
    row.append(name,status,el('strong',money(order.amount),'order-amount'),button(order.status==='PAID'?'Xem key':'Xem đơn',()=>location.hash=`order/${order.id}`));container.append(row);
  }
  list.append(container);
}
async function loadOrders() {
  const version=revision;$('orders').replaceChildren(el('p','Đang tải đơn hàng…','loading'));$('refresh').disabled=true;
  try {const result=await (gisReady ? accountRequest('list') : request('/api/orders'));if(version!==revision)return;orders=normalizeOrders(result.orders);showOrders();error('');}
  catch(e){if(version!==revision)return;$('orders').replaceChildren(empty('Chưa tải được đơn hàng',e.message,loadOrders,'Thử lại'));}
  finally {$('refresh').disabled=false;}
}
function displayOrder(order) {
  const box=$('detail');box.replaceChildren();box.append(el('span',states[order.status],`badge ${order.status}`),el('h2',`Bản quyền ${plans.find(p=>p.id===order.plan).name}`),el('p',`Mã đơn: ${order.id}`,'muted'));
  if(order.status==='PAID') {
    if(typeof order.key!=='string'||!order.key){box.append(el('p','Thanh toán đã xác nhận. Key đang được xử lý; hãy kiểm tra lại sau ít phút.'));}
    else {box.append(el('p','Key của bạn được lưu tại đây. Chỉ chia sẻ với người bạn tin tưởng.'),el('code',order.key,'key'),button('Sao chép key',()=>copy(order.key),'primary'));}
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
    const result=await (gisReady ? accountRequest('detail',{orderId:id}) : request(`/api/orders/${encodeURIComponent(id)}`));
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
  $('nav-shop').setAttribute('aria-current', hash === 'shop' ? 'page' : 'false');
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
    const result=await (gisReady ? accountRequest('create',{plan:selected.id,requestId}) :
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
let connectionError='';
try {
  let clientId = GOOGLE_CLIENT_ID;
  const config = await request('/api/shop-config').catch(() => null);
  if (config?.demo) {
    $('demo').hidden = false;
    user = (await request('/api/me')).user;
  } else {
  if (config?.googleClientId) {
    clientId = config.googleClientId;
  }
  await new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve();
    const script = el('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.onload = resolve;
    script.onerror = reject;
    document.head.append(script);
  });
  google.accounts.id.initialize({
    client_id: clientId,
    callback: async result => {
      try {
        credential = result.credential;
        const profile = (await accountRequest('me')).user;
        user = {...profile, picture: profile?.picture || parseJwt(credential)?.picture};
        document.querySelector('.login-dialog[open]')?.close();
        account();
        route();
      } catch {
        credential = '';
        error('Không xác nhận được tài khoản Google. Vui lòng thử lại.');
      }
    }
  });
  gisReady = true;
  }
}
catch(e){connectionError='Chưa kết nối được tài khoản. Bạn vẫn có thể xem các gói; hãy tải lại trang để thử kết nối.';}
finally {
  loading=false;account();route();
  if(connectionError) error(connectionError);
  else if(new URLSearchParams(location.search).get('login')==='failed') {
    error('Đăng nhập Google chưa hoàn tất. Bạn có thể thử lại.');
    history.replaceState(null, '', location.pathname + location.hash);
  }
}
