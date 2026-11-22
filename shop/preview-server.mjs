// Local-only demo. Never forwards requests to payment or production services.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {plans} from './shop-model.mjs';
const root=fileURLToPath(new URL('.',import.meta.url));
let signedIn=false;
const rows=[{id:'VTCH-DEMO01',plan:'lifetime',amount:100000,status:'PAID',createdAt:'2026-11-20T12:00:00Z',key:'DEMO-ONLY-NOT-A-REAL-LICENSE',demo:true}];
const payment={bank:'MB',account:'0000000000',name:'TAI KHOAN MINH HOA'};
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');const path=url.pathname;
  const json=(value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
  if(path==='/auth/login'){signedIn=true;res.writeHead(302,{Location:'/buy#orders'});res.end();return;}
  if(path==='/api/shop-config'){json({demo:true});return;}
  if(path==='/api/me'){json({user:signedIn?{name:'Khách dùng thử'}:null,demo:true});return;}
  if(path.startsWith('/api/')){
    if(!signedIn){json({},401);return;}
    if(path==='/api/logout'){signedIn=false;json({ok:true});return;}
    if(path==='/api/orders'&&req.method==='POST'){
      let body='';for await(const chunk of req)body+=chunk;
      try {const p=plans.find(p=>p.id===JSON.parse(body).plan);if(!p)throw Error();
        const order={id:`VTCH-DEMO${String(rows.length+1).padStart(2,'0')}`,plan:p.id,amount:p.price,status:'PENDING',createdAt:new Date().toISOString(),payment,demo:true};rows.unshift(order);json({order},201);
      }catch{json({},400);}return;
    }
    if(path==='/api/orders'){json({orders:rows});return;}
    const order=rows.find(o=>path===`/api/orders/${o.id}`);if(order){json({order});return;}json({},404);return;
  }
  const allowed={'/mobile/':'../mobile/index.html','/shop/site-menu.mjs':'site-menu.mjs','/index.mobile.html':'../index.mobile.html','/ios/':'../ios/index.html','/android/VuaTroChoi_ByeDPI.apk':'../android/VuaTroChoi_ByeDPI.apk','/':'index.html','/buy':'index.html','/shop/paper-background-landscape.jpg':'paper-background-landscape.jpg','/shop/paper-background-portrait.jpg':'paper-background-portrait.jpg','/shop/game-gia-re.png':'game-gia-re.png','/shop/store.css':'store.css','/shop/store.mjs':'store.mjs','/shop/shop-model.mjs':'shop-model.mjs'};
  const file=allowed[path];if(!file){res.writeHead(404);res.end();return;}
  const types={html:'text/html',css:'text/css',mjs:'text/javascript',jpg:'image/jpeg',png:'image/png',apk:'application/vnd.android.package-archive'};
  res.writeHead(200,{'Content-Type':`${types[file.split('.').at(-1)]}`,'Cache-Control':'no-store'});res.end(await readFile(root+file));
});
server.listen(Number(process.env.VTCH_PREVIEW_PORT || 4177),'127.0.0.1',()=>console.log('Local demo: http://127.0.0.1:4177/buy (no real payments)'));
