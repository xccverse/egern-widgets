// ==================== 网上国网小组件 · Scriptable 版 ====================
// 基于 Egern 版 sgcc.js 移植（App 协议直连，SM2/SM3/SM4 纯 JS 实现）
// 协议移植自 stevenjoezhang/hass-state-grid（MIT）
//
// 【使用方法】
// 1. 复制本文件全部内容，粘贴到 Scriptable 新建脚本中
// 2. 在脚本设置里找到「小组件参数」(Widget Parameter)，填入 JSON：
//    {
//      "username": "138xxxxxxxx",
//      "password": "你的密码",
//      "account": "all",
//      "tiers": "2160,4200",
//      "prices": "0.5469,0.5969,0.8469",
//      "focus": "4055",
//      "sms": "123456"
//    }
// 3. 参数说明：
//    username  必填  网上国网 App 登录手机号
//    password  必填  网上国网 App 登录密码
//    account   选填  户号后4位；填 "all" 显示全部户号；留空显示第一个
//    tiers     选填  阶梯分界，如 "2160,4200"（北京默认 2880,4800）
//    prices    选填  阶梯电价，如 "0.5469,0.5969,0.8469"（北京默认 0.4883,0.5383,0.7883）
//    focus     选填  all 模式下大尺寸显示完整详情的户号后4位，留空默认第一家
//    sms       选填  短信验证码（新设备验证时用，App 内运行时会自动弹窗索取）
//    lock      选填  填 true 则渲染锁屏紧凑版（另存一个脚本专供锁屏用）
// 4. 回到桌面添加 Scriptable 小组件，长按编辑选择本脚本
//
// 【短信验证】
// 首次在新设备登录时，国网可能要求短信验证。
// 在 Scriptable App 内运行本脚本，会自动弹窗让你输入验证码，输入后自动重试。
// 作为小组件运行时若提示需要验证，请到 App 内运行一次完成验证。
// ============================================================================

// ---------------- Scriptable 适配层 ----------------
let _params = {};
try { _params = JSON.parse(args.widgetParameter || '{}'); } catch (e) { _params = {}; }
const params = _params;

// 存储：FileManager
const _fm = FileManager.local();
const _STORE_DIR = _fm.joinPath(_fm.documentsDirectory(), 'sgcc');
if (!_fm.fileExists(_STORE_DIR)) _fm.createDirectory(_STORE_DIR);
function _storeGet(k) {
  const p = _fm.joinPath(_STORE_DIR, k + '.json');
  return _fm.fileExists(p) ? _fm.readString(p) : null;
}
function _storeSet(k, v) {
  _fm.writeString(_fm.joinPath(_STORE_DIR, k + '.json'), v);
}

// 短信验证码：如果 App 内弹窗输入过，存文件，下次自动带上
const _SMS_FILE = 'sgcc_sms_code';
function getSmsCode() {
  const fromParams = String(params.sms || '').replace(/\D/g, '');
  if (fromParams.length === 6) return fromParams;
  const fromFile = String(_storeGet(_SMS_FILE) || '').replace(/\D/g, '');
  if (fromFile.length === 6) return fromFile;
  return '';
}
function saveSmsCode(code) { _storeSet(_SMS_FILE, code); }
function clearSmsCode() { try { _fm.remove(_fm.joinPath(_STORE_DIR, _SMS_FILE + '.json')); } catch (e) {} }

// ctx 模拟对象（映射 Egern API 到 Scriptable）
const ctx = {
  env: {
    SGCC_USERNAME: params.username || '',
    SGCC_PASSWORD: params.password || '',
    SGCC_SMS: getSmsCode(),
    SGCC_ACCOUNT: params.account || '',
    SGCC_TIERS: params.tiers || '',
    SGCC_PRICES: params.prices || '',
    SGCC_FOCUS: params.focus || '',
    SGCC_POLICY: 'DIRECT',
    SGCC_REFRESH: '6',
  },
  storage: {
    getJSON: (k) => { try { const s = _storeGet(k); return s ? JSON.parse(s) : null; } catch (e) { return null; } },
    setJSON: (k, v) => { try { _storeSet(k, JSON.stringify(v)); } catch (e) {} },
    get: (k) => _storeGet(k),
    set: (k, v) => { try { _storeSet(k, String(v)); } catch (e) {} },
  },
  http: {
    post: async (url, opts) => {
      const req = new Request(url);
      req.method = 'POST';
      req.headers = opts.headers || {};
      req.body = opts.body || '';
      req.timeoutInterval = (opts.timeout || 20000) / 1000;
      let text = '';
      let status = 0;
      try { text = await req.loadString(); } catch (e) { /* 网络错，status 保持 0 */ }
      try { status = req.response ? req.response.statusCode : 0; } catch (e) {}
      return {
        status: status,
        text: async () => text,
      };
    },
  },
  notify: ({ title, body }) => {
    try {
      const n = new Notification();
      n.title = title || '网上国网';
      n.body = String(body || '').slice(0, 200);
      n.schedule();
    } catch (e) {}
  },
  widgetFamily: (() => {
    const f = config.widgetFamily;
    if (f === 'small') return 'systemSmall';
    if (f === 'medium') return 'systemMedium';
    if (f === 'large') return 'systemLarge';
    return 'systemLarge';
  })(),
};

function refreshSmsEnv() {
  ctx.env.SGCC_SMS = getSmsCode();
}

// ==================== 以下为纯 JS 移植（与 Egern 版一致） ====================

const K = { data: 'sgcc_hark_data2', err: 'sgcc_hark_err2', lock: 'sgcc_hark_lock', dev: 'sgcc_app_dev', sess: 'sgcc_app_sess', sms: 'sgcc_app_sms' };

function clean(v) { return String(v == null ? '' : v).trim(); }
function num(v) { if (typeof v === 'number') return Number.isFinite(v) ? v : NaN; const n = Number(String(v == null ? '' : v).replace(/[^\d.-]/g, '')); return Number.isFinite(n) && String(v == null ? '' : v).trim() !== '' ? n : NaN; }

function utf8enc(s){const o=[];for(let i=0;i<s.length;i++){let c=s.charCodeAt(i);if(c>=0xd800&&c<0xdc00&&i+1<s.length){const d=s.charCodeAt(i+1);if(d>=0xdc00&&d<0xe000){c=0x10000+((c-0xd800)<<10)+(d-0xdc00);i++;}}if(c<0x80)o.push(c);else if(c<0x800)o.push(0xc0|(c>>6),0x80|(c&63));else if(c<0x10000)o.push(0xe0|(c>>12),0x80|((c>>6)&63),0x80|(c&63));else o.push(0xf0|(c>>18),0x80|((c>>12)&63),0x80|((c>>6)&63),0x80|(c&63));}return new Uint8Array(o);}
function utf8dec(b){let s='';for(let i=0;i<b.length;){const c=b[i++];let cp;if(c<0x80)cp=c;else if(c<0xe0)cp=((c&31)<<6)|(b[i++]&63);else if(c<0xf0){cp=((c&15)<<12)|((b[i++]&63)<<6)|(b[i++]&63);}else{cp=((c&7)<<18)|((b[i++]&63)<<12)|((b[i++]&63)<<6)|(b[i++]&63);}if(cp>0xffff){cp-=0x10000;s+=String.fromCharCode(0xd800+(cp>>10),0xdc00+(cp&1023));}else s+=String.fromCharCode(cp);}return s;}
function u8(x){ if(x instanceof Uint8Array) return x; if(typeof x==='string') return utf8enc(x); return new Uint8Array(x);}
function toHex(b){let s='';for(let i=0;i<b.length;i++)s+=b[i].toString(16).padStart(2,'0');return s;}
function fromHex(h){const b=new Uint8Array(h.length/2);for(let i=0;i<b.length;i++)b[i]=parseInt(h.substr(i*2,2),16);return b;}
function rotl(x,n){n&=31;return ((x<<n)|(x>>>(32-n)))>>>0;}

/* ===== MD5 ===== */
function md5(input){
  const msg=u8(input);
  const S=[7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
  const Kt=[];for(let i=0;i<64;i++)Kt[i]=(Math.floor(Math.abs(Math.sin(i+1))*4294967296))>>>0;
  const ml=msg.length;const bl=ml*8;
  const withpad=((ml+8)>>6)+1;const buf=new Uint8Array(withpad*64);
  buf.set(msg);buf[ml]=0x80;const dv=new DataView(buf.buffer);
  dv.setUint32(buf.length-8,bl>>>0,true);dv.setUint32(buf.length-4,Math.floor(bl/4294967296)>>>0,true);
  let a0=0x67452301,b0=0xefcdab89,c0=0x98badcfe,d0=0x10325476;
  for(let off=0;off<buf.length;off+=64){
    const M=[];for(let i=0;i<16;i++)M[i]=dv.getUint32(off+i*4,true);
    let A=a0,B=b0,C=c0,D=d0;
    for(let i=0;i<64;i++){let F,g;
      if(i<16){F=(B&C)|((~B>>>0)&D);g=i;}
      else if(i<32){F=(D&B)|((~D>>>0)&C);g=(5*i+1)&15;}
      else if(i<48){F=B^C^D;g=(3*i+5)&15;}
      else{F=C^(B|(~D>>>0));g=(7*i)&15;}
      F=(F+A+Kt[i]+M[g])>>>0;A=D;D=C;C=B;B=(B+rotl(F,S[i]))>>>0;
    }
    a0=(a0+A)>>>0;b0=(b0+B)>>>0;c0=(c0+C)>>>0;d0=(d0+D)>>>0;
  }
  const out=new Uint8Array(16);const o=new DataView(out.buffer);
  o.setUint32(0,a0,true);o.setUint32(4,b0,true);o.setUint32(8,c0,true);o.setUint32(12,d0,true);
  return out;
}
const md5hex=x=>toHex(md5(x));

/* ===== SHA-256 / HMAC ===== */
function sha256(input){
  const msg=u8(input);
  const K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  let H=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  const ml=msg.length;const bl=ml*8;
  const withpad=((ml+8)>>6)+1;const buf=new Uint8Array(withpad*64);
  buf.set(msg);buf[ml]=0x80;const dv=new DataView(buf.buffer);
  dv.setUint32(buf.length-4,bl>>>0);dv.setUint32(buf.length-8,Math.floor(bl/4294967296)>>>0);
  const w=new Array(64);
  for(let off=0;off<buf.length;off+=64){
    for(let i=0;i<16;i++)w[i]=dv.getUint32(off+i*4);
    for(let i=16;i<64;i++){const s0=rotl(w[i-15],25)^rotl(w[i-15],14)^(w[i-15]>>>3);const s1=rotl(w[i-2],15)^rotl(w[i-2],13)^(w[i-2]>>>10);w[i]=(w[i-16]+s0+w[i-7]+s1)>>>0;}
    let [a,b,c,d,e,f,g,h]=H;
    for(let i=0;i<64;i++){const S1=rotl(e,26)^rotl(e,21)^rotl(e,7);const ch=(e&f)^((~e>>>0)&g);const t1=(h+S1+ch+K[i]+w[i])>>>0;const S0=rotl(a,30)^rotl(a,19)^rotl(a,10);const maj=(a&b)^(a&c)^(b&c);const t2=(S0+maj)>>>0;h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;}
    H=[(H[0]+a)>>>0,(H[1]+b)>>>0,(H[2]+c)>>>0,(H[3]+d)>>>0,(H[4]+e)>>>0,(H[5]+f)>>>0,(H[6]+g)>>>0,(H[7]+h)>>>0];
  }
  const out=new Uint8Array(32);const o=new DataView(out.buffer);
  for(let i=0;i<8;i++)o.setUint32(i*4,H[i]);
  return out;
}
function hmacSha256(key,msg){
  key=u8(key);msg=u8(msg);
  if(key.length>64)key=sha256(key);
  const k=new Uint8Array(64);k.set(key);
  const ip=new Uint8Array(64),op=new Uint8Array(64);
  for(let i=0;i<64;i++){ip[i]=k[i]^0x36;op[i]=k[i]^0x5c;}
  const inner=sha256(concat(ip,msg));
  return sha256(concat(op,inner));
}
function concat(...arrs){let n=0;for(const a of arrs)n+=a.length;const o=new Uint8Array(n);let p=0;for(const a of arrs){o.set(a,p);p+=a.length;}return o;}

/* ===== SM3 ===== */
function sm3(input){
  const m=u8(input);const len=m.length;const bitLen=len*8;
  const padLen=((len%64)<56?56:120)-(len%64);
  const buf=new Uint8Array(len+padLen+8);buf.set(m);buf[len]=0x80;
  const dv=new DataView(buf.buffer);
  dv.setUint32(buf.length-4,bitLen>>>0);dv.setUint32(buf.length-8,Math.floor(bitLen/4294967296)>>>0);
  let V=[0x7380166f,0x4914b2b9,0x172442d7,0xda8a0600,0xa96f30bc,0x163138aa,0xe38dee4d,0xb0fb0e4e];
  for(let b=0;b<buf.length;b+=64){
    const W=new Array(68),W1=new Array(64);
    for(let i=0;i<16;i++)W[i]=dv.getUint32(b+i*4);
    for(let i=16;i<68;i++){const x=W[i-16]^W[i-9]^rotl(W[i-3],15);W[i]=(x^rotl(x,15)^rotl(x,23)^rotl(W[i-13],7)^W[i-6])>>>0;}
    for(let i=0;i<64;i++)W1[i]=(W[i]^W[i+4])>>>0;
    let [A,B,C,D,E,F,G,H]=V;
    for(let j=0;j<64;j++){const Tj=j<16?0x79cc4519:0x7a879d8a;const SS1=rotl((rotl(A,12)+E+rotl(Tj,j))>>>0,7);const SS2=(SS1^rotl(A,12))>>>0;const FF=j<16?(A^B^C):((A&B)|(A&C)|(B&C));const GG=j<16?(E^F^G):((E&F)|((~E>>>0)&G));const TT1=(FF+D+SS2+W1[j])>>>0;const TT2=(GG+H+SS1+W[j])>>>0;D=C;C=rotl(B,9);B=A;A=TT1;H=G;G=rotl(F,19);F=E;E=(TT2^rotl(TT2,9)^rotl(TT2,17))>>>0;}
    V=[(V[0]^A)>>>0,(V[1]^B)>>>0,(V[2]^C)>>>0,(V[3]^D)>>>0,(V[4]^E)>>>0,(V[5]^F)>>>0,(V[6]^G)>>>0,(V[7]^H)>>>0];
  }
  const out=new Uint8Array(32);const o=new DataView(out.buffer);for(let i=0;i<8;i++)o.setUint32(i*4,V[i]);return out;
}
const sm3hex=x=>toHex(sm3(x));
// sm3 kdf: z is bytes
function sm3kdf(z,klen){let ct=1;let out=new Uint8Array(0);const n=Math.ceil(klen/32);for(let i=0;i<n;i++){const cnt=new Uint8Array(4);new DataView(cnt.buffer).setUint32(0,ct);out=concat(out,sm3(concat(z,cnt)));ct++;}return out.slice(0,klen);}

/* ===== SM4 ECB PKCS7 ===== */
const SM4_SBOX=fromHex('d690e9fecce13db716b614c228fb2c05 2b679a762abe04c3aa441326498606999c4250f491ef987a33540b43edcfac62 e4b31ca9c908e89580df94fa758f3fa6 4707a7fcf37317ba83593c19e6854fa8 686b81b27164da8bf8eb0f4b70569d35 1e240e5e6358d1a225227c3b01217887 d40046579fd327524c3602e7a0c4c89e eabf8ad240c738b5a3f7f2cef96115a1 e0ae5da49b341a55ad933230f58cb1e3 1df6e22e8266ca60c02923ab0d534e6f d5db3745defd8e2f03ff6a726d6c5b51 8d1baf92bbddbc7f11d95c411f105ad8 0ac13188a5cd7bbd2d74d012b8e5b4b0 8969974a0c96777e65b9f109c56ec684 18f07dec3adc4d2079ee5f3ed7cb3948'.replace(/\s/g,''));
const SM4_CK=[0x00070e15,0x1c232a31,0x383f464d,0x545b6269,0x70777e85,0x8c939aa1,0xa8afb6bd,0xc4cbd2d9,0xe0e7eef5,0xfc030a11,0x181f262d,0x343b4249,0x50575e65,0x6c737a81,0x888f969d,0xa4abb2b9,0xc0c7ced5,0xdce3eaf1,0xf8ff060d,0x141b2229,0x30373e45,0x4c535a61,0x686f767d,0x848b9299,0xa0a7aeb5,0xbcc3cad1,0xd8dfe6ed,0xf4fb0209,0x10171e25,0x2c333a41,0x484f565d,0x646b7279];
const SM4_FK=[0xa3b1bac6,0x56aa3350,0x677d9197,0xb27022dc];
function sm4tau(a){return ((SM4_SBOX[(a>>>24)&0xff]<<24)|(SM4_SBOX[(a>>>16)&0xff]<<16)|(SM4_SBOX[(a>>>8)&0xff]<<8)|SM4_SBOX[a&0xff])>>>0;}
function sm4L(b){return (b^rotl(b,2)^rotl(b,10)^rotl(b,18)^rotl(b,24))>>>0;}
function sm4Lp(b){return (b^rotl(b,13)^rotl(b,23))>>>0;}
function sm4Key(key){const MK=[];for(let i=0;i<4;i++)MK[i]=((key[i*4]<<24)|(key[i*4+1]<<16)|(key[i*4+2]<<8)|key[i*4+3])>>>0;const K=[MK[0]^SM4_FK[0],MK[1]^SM4_FK[1],MK[2]^SM4_FK[2],MK[3]^SM4_FK[3]];const rk=[];for(let i=0;i<32;i++){const t=(K[i+1]^K[i+2]^K[i+3]^SM4_CK[i])>>>0;const r=(K[i]^sm4Lp(sm4tau(t)))>>>0;K[i+4]=r;rk[i]=r;}return rk;}
function sm4Block(rk,inp,enc){let X=[((inp[0]<<24)|(inp[1]<<16)|(inp[2]<<8)|inp[3])>>>0,((inp[4]<<24)|(inp[5]<<16)|(inp[6]<<8)|inp[7])>>>0,((inp[8]<<24)|(inp[9]<<16)|(inp[10]<<8)|inp[11])>>>0,((inp[12]<<24)|(inp[13]<<16)|(inp[14]<<8)|inp[15])>>>0];for(let i=0;i<32;i++){const k=enc?rk[i]:rk[31-i];const t=(X[i+1]^X[i+2]^X[i+3]^k)>>>0;X[i+4]=(X[i]^sm4L(sm4tau(t)))>>>0;}const o=[X[35],X[34],X[33],X[32]];const out=new Uint8Array(16);for(let i=0;i<4;i++){out[i*4]=(o[i]>>>24)&0xff;out[i*4+1]=(o[i]>>>16)&0xff;out[i*4+2]=(o[i]>>>8)&0xff;out[i*4+3]=o[i]&0xff;}return out;}
function sm4EncryptEcb(data,key){const rk=sm4Key(key);const pad=16-(data.length%16);const buf=new Uint8Array(data.length+pad);buf.set(data);for(let i=data.length;i<buf.length;i++)buf[i]=pad;const out=new Uint8Array(buf.length);for(let i=0;i<buf.length;i+=16)out.set(sm4Block(rk,buf.subarray(i,i+16),true),i);return out;}
function sm4DecryptEcb(data,key){const rk=sm4Key(key);const out=new Uint8Array(data.length);for(let i=0;i<data.length;i+=16)out.set(sm4Block(rk,data.subarray(i,i+16),false),i);const pad=out[out.length-1];return out.slice(0,out.length-pad);}
// App: key text 32 hex chars, uses first 16 ASCII bytes as key
function sm4KeyBytes(keyText){return u8(keyText.slice(0,16));}
function sm4EncryptHex(plain,keyText){return toHex(sm4EncryptEcb(u8(plain),sm4KeyBytes(keyText))).toUpperCase();}
function sm4DecryptHex(hex,keyText){return sm4DecryptEcb(fromHex(hex),sm4KeyBytes(keyText));}

/* ===== AES-256 ECB (check code) ===== */
// robust AES sbox
function aesSboxCompute(){const sbox=new Uint8Array(256);let p=1,q=1;do{p=p^(p<<1)^((p&0x80)?0x11b:0);p&=0xff;q^=q<<1;q^=q<<2;q^=q<<4;q&=0xff;if(q&0x80)q^=0x09;const xf=q^((q<<1)|(q>>>7))^((q<<2)|(q>>>6))^((q<<3)|(q>>>5))^((q<<4)|(q>>>4));sbox[p]=(xf^0x63)&0xff;}while(p!==1);sbox[0]=0x63;return sbox;}
const ASB=aesSboxCompute();
function aesExpand(key){const Nk=8,Nr=14,w=new Uint8Array(4*4*(Nr+1));w.set(key);const rcon=[0x01,0x02,0x04,0x08,0x10,0x20,0x40,0x80,0x1b,0x36,0x6c,0xd8,0xab,0x4d];let i=Nk;const tmp=new Uint8Array(4);while(i<4*(Nr+1)){for(let k=0;k<4;k++)tmp[k]=w[(i-1)*4+k];if(i%Nk===0){const t=tmp[0];tmp[0]=ASB[tmp[1]]^rcon[i/Nk-1];tmp[1]=ASB[tmp[2]];tmp[2]=ASB[tmp[3]];tmp[3]=ASB[t];}else if(i%Nk===4){for(let k=0;k<4;k++)tmp[k]=ASB[tmp[k]];}for(let k=0;k<4;k++)w[i*4+k]=w[(i-Nk)*4+k]^tmp[k];i++;}return {w,Nr};}
function xtime(a){return ((a<<1)^((a&0x80)?0x11b:0))&0xff;}
function aesEncryptBlock(st,w,Nr){const s=st.slice();for(let k=0;k<16;k++)s[k]^=w[k];for(let r=1;r<Nr;r++){for(let k=0;k<16;k++)s[k]=ASB[s[k]];// shiftrows (column-major state: s[r+4c])
    aesShift(s);aesMix(s);for(let k=0;k<16;k++)s[k]^=w[r*16+k];}
  for(let k=0;k<16;k++)s[k]=ASB[s[k]];aesShift(s);for(let k=0;k<16;k++)s[k]^=w[Nr*16+k];return s;}
function aesShift(s){const t=[s[0],s[5],s[10],s[15],s[4],s[9],s[14],s[3],s[8],s[13],s[2],s[7],s[12],s[1],s[6],s[11]];for(let i=0;i<16;i++)s[i]=t[i];}
function aesMix(s){for(let c=0;c<4;c++){const o=c*4;const a0=s[o],a1=s[o+1],a2=s[o+2],a3=s[o+3];s[o]=xtime(a0)^(xtime(a1)^a1)^a2^a3;s[o+1]=a0^xtime(a1)^(xtime(a2)^a2)^a3;s[o+2]=a0^a1^xtime(a2)^(xtime(a3)^a3);s[o+3]=(xtime(a0)^a0)^a1^a2^xtime(a3);}}
function aes256EcbEncrypt(data,key){const {w,Nr}=aesExpand(key);const pad=16-(data.length%16);const buf=new Uint8Array(data.length+pad);buf.set(data);for(let i=data.length;i<buf.length;i++)buf[i]=pad;const out=new Uint8Array(buf.length);for(let i=0;i<buf.length;i+=16)out.set(aesEncryptBlock(buf.subarray(i,i+16),w,Nr),i);return out;}

/* ===== SM2 ===== */
const SM2_P=BigInt('0xFFFFFFFEFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF00000000FFFFFFFFFFFFFFFF');
const SM2_A=BigInt('0xFFFFFFFEFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF00000000FFFFFFFFFFFFFFFC');
const SM2_B=BigInt('0x28E9FA9E9D9F5E344D5A9E4BCF6509A7F39789F515AB8F92DDBCBD414D940E93');
const SM2_GX=BigInt('0x32C4AE2C1F1981195F9904466A39C9948FE30BBFF2660BE1715A4589334C74C7');
const SM2_GY=BigInt('0xBC3736A2F4F6779C59BDCEE36B692153D0A9877CC62A474002DF32E52139F0A0');
function mod(a,m){return ((a%m)+m)%m;}
function inv(a,m){let [old_r,r]=[mod(a,m),m];let [old_s,s]=[1n,0n];while(r!==0n){const q=old_r/r;[old_r,r]=[r,old_r-q*r];[old_s,s]=[s,old_s-q*s];}return mod(old_s,m);}
function ptAdd(P,Q){if(!P)return Q;if(!Q)return P;const [x1,y1]=P,[x2,y2]=Q;if(x1===x2&&mod(y1+y2,SM2_P)===0n)return null;let l;if(x1===x2&&y1===y2){l=mod((3n*x1*x1+SM2_A)*inv(2n*y1,SM2_P),SM2_P);}else{l=mod((y2-y1)*inv(mod(x2-x1,SM2_P),SM2_P),SM2_P);}const x3=mod(l*l-x1-x2,SM2_P);const y3=mod(l*(x1-x3)-y1,SM2_P);return [x3,y3];}
function ptMul(k,P){let R=null,N=P;while(k>0n){if(k&1n)R=ptAdd(R,N);N=ptAdd(N,N);k>>=1n;}return R;}
const G=[SM2_GX,SM2_GY];
function b32(n){let h=n.toString(16).padStart(64,'0');return fromHex(h);}
// encrypt 32-char key text ascii -> "04"+C1C3C2 hex (mode 1)
function sm2EncryptKey(keyText,serverPubHex){const msg=u8(keyText);let pub=serverPubHex;if(pub.length===130)pub=pub.slice(2);const px=BigInt('0x'+pub.slice(0,64)),py=BigInt('0x'+pub.slice(64));
  let k,C1,xy;do{k=BigInt('0x'+toHex(randomBytes(32)))%SM2_P;if(k===0n)continue;C1=ptMul(k,G);xy=ptMul(k,[px,py]);}while(!C1||!xy);
  const x2=b32(xy[0]),y2=b32(xy[1]);const t=sm3kdf(concat(x2,y2),msg.length);let ok=false;for(const b of t)if(b!==0){ok=true;break;}if(!ok)return sm2EncryptKey(keyText,serverPubHex);
  const C2=new Uint8Array(msg.length);for(let i=0;i<msg.length;i++)C2[i]=msg[i]^t[i];
  const C3=sm3(concat(x2,msg,y2));
  const c1hex=b32(C1[0]).length?toHex(b32(C1[0]))+toHex(b32(C1[1])):'';
  return '04'+toHex(concat(b32(C1[0]),b32(C1[1]),C3,C2));
}
function sm2DecryptKey(wrapHex,privHex){let w=wrapHex.toLowerCase().startsWith('04')?wrapHex.slice(2):wrapHex;const C1=[BigInt('0x'+w.slice(0,64)),BigInt('0x'+w.slice(64,128))];const C3=w.slice(128,192);const C2=fromHex(w.slice(192));const d=BigInt('0x'+privHex);const xy=ptMul(d,C1);const x2=b32(xy[0]),y2=b32(xy[1]);const t=sm3kdf(concat(x2,y2),C2.length);const M=new Uint8Array(C2.length);for(let i=0;i<C2.length;i++)M[i]=C2[i]^t[i];return M;}
function sm2DerivePub(privHex){const d=BigInt('0x'+privHex);const P=ptMul(d,G);return toHex(b32(P[0]))+toHex(b32(P[1]));}

/* ===== random ===== */
function randomBytes(n){if(typeof globalThis!=='undefined'&&globalThis.crypto&&globalThis.crypto.getRandomValues){const b=new Uint8Array(n);globalThis.crypto.getRandomValues(b);return b;}const b=new Uint8Array(n);for(let i=0;i<n;i++)b[i]=Math.floor(Math.random()*256);return b;}

/* ===== turing hash64 (BigInt) ===== */
const M64=(1n<<64n)-1n;const TMUL=0xC6A4A7935BD1E995n;
function u64(v){return v&M64;}
function mix47(v){v=u64(v);return u64(v^(v>>47n));}
function turingHash64(data,seed){data=u8(data);const length=BigInt(data.length);let state=u64(u64(length*TMUL)^BigInt(seed>>>0));const blocks=data.length>>3;for(let i=0;i<blocks;i++){let word=0n;for(let j=7;j>=0;j--)word=(word<<8n)|BigInt(data[i*8+j]);word=u64(mix47(u64(word*TMUL))*TMUL);state=u64((word^state)*TMUL);}const tail=data.subarray(blocks*8);if(tail.length>=7)state^=BigInt(tail[6])<<48n;if(tail.length>=6)state^=BigInt(tail[5])<<40n;if(tail.length>=5)state^=BigInt(tail[4])<<32n;if(tail.length>=4)state^=BigInt(tail[3])<<24n;if(tail.length>=3)state^=BigInt(tail[2])<<16n;if(tail.length>=2)state^=0x118727C03FB9FFC6n&(BigInt(tail[1])<<8n);if(tail.length>=1){state^=BigInt(tail[0]);state=u64(state*TMUL);}state=mix47(state);state=u64(state*TMUL);return mix47(state);}

/* ===== XXTEA (Quarenden.a with embedded length) ===== */
const DELTA=0x9E3779B9;
function _xxteaKey(keyBytes){let material=keyBytes&&keyBytes.length?keyBytes:u8('DFG#$%^#%$RGHR(&*M<><');if(material.length>16)material=md5(material);const m=new Uint8Array(16);m.set(material.subarray(0,16));const dv=new DataView(m.buffer);return [dv.getUint32(0,true),dv.getUint32(4,true),dv.getUint32(8,true),dv.getUint32(12,true)];}
function _mx(sum,y,z,p,e,key){return (((((z>>>5)^((y<<2)>>>0))>>>0)+(((y>>>3)^((z<<4)>>>0))>>>0))>>>0 ^ ((((y^sum)>>>0)+((z^key[(p&3)^e])>>>0))>>>0))>>>0;}
function xxteaEncrypt(plain,keyBytes){if(!plain.length)return plain;const count=((plain.length/4)|0)+(plain.length%4===0?1:2);const values=new Array(count).fill(0);for(let i=0;i<plain.length;i++)values[i>>2]=(values[i>>2]|(plain[i]<<((i%4)*8)))>>>0;values[count-1]=plain.length;const n=count-1;const key=_xxteaKey(keyBytes);let rounds=6+((52/(n+1))|0);let total=0;let z=values[n];while(rounds){total=(total+DELTA)>>>0;const e=(total>>>2)&3;for(let p=0;p<n;p++){const y=values[p+1];values[p]=(values[p]+_mx(total,y,z,p,e,key))>>>0;z=values[p];}const y=values[0];values[n]=(values[n]+_mx(total,y,z,n,e,key))>>>0;z=values[n];rounds--;}const out=new Uint8Array(count*4);const dv=new DataView(out.buffer);for(let i=0;i<count;i++)dv.setUint32(i*4,values[i],true);return out;}

/* ===== RSA PKCS1 v1.5 (Turing public key) ===== */
const RSA_N=BigInt('0xb595f83a8a0ee3c16261addfc3353e7e13c73b762c3013f53225752a9fa8b0d0c33ed7f810f0a3bb323be5e6bef036eaf2e41e0975accd2a565161f573617492197904e0b30cbc9dd7aea2e079e1de3596dcf36ef444e1f3569987d737e7753e7367e893f9cf71ea661a6de3977199adcc6937dff6c1870297eb744d6473f8fb93367d17f3f51fe229e6c5424359c95985aa3ca18299334f6b1fa2d16198accc057d1e93b76fd385774fbf040453a9dfaa51b7ce6cc8778c6bc84148ec6e9213fadb4f96a4b84728953d4546d60c98b92fbf5cd5db079f4c90c968ac8ce3edeb2f0bde85e4e6399ca97b86faee15f1ef1296e8e0e2f88e6bde00c520bb871225');
const RSA_E=65537n;
function modpow(b,e,m){let r=1n;b%=m;while(e>0n){if(e&1n)r=(r*b)%m;e>>=1n;b=(b*b)%m;}return r;}
function rsaEncrypt(message){const size=256;const ps=size-message.length-3;const pad=new Uint8Array(ps);let f=0;while(f<ps){const r=randomBytes(ps);for(let i=0;i<r.length&&f<ps;i++)if(r[i]!==0)pad[f++]=r[i];}const enc=concat(new Uint8Array([0,2]),pad,new Uint8Array([0]),message);const c=modpow(BigInt('0x'+toHex(enc)),RSA_E,RSA_N);return b256(c,size);}
function b256(n,size){let h=n.toString(16).padStart(size*2,'0');return fromHex(h);}

/* ===== deflate (stored blocks) + zlib wrapper ===== */
function adler32(data){let a=1,b=0;for(let i=0;i<data.length;i++){a=(a+data[i])%65521;b=(b+a)%65521;}return ((b<<16)|a)>>>0;}
function zlibCompressStored(data){const parts=[new Uint8Array([0x78,0x01])];let i=0;while(i<data.length){const len=Math.min(65535,data.length-i);const last=(i+len>=data.length)?1:0;const hdr=new Uint8Array(5);hdr[0]=last;hdr[1]=len&0xff;hdr[2]=(len>>8)&0xff;hdr[3]=(~len)&0xff;hdr[4]=((~len)>>8)&0xff;parts.push(hdr,data.subarray(i,i+len));i+=len;}const ad=adler32(data);parts.push(new Uint8Array([(ad>>>24)&0xff,(ad>>>16)&0xff,(ad>>>8)&0xff,ad&0xff]));return concat(...parts);}


/* ==================== Turing 设备令牌 ==================== */
const REF_NATIVE = {"21":"0","108":"5","7":"","10":"5939.59,5939.59","105":"100","14":"1080*2154","101":"0","152":"0","103":"0","104":"2","33":"33","11":"type=1:name=Goldfish 3-axis Accelerometer:vendor=The Android Open Source Project:resolution=2.480159E-4:,type=4:name=Goldfish 3-axis Gyroscope:vendor=The Android Open Source Project:resolution=0.001:,type=2:name=Goldfish 3-axis Magnetic field sensor:vendor=The Android Open Source Project:resolution=0.5:,type=5:name=Goldfish Light sensor:vendor=The Android Open Source Project:resolution=1.0:,type=6:name=Goldfish Pressure sensor:vendor=The Android Open Source Project:resolution=1.0:,","24":"sdk_gphone64_arm64","12":"","23":"google","8":"google/sdk_gphone64_arm64/emu64a:13/TE1A.240213.009/12342917:userdebug/dev-keys","13":"1000.0","25":"13","20":"0","100":"","22":"","102":"0","106":"","115":"","113":"0","114":"0","44":"","35":"","42":"Google","107":"com.sgcc.wsgw.cn_DAB5608ECD1ABEF80E5FA277CF3B8D50","200":"32,2,3,4,36,5,6,40,136,43,45,143,144,10002,19,10003","116":"","117":"1","45":"","118":"v4;-1_v6;-1","120":"rwxp;/apex/com.android.art/lib64/libart.so,rwxp;/apex/com.android.runtime/lib64/bionic/libdl.so,rwxp;/system/lib64/libz.so","121":"","122":"","135":"tmpfs:/dev:tmpfs:rw&seclabel&nosuid&relatime&mode=755,tmpfs:/mnt:tmpfs:rw&seclabel&nosuid&nodev&noexec&relatime&mode=755&gid=1000,/dev/fuse:/mnt/installer/0/emulated:fuse:rw&lazytime&nosuid&nodev&noexec&noatime&user_id=0&group_id=0&allow_other,/dev/block/platform/a003c00.virtio_mmio/by-name/metadata:/metadata:ext4:rw&seclabel&nosuid&nodev&noatime,tmpfs:/apex:tmpfs:rw&seclabel&nosuid&nodev&noexec&relatime&mode=755,tmpfs:/apex/apex-info-list.xml:tmpfs:rw&seclabel&nosuid&nodev&noexec&relatime&mode=755,/dev/fuse:/storage/emulated:fuse:rw&lazytime&nosuid&nodev&noexec&noatime&user_id=0&group_id=0&allow_other,tmpfs:/data/data:tmpfs:rw&seclabel&nosuid&nodev&noexec&relatime&mode=751,tmpfs:/data/user:tmpfs:rw&seclabel&nosuid&nodev&noexec&relatime&mode=751,tmpfs:/data/user_de:tmpfs:rw&seclabel&nosuid&nodev&noexec&relatime&mode=751,tmpfs:/data/misc/profiles/cur:tmpfs:rw&seclabel&nosuid&nodev&noexec&relatime&mode=751,tmpfs:/data/misc/profiles/ref:tmpfs:rw&seclabel&nosuid&nodev&noexec&relatime&mode=751,/dev/block/loop::13,/dev/block/dm::71","124":"","131":"0,0,Built-in Screen,1080x2220,131,1,0,","137":"-8233870966039513836:enforcing,7247450386580705748:0,3920320800439300925:T-Mobile","133":"android.content.pm.IPackageManager$Stub$Proxy,,","140":"0,0,,0,,","138":"5,1","149":"en-US","150":"Asia/Shanghai","151":"310260","9":"/dev/block/dm-0:802660,tmpfs:1006268,tmpfs:1006268,/dev/block/dm-4:98620,/dev/block/dm-3:2122372,/dev/block/dm-2:175392,tmpfs:1006268,/dev/block/loop4:784,","15":"Ring_Synth_04.ogg","46":"0","51":""};
const JAVA_CONST = {"2013":"/dev/qemu_pipe,/dev/vboxguest,/dev/vboxuser,/system/framework/org.lineageos.platform-res.apk,/system/lib/ccc,/dev/socket/baseband_genyd,/sys/class/misc/vboxguest,/system/priv-app/CMSettingsProvider,/system/lib64/ccc,/ueventd.ttVM_x86.rc,/init.ttVM_x86.rc,/system/lib/hw/sensors.vbox86.so,/hmdocker,/system/lib/libnemuVMprop.so,/system/bin/magiskpolicy,/system/bin/qemud,/ueventd.vbox86.rc,/system/bin/androVM_setprop,/dev/socket/genyd,/sys/module/vboxguest,/system/priv-app/LineageSettingsProvider,/system/lib/hw/gps.vbox86.so,/system/etc/init.buildroid.sh,/system/lib/hw/audio.primary.vbox86.so,/sys/qemu_trace,/sys/class/misc/vboxuser,/system/bin/mount.nemusf,/ueventd.andy.rc,/system/priv-app/vmos-pro-intent,/sys/module/vboxvideo,/system/lib/hw/gralloc.vbox86.so,/proc/device-tree/goldfish_pipe@a060000,/system/addon.d/50-lineage.sh,/system/priv-app/romex,/system/lib64/arm64/nb/libc.so,/dev/socket/qemud,/data/.bluestacks.prop,/ueventd.android_x86.rc,/.dockerenv,/system/bin/magisk,/system/lib64/libc.so,/system/lib64/.aa,/fstab.andy,/dev/apksafe_pipe,/fstab.vbox86,/ueventd.nox.rc,/init.nox.rc,/system/app/DotPapers,/system/lib/.aa,/init.goldfish.rc,/x86.prop,/dev/mumuvmmguest,/dev/mumuvmmuser,/proc/device-tree/virtio_mmio@a000000,/system/bin/nemuVM-nemu-service,/sys/module/vboxsf,/dev/goldfish_pipe,/system/lib/hw/camera.vbox86.so,/system/priv-app/MuMuAudio,/sys/devices/virtual/misc/vboxguest,/system/bin/androVM-prop,/sys/devices/virtual/misc/vboxuser,/system/addon.d/99-magisk.sh,/fstab.nox,/system/lib64/libriruloader.so,/fstab.ttVM_x86,/system/etc/mumu-configs,/init.vbox86.rc","2016":"com/wind/xpatch/proxy/XpatchProxyApplication,de/robv/android/xposed/XposedHelpers,com/wind/xposed/entry/XposedModuleEntry,com/bug/fuck/fuck","2017":"ro.boot.flash.locked,ro.boot.vbmeta.device_state,ro.boot.verifiedbootstate,ro.boot.veritymode,ro.boot.warranty_bit,ro.debuggable,ro.secure,ro.secureboot.lockstate,ro.vendor.boot.warranty_bit,ro.vendor.warranty_bit,ro.warranty_bit,vendor.boot.vbmeta.device_state,ro.lineage.device,ro.dotOS.device,ro.dalvik.vm.native.bridge,nemud.player_package,init.svc.nemuinit"};
const PKG='com.sgcc.wsgw.cn',CHANNEL='10000191',BUILD_MARKER='77F2B17A00A92C71';
/* ===== JCE writer ===== */
class Jce{constructor(){this.b=[];}
  head(tag,t){if(tag<15)this.b.push((tag<<4)|t);else{this.b.push(0xF0|t,tag);}}
  zero(tag){this.head(tag,12);}
  byte(tag,v){v=Number(v);if(v===0)this.zero(tag);else{this.head(tag,0);this.b.push(v&0xff);}}
  short(tag,v){v=Number(v);if(v>=-128&&v<=127)this.byte(tag,v);else{this.head(tag,1);this.b.push((v>>8)&0xff,v&0xff);}}
  int32(tag,v){v=Number(v);if(v>=-32768&&v<=32767)this.short(tag,v);else{this.head(tag,2);this.b.push((v>>>24)&0xff,(v>>>16)&0xff,(v>>>8)&0xff,v&0xff);}}
  int64(tag,v){const n=BigInt(v);if(n>=-2147483648n&&n<=2147483647n)this.int32(tag,Number(n));else{this.head(tag,3);let x=BigInt.asUintN(64,n);const o=[];for(let i=0;i<8;i++){o.unshift(Number(x&0xffn));x>>=8n;}this.b.push(...o);}}
  string(tag,v){const raw=typeof v==='string'?u8(v):v;if(raw.length<=255){this.head(tag,6);this.b.push(raw.length);}else{this.head(tag,7);const l=raw.length;this.b.push((l>>>24)&0xff,(l>>>16)&0xff,(l>>>8)&0xff,l&0xff);}for(let i=0;i<raw.length;i++)this.b.push(raw[i]);}
  mapIntStr(tag,entries){this.head(tag,8);this.int32(0,entries.length);for(const [k,v] of entries){this.int32(0,k);this.string(1,v);}}
  struct(tag,fields){this.head(tag,10);for(let i=0;i<fields.length;i++)this.b.push(fields[i]);this.head(0,11);}
  finish(){return new Uint8Array(this.b);}
}
/* ===== profile ===== */
const JAVA_PERF_ORDER=[133,138,140,-17,17,145,146,149,22,150,151,24,100,101,102,103,104,105,106,107,44,113,114,115,116,117,118,120,122,'s9'];
const JAVA_PERF_REF={133:0,138:1,140:0,'-17':0,17:1,145:0,146:0,149:0,22:1,150:0,151:0,24:0,100:6,101:114,102:0,103:0,104:0,105:0,106:3,107:0,44:0,113:2,114:1,115:1,116:0,117:0,118:0,120:8,122:0,s9:1};
const NATIVE_PERF_ORDER=[21,7,10,14,33,11,24,12,23,8,13,25,20,35,42,121,135,124,125,129,131,134,132,137,142,141,9,15,16];
const NATIVE_PERF_REF={21:1,7:0,10:3,14:0,33:0,11:0,24:0,12:0,23:0,8:0,13:0,25:0,20:0,35:0,42:0,121:1,135:2,124:0,125:0,129:0,131:0,134:0,132:0,137:1,142:0,141:0,9:16,15:0,16:0};
const PROC_TPL=[[-1,3,1000,17,0,438,3],[-1,1,0,20,0,493,3],[1,1,1000,1864,1036632,420,2],[-1,1,0,20,0,493,2],[1,3,1000,17,0,438,3],[1,1,null,19,0,292,6],[-1,1,null,19,0,292,6]];
function b64(bytes){const A='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';let s='';let i=0;for(;i+2<bytes.length;i+=3){const n=(bytes[i]<<16)|(bytes[i+1]<<8)|bytes[i+2];s+=A[(n>>18)&63]+A[(n>>12)&63]+A[(n>>6)&63]+A[n&63];}if(i<bytes.length){const n=(bytes[i]<<16)|((i+1<bytes.length?bytes[i+1]:0)<<8);s+=A[(n>>18)&63]+A[(n>>12)&63]+(i+1<bytes.length?A[(n>>6)&63]:'=')+'=';}return s;}
function b64url(bytes){return b64(bytes).replace(/\+/g,'-').replace(/\//g,'_');}
function b64dec(s){const A='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';s=s.replace(/=+$/,'');const out=[];let buf=0,bits=0;for(const ch of s){buf=(buf<<6)|A.indexOf(ch);bits+=6;if(bits>=8){bits-=8;out.push((buf>>bits)&0xff);}}return new Uint8Array(out);}

class Profile{
  constructor(seed,boot,install){this.seed=seed;this.boot=boot;this.install=install;this._c={};}
  bytes(label,size=32){const key=label+'|'+size;if(this._c[key])return this._c[key];const out=[];let ctr=0;while(out.length<size){const c=new Uint8Array(4);new DataView(c.buffer).setUint32(0,ctr);const d=hmacSha256(this.seed,concat(u8('wsgw-turing-profile-v1\0'+label),c));for(const x of d)out.push(x);ctr++;}const r=new Uint8Array(out.slice(0,size));this._c[key]=r;return r;}
  hex(label,size=16){return toHex(this.bytes(label,size));}
  integerBig(label,lo,hi){lo=BigInt(lo);hi=BigInt(hi);const v=BigInt('0x'+toHex(this.bytes(label,8)));return lo+v%(hi-lo+1n);}
  integer(label,lo,hi){return Number(this.integerBig(label,lo,hi));}
  reqInt(label,ts,lo,hi){return this.integer(`request:${ts}:${label}`,lo,hi);}
  uuid(label){const v=Array.from(this.bytes(label,16));v[6]=(v[6]&0x0f)|0x40;v[8]=(v[8]&0x3f)|0x80;const h=toHex(v);return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;}
  identity(){if(this._id)return this._id;const mac=Array.from(this.bytes('wifi-mac',6));mac[0]=(mac[0]&0xfe)|0x02;this._id={profile_id:this.uuid('profile-id'),android_id:this.hex('android-id',8),oaid:this.uuid('oaid'),brand:'google',model:'sdk_gphone64_arm64',release:'13',package_name:PKG,channel:CHANNEL};return this._id;}
  timing(label,ts,ref){if(ref<=0)return 0;const radius=Math.max(1,Math.floor(ref/4));const digits=String(ref).length;const lo=digits>1?10**(digits-1):0;const hi=10**digits-1;return this.reqInt(`timing:${label}`,ts,Math.max(lo,ref-radius),Math.min(hi,ref+radius));}
  javaPerf(ts){return JAVA_PERF_ORDER.map(f=>`${f}_${this.timing(String(f),ts,JAVA_PERF_REF[String(f)])}`).join(',');}
  directPerf(ts){const s=NATIVE_PERF_ORDER.map(f=>`${f}_${this.timing('native-'+f,ts,NATIVE_PERF_REF[f])}`).join(',');return `${this.javaPerf(ts)},${s}`;}
  nativeMap(cur){const id=this.identity();const boot=this.boot;const uid=this.integer('uid',10000,19999);const install=this.install;
    const ia=b64url(this.bytes('install-a',16));const ib=b64url(this.bytes('install-b',16)).replace(/=+$/,'')+'=';
    const ictx=`1:1:${uid}:${install}:${id.package_name}::${this.integer('install-slot',100000000,999999999)}:app/~~${ia}/-${ib},`;
    const pe=PROC_TPL.map((t,i)=>{const [sign,kind,ownerV,a,b,c,md]=t;const mag=this.integerBig(`process-hash-${i}`,'1000000000000000000','9000000000000000000');const ph=mag*BigInt(sign);const owner=ownerV==null?uid:ownerV;const metric=this.reqInt(`process-metric-${i}`,cur,10**(md-1),10**md-1);return `${ph}:${kind}:${owner}_${a}_${b}_${c}_${metric}`;});
    const iid=this.hex('interface-id',3);
    const net=`8,eth0;69699;3;fe80::5054:ff:fe${iid.slice(0,2)}:${iid.slice(2)};fec0::5054:ff:fe${iid.slice(0,2)}:${iid.slice(2)};10.0.2.15,dummy0;65731;1;fe80::8c95:a4ff:fe59:322`;
    const lat=this.reqInt('collection-latency',cur,8000,16000);
    const v={};for(const k of Object.keys(REF_NATIVE))v[k]=String(REF_NATIVE[k]);
    Object.assign(v,{16:id.android_id,17:ictx,26:this.hex('native-device-id',16),34:`C:1,T:${cur},LT:${lat}`,125:pe.join(','),126:String(boot),129:net,141:String(this.integer('native-property-141',1000000,9999999)),146:'1,272494655,eth0,10.0.2.15,10.0.2.3',148:id.oaid});
    return v;}
  featureMap(cur,code,nonce){const id=this.identity();const n=this.nativeMap(cur);const st=[0,1,2].map(i=>this.reqInt(`stage-${i}`,cur,1000,2200));
    return {1:id.channel,4:this.javaPerf(cur),205:n[22],210:n[34],240:n[44],250:n[100],251:n[101],252:n[102],253:n[103],254:n[104],255:n[105],256:n[106],257:n[107],258:n[113],259:n[114],264:n[24],266:n[45],267:n[17],268:n[115],269:n[116],270:n[117],271:n[46],272:n[118],273:'',279:n[120],280:n[122],281:n[126],282:n[138],284:n[146],285:n[149],286:n[150],287:n[151],288:n[152],303:`5_1_${code}_${st.join('_')}`,308:'1',309:'',402:'',406:'',2001:n[200],2005:'0',2013:JAVA_CONST['2013'],2016:JAVA_CONST['2016'],2017:JAVA_CONST['2017'],2018:String(this.integer('uid',10000,19999)),2019:n[133],2021:n[140],2029:'0',3001:String(code),3002:'1',3004:nonce,3005:'1'};}
}
function hashTags(entries,ts){const parts=entries.map(([,v])=>String(v));let st=BigInt(ts);for(let i=0;i<Math.floor((entries.length+3)/4);i++){st=((st*214013n+2531011n)>>16n)&0x7FFFn;parts.push(st.toString(16));}const d=turingHash64(u8(parts.join('')),0).toString(16);return ['01'+d,d];}
function buildM90(p,ts,nonce){const code=-22056;const id=p.identity();const f=p.featureMap(ts,code,nonce);const nm=p.nativeMap(ts);
  const nested=Object.keys(nm).map(k=>[Number(k),nm[k]]).sort((a,b)=>a[0]-b[0]);
  const [t10,t12]=hashTags(nested,ts);const uid=f[2018];const proc=`${id.package_name}:tools,${uid},untrusted_app,${uid},,init`;
  const o=new Jce();o.int64(0,ts);
  const meta=new Jce();meta.int32(0,90);meta.string(1,'90');meta.string(2,BUILD_MARKER);meta.string(3,CHANNEL);meta.int32(4,2);o.struct(1,meta.finish());
  o.mapIntStr(2,nested);
  const net=new Jce();net.string(0,'3.2.3,113');net.string(1,id.package_name);o.struct(3,net.finish());
  o.mapIntStr(5,[[3,f[303]],[8,f[308]],[9,f[309]],[7,proc],[10,t10],[12,t12],[4,p.directPerf(ts)]]);
  o.mapIntStr(6,[[2,'']]);
  const tail=new Jce();tail.string(0,'');tail.string(2,'');tail.int32(3,0);tail.string(4,'');tail.string(5,'');o.struct(8,tail.finish());
  const nb=o.finish();
  const w=new Jce();w.mapIntStr(0,[[2,id.model],[1,id.brand],[3,id.channel],[4,id.package_name]]);w.int64(1,ts);w.int32(2,1);w.struct(4,nb);w.int32(5,code);w.string(6,String(code));w.string(7,nonce);
  return {m90:w.finish(),nested:nb,tags:[t10,t12]};}
const ALNUM='0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
function randStr(n,alpha=ALNUM){const r=randomBytes(n*2);let s='';for(let i=0;i<n;i++)s+=alpha[((r[i*2]<<8)|r[i*2+1])%alpha.length];return s;}
function deviceToken(p,ts){const nonce=randStr(32);const {m90}=buildM90(p,ts,nonce);const key=u8(randStr(16));const comp=zlibCompressStored(concat(new Uint8Array([2]),m90));const cipher=xxteaEncrypt(comp,key);return {token:'v3:'+b64(concat(new Uint8Array([1]),rsaEncrypt(key),cipher)),time:String(ts).slice(0,10),ts};}

const SG_BASE = 'https://csc-service.sgcc.com.cn:28630/';
const SERVER_PUB = '0409C10D38CF7B4E28097EAAA519E3157C9B4E72194CD13BD11932CE40ED5624AFEFF27F78893E4C4FC2029DA147AB6CEAE0CDC8E3A547EFCDC5AB91757FE1CA60';
const CLIENT_PRIV = '50C4AF48DF75808050729977AA6BC127DC21A404755C660B94222F9D50FA4A75';
const P_LOGIN = 'emss-uia-center-front/member/c2/f01';
const P_SMS = 'emss-uia-center-front/member/c1/f01';
const P_DAILY = 'emss-bia-bill-front/member/c11/f01';
const P_MONTH = 'emss-bia-bill-front/member/c51/f04';
const P_BAL = 'emss-bia-balance-front/member/c16/f01';
const CHECK_KEY = 'LNPO+ISJ+QeqNemFK+3OMUdexSn2i6pB';

class SgError extends Error { constructor(code, msg) { super(msg ? `${msg}` : code); this.code = String(code || ''); } }

function cnNow() { const d = new Date(Date.now() + 8 * 3600000); const p = (n, l = 2) => String(n).padStart(l, '0'); return { s14: `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`, ms: p(d.getUTCMilliseconds(), 3), y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() }; }
function reqTimestamp() { const n = cnNow(); return n.s14 + n.ms + randStr(6, '0123456789'); }
function appGuidNew() { const n = cnNow(); return randStr(40, 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') + n.s14 + n.ms + String(100 + (randomBytes(2)[0] * 256 + randomBytes(1)[0]) % 900); }

function javaHash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) >>> 0; return h; }
function hashMapOrder(v) {
  if (Array.isArray(v)) return v.map(hashMapOrder);
  if (v && typeof v === 'object') {
    const buckets = {};
    Object.keys(v).forEach((k) => { let h = javaHash(k); h = (h ^ (h >>> 16)) >>> 0; const b = h & 15; (buckets[b] = buckets[b] || []).push(k); });
    const o = {};
    Object.keys(buckets).map(Number).sort((a, b) => a - b).forEach((b) => buckets[b].forEach((k) => { o[k] = hashMapOrder(v[k]); }));
    return o;
  }
  return v;
}
function loginMd5(params) { return md5hex(Object.keys(params).sort().map((k) => k + JSON.stringify(hashMapOrder(params[k]))).join('')); }

function checkCode(account) {
  let r = 0n; const rb = randomBytes(8); for (const b of rb) r = (r << 8n) | BigInt(b); r &= (1n << 63n) - 1n;
  return String(r).padStart(24, '0') + toHex(aes256EcbEncrypt(u8(`${account}${Date.now()}`), u8(CHECK_KEY)));
}
function uscInfo(dev) { return { isEncrypt: 'false', devciceIp: '127.0.0.1', devciceId: '000000', tenant: 'state_grid', member: '2202', optSys: 'Android 13', operatorType: '', devciceName: 'sdk_gphone64_arm64', pushId: '000000,000000' }; }
function loginParams(account, password, code, codeKey) {
  return {
    quInfo: { code: code || '', codeKey: codeKey || '', account, password: md5hex(password), optSys: 'Android', pushId: '000000,000000', addressCity: '', addressProvince: '', addressRegion: '' },
    uscInfo: uscInfo(),
    checkCode: checkCode(account),
    avalonValidCode: '',
  };
}


class SgApp {
  constructor(ctx, user, pass) { this.ctx = ctx; this.user = user; this.pass = pass; this.policy = clean((ctx.env || {}).SGCC_POLICY) || 'DIRECT'; this.dev = null; this.sess = null; }
  st(k, v) { try { if (v === undefined) return this.ctx.storage.getJSON(k); this.ctx.storage.setJSON(k, v); } catch (_) { return null; } return null; }
  device() {
    if (this.dev) return this.dev;
    let s = this.st(K.dev);
    if (!s || !s.seed) {
      const now = Date.now();
      const boot = now - 3600000 - Math.floor(Math.random() * (86400000 * 14 - 3600000));
      s = { seed: b64(randomBytes(32)), boot, install: boot - 86400000 - Math.floor(Math.random() * 86400000 * 179) };
    }
    const prof = new Profile(b64dec(s.seed), s.boot, s.install);
    if (!s.tok || Date.now() - s.tok.ts > 4 * 3600000) s.tok = deviceToken(prof, Date.now());
    this.st(K.dev, s);
    this.dev = { s, guid: appGuid(prof) };
    return this.dev;
  }
  headers(loginP, authed) {
    const d = this.device();
    const h = {
      'Content-Type': 'application/json; charset=UTF-8',
      timeStamp: loginP ? cnNow().s14 : reqTimestamp(),
      t: authed ? this.sess.token : '',
      userid: authed ? this.sess.userId : '0',
      AppGuid: d.guid, AppGuidNew: appGuidNew(), security: 'android', appcode: 'WSGW-SG1001-APP', datacenter: '99', AccessMethod: 'App',
      deviceTokenTX: d.s.tok.token, deviceTokenTXTime: d.s.tok.time,
      province: authed ? (this.sess.province || '') : '',
      version: '3.2.3', wsgwType: 'android', ip: '127.0.0.1', os: 'android', 'User-Agent': 'okhttp/3.14.9',
    };
    if (loginP) h.md5 = loginMd5(loginP);
    return h;
  }
  async post(path, payload, { authed = false, loginP = null } = {}) {
    const key = toHex(randomBytes(16));
    const ts = String(Date.now());
    const data = sm4EncryptHex(JSON.stringify(payload), key);
    const skey = sm2EncryptKey(key, SERVER_PUB);
    const body = JSON.stringify({ data, sign: sm3hex(skey + data + ts), skey, timestamp: ts });
    const req = { headers: this.headers(loginP, authed), body, timeout: 20000 };
    if (this.policy) req.policy = this.policy;
    let text;
    try { const r = await this.ctx.http.post(SG_BASE + path, req); text = await r.text(); if (r.status >= 500) throw new Error('HTTP ' + r.status); }
    catch (e) { throw new SgError('net', '连不上国网服务器：' + ((e && e.message) || e)); }
    let outer; try { outer = JSON.parse(text); } catch (_) { throw new SgError('net', '国网返回了无法识别的内容'); }
    if (!outer.respKey || !outer.encryptData) throw new SgError(outer.code || 'net', outer.message || '国网返回异常');
    const k2 = utf8dec(sm2DecryptKey(String(outer.respKey), CLIENT_PRIV));
    return JSON.parse(utf8dec(sm4DecryptHex(String(outer.encryptData), k2)));
  }
  static check(resp) {
    const top = String(resp.code == null ? '' : resp.code);
    const d = resp.data && typeof resp.data === 'object' ? resp.data : {};
    const srv = d.srvrt && typeof d.srvrt === 'object' ? d.srvrt : null;
    const code = srv ? String(srv.resultCode || '') : top;
    const msg = (srv && srv.resultMessage) || resp.message || '';
    if (srv && code && code !== '0000') throw new SgError(code, msg);
    if (!srv && top && top !== '1') throw new SgError(top, msg);
    return d;
  }
  async login(code, codeKey) {
    const p = loginParams(this.user, this.pass, code, codeKey);
    const resp = await this.post(P_LOGIN, p, { loginP: p });
    const d = SgApp.check(resp);
    const biz = d.bizrt || {};
    if (!biz.token) throw new SgError('auth', '登录没有返回凭证');
    let ui = biz.userInfo; if (Array.isArray(ui)) ui = ui.find((x) => x && typeof x === 'object') || {}; ui = ui || {};
    const life = Number(biz.tokenExpireTime) || 1296000;
    this.sess = { user: this.user, token: String(biz.token), userId: String(ui.userId || biz.userId || '0'), province: clean(ui.addressProvince), exp: Date.now() + Math.max(300, life) * 1000, accounts: (Array.isArray(ui.powerUserList) ? ui.powerUserList : []).map(acctOf).filter(Boolean) };
    this.st(K.sess, this.sess);
    return this.sess;
  }
  async sendDeviceSms() {
    const resp = await this.post(P_SMS, { uscInfo: { tenant: 'state_grid', member: '2202', devciceId: '000000', devciceName: 'sdk_gphone64_arm64', devciceIp: '127.0.0.1' }, quInfo: { voiceCodeFlag: false, account: this.user, sendType: 0, businessType: 'logindevice' } });
    const d = SgApp.check(resp);
    const ck = d.bizrt && d.bizrt.codeKey;
    if (!ck) throw new SgError('sms', '验证码发送失败');
    return String(ck);
  }
  async ensure() {
    const s = this.st(K.sess);
    if (s && s.user === this.user && s.token && s.exp > Date.now() + 300000) { this.sess = s; return s; }
    const env = this.ctx.env || {};
    const sms = clean(env.SGCC_SMS).replace(/\D/g, '');
    const pend = this.st(K.sms);
    const pendOk = pend && pend.user === this.user && Date.now() - pend.ts < 15 * 60000;
    if (pendOk && sms.length === 6 && sms !== pend.used) {
      this.st(K.sms, { ...pend, used: sms });
      return this.login(sms, pend.codeKey);
    }
    try { return await this.login(); }
    catch (e) {
      if (e.code !== '4006') throw e;
      if (!pendOk || Date.now() - pend.ts > 5 * 60000) {
        const codeKey = await this.sendDeviceSms();
        this.st(K.sms, { user: this.user, codeKey, ts: Date.now(), used: sms });
      }
      throw new SgError('4006', `国网要验证新设备：验证码已发到 ${this.user.slice(0, 3)}****${this.user.slice(-4)}，填到模块「短信验证码」里保存，再刷新小组件`);
    }
  }
  async authed(path, payload) {
    await this.ensure();
    for (let i = 0; i < 2; i++) {
      const resp = await this.post(path, payload, { authed: true });
      try { return SgApp.check(resp); }
      catch (e) {
        if (!['-200', '-201'].includes(e.code) || i) throw e;
        this.st(K.sess, {}); this.sess = null; await this.ensure();
      }
    }
    return {};
  }
}

function acctOf(v) {
  if (!v || typeof v !== 'object') return null;
  const f = (...ks) => { for (const k of ks) if (v[k] != null && v[k] !== '') return String(v[k]); return ''; };
  const consNo = f('powerUserNo', 'consNo');
  if (!consNo) return null;
  const src = f('powerUserNo_dst', 'consNo_dst') || consNo;
  return { consNo, src, pro: f('proNo', 'provinceId'), org: f('orgNo'), elec: f('elecType', 'constType'), name: f('consName', 'userName', 'nickname'), orgName: f('orgName') };
}
function consType(a) { return a.elec === '04' || (a.elec === '02' && a.pro === '11102') ? '02' : '01'; }
function ymd(y, m, d) { return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`; }
function monthRange(y, m) { return [ymd(y, m, 1), ymd(y, m, new Date(Date.UTC(y, m, 0)).getUTCDate())]; }

async function queryAccount(app, a) {
  const n = cnNow();
  const daily = [];
  let monthTotal = NaN;
  for (let off = 0; off < 2; off++) {
    let y = n.y, m = n.m - off; if (m < 1) { m += 12; y -= 1; }
    const [s, e] = monthRange(y, m);
    try {
      const d = await app.authed(P_DAILY, { serviceCode: 'BCP_000026', source: 'app', target: a.pro, data: { acctId: 'acctid01', channelCode: 'SGAPP', consNo: a.src, consNosrc: a.src, endTime: e, consType: consType(a), funcCode: 'ALIPAY_01', orgNo: a.org, proCode: a.pro, promotCode: '1', promotType: '1', serialNo: '', srvCode: '', startTime: s, userName: 'acctid01' } });
      (Array.isArray(d.sevenEleList) ? d.sevenEleList : []).forEach((x) => daily.push({ day: x.day, dayElePq: x.dayElePq }));
      if (off === 0) monthTotal = num(d.totalPq);
    } catch (e) { if (off === 0 && !daily.length) throw e; }
  }
  let bills = [], yearPq = NaN, yearAmt = NaN;
  for (const y of [n.y, n.y - 1]) {
    try {
      const d = await app.authed(P_MONTH, { serviceCode: 'BCP_000026', source: 'app', target: a.pro, data: { year: y, consNo: a.src, provinceCode: a.pro, startYm: `${y}01`, endYm: `${y}12`, funcCode: 'ALIPAY_01' } });
      const raw = Array.isArray(d.list) ? d.list : Array.isArray(d.mothEleList) ? d.mothEleList : [];
      const list = raw.map((x) => {
        const ele = Array.isArray(x.eleList) ? x.eleList : [];
        let use = num(x.monthPq != null ? x.monthPq : x.monthEleNum != null ? x.monthEleNum : x.pq);
        if (!Number.isFinite(use) && ele.length) use = ele.reduce((s, i) => s + (num(i.pq) || 0), 0);
        let cost = num(x.monthAmt != null ? x.monthAmt : x.monthEleCost != null ? x.monthEleCost : x.amt);
        if (!Number.isFinite(cost) && ele.length) cost = ele.reduce((s, i) => s + (num(i.amt) || 0), 0);
        return { month: clean(x.ym || x.month).replace(/\D/g, '').slice(0, 6), monthEleNum: use, monthEleCost: cost };
      }).filter((x) => x.month.length === 6);
      if (y === n.y) { yearPq = num(d.yearPq); yearAmt = num(d.yearAmt); if (!Number.isFinite(yearPq) && list.length) yearPq = list.reduce((s, x) => s + (x.monthEleNum || 0), 0); if (!Number.isFinite(yearAmt) && list.length) yearAmt = list.reduce((s, x) => s + (x.monthEleCost || 0), 0); }
      bills = list.concat(bills);
      if (list.length && y === n.y && n.m > 1) break;
    } catch (e) { if (['-200', '-201', '4006', 'RK008'].includes(e.code)) throw e; break; }
  }
  let bal = null;
  try {
    const d = await app.authed(P_BAL, { serviceCode: '0101143', source: 'app', target: a.pro, data: { srvCode: '', serialNo: '', channelCode: '0902', funcCode: 'A1007200', acctId: app.sess.userId, userName: 'acctid01', promotType: '1', promotCode: '1', userAccountId: app.sess.userId, list: [{ consNoSrc: a.src, proCode: a.pro, sceneType: a.elec, consNo: a.consNo, orgNo: a.org }] } });
    bal = (Array.isArray(d.list) ? d.list : []).find((x) => x && typeof x === 'object') || null;
  } catch (e) { if (['-200', '-201', '4006', 'RK008'].includes(e.code)) throw e; }
  // 转成和原兼容层一致的结构，界面层不用改
  let sumMoney = NaN, owe = 0;
  if (bal) {
    const sm = num(bal.sumMoney), ab = num(bal.accountBalance), pb = num(bal.prepayBal);
    if (String(bal.consType) === '1') sumMoney = Number.isFinite(sm) ? sm : pb;
    else if (sm > 0) { sumMoney = -sm; owe = sm; }
    else sumMoney = ab > 0 ? ab : pb > 0 ? pb : (Number.isFinite(sm) ? 0 : NaN);
    if (num(bal.historyOwe) > 0) owe = num(bal.historyOwe);
  }
  return {
    userInfo: { consNo_dst: a.src, consName_dst: a.name, orgName: a.orgName, proNo: a.pro },
    eleBill: { sumMoney, historyOwe: owe, prepayBal: bal ? num(bal.prepayBal) : NaN, date: bal ? clean(bal.date || bal.amtTime) : '' },
    dayElecQuantity31: { sevenEleList: daily },
    monthElecQuantity: { mothEleList: bills, dataInfo: { totalEleNum: yearPq, totalEleCost: yearAmt } },
    monthTotal,
  };
}

async function runSgcc(ctx, username, password) {
  const app = new SgApp(ctx, username, password);
  const s = await app.ensure();
  const accts = s.accounts || [];
  if (!accts.length) return [];
  // 多户号：一次查全，全部缓存；各小组件实例用 SGCC_ACCOUNT 各自挑选
  const results = [];
  for (const a of accts) {
    try {
      results.push(await queryAccount(app, a));
    } catch (e) {
      // 单个户号失败不影响其他户号
      console.log(`户号 ${a.consNo} 查询失败: ${(e && e.message) || e}`);
    }
  }
  if (!results.length) throw new Error('所有户号都查询失败');
  return results;
}

/* ==================== 解析 ==================== */


function pickAccount(list, want) {
  if (!Array.isArray(list) || !list.length) return null;
  const w = clean(want);
  if (w && !/^all$/i.test(w)) {
    const hit = list.find((x) => { const u = x.userInfo || {}; return [u.consNo_dst, u.consNo, u.consNoSrc].some((v) => clean(v).endsWith(w)); });
    if (hit) return hit;
  }
  return list[0];
}

// 多户号模式：SGCC_ACCOUNT填all时返回全部户号
function pickAccounts(list, want) {
  if (!Array.isArray(list) || !list.length) return [];
  if (/^all$/i.test(clean(want))) return list;
  const one = pickAccount(list, want);
  return one ? [one] : [];
}

function accLabel(p) {
  const tail = p.consNo ? p.consNo.replace(/\D/g, '').slice(-4) : '';
  return p.name || (tail ? `尾号${tail}` : '户号');
}

function dayKey(s) {
  const d = clean(s).replace(/\D/g, '');
  return d.length >= 8 ? d.slice(0, 8) : '';
}

function parse(acc, env) {
  const u = acc.userInfo || {};
  const bill = acc.eleBill || {};
  const dq = acc.dayElecQuantity31 || acc.dayElecQuantity || {};
  const mq = acc.monthElecQuantity || {};
  const days = (Array.isArray(dq.sevenEleList) ? dq.sevenEleList : [])
    .map((x) => ({ key: dayKey(x.day), v: num(x.dayElePq) }))
    .filter((x) => x.key && Number.isFinite(x.v) && x.v >= 0)
    .sort((a, b) => (a.key < b.key ? -1 : 1));
  const uniq = [];
  days.forEach((x) => { if (!uniq.length || uniq[uniq.length - 1].key !== x.key) uniq.push(x); });
  const now = new Date();
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const monthDays = uniq.filter((x) => x.key.startsWith(ym));
  const months = (Array.isArray(mq.mothEleList) ? mq.mothEleList : Array.isArray(mq.monthEleList) ? mq.monthEleList : [])
    .map((x) => ({ key: clean(x.month).replace(/\D/g, '').slice(0, 6), v: num(x.monthEleNum), cost: num(x.monthEleCost) }))
    .filter((x) => x.key && Number.isFinite(x.v))
    .sort((a, b) => (a.key < b.key ? -1 : 1));
  const lastMonth = months.filter((x) => x.key < ym).pop() || null;
  const sum = num(bill.sumMoney);
  const owe = num(bill.historyOwe) > 0 || sum < 0;
  const last = uniq[uniq.length - 1] || null;
  const info = mq.dataInfo || {};
  // 阶梯电价（年度累计）：已出账月份 + 还没出账的日用电
  const pro = clean(u.proNo);
  const tierEnv = clean((env || {}).SGCC_TIERS);
  const tiers = (tierEnv || (!pro || pro === '11102' ? '2880,4800' : '')).split(/[,，\s]+/).map(Number).filter((x) => x > 0);
  // 阶梯电价可配置：SGCC_PRICES，与 SGCC_TIERS 一一对应；北京默认 0.4883,0.5383,0.7883
  const priceEnv = clean((env || {}).SGCC_PRICES);
  const prices = (priceEnv || (!tierEnv && (!pro || pro === '11102') ? '0.4883,0.5383,0.7883' : '')).split(/[,，\s]+/).map(Number).filter((x) => x > 0);
  const yearKey = String(now.getFullYear());
  const settled = months.filter((x) => x.key.startsWith(yearKey));
  const lastSet = settled.length ? settled[settled.length - 1].key : '';
  let yearTotal = settled.reduce((a, b) => a + b.v, 0);
  if (!settled.length && Number.isFinite(num(info.totalEleNum))) yearTotal = num(info.totalEleNum);
  uniq.forEach((x) => { if (x.key.startsWith(yearKey) && x.key.slice(0, 6) > lastSet) yearTotal += x.v; });
  let tier = null;
  if (tiers.length >= 2 && yearTotal > 0) {
    const lv = yearTotal <= tiers[0] ? 1 : yearTotal <= tiers[1] ? 2 : 3;
    tier = { lv, total: yearTotal, left: lv < 3 ? tiers[lv - 1] - yearTotal : 0, price: prices.length >= lv ? prices[lv - 1] : NaN };
  }
  // 预计可用天数：余额 ÷（近 7 天日均电量 × 单价）
  let estDays = num(bill.dayNum);
  if (!Number.isFinite(estDays) && !owe && Number.isFinite(sum) && sum > 0) {
    const recent = uniq.slice(-7);
    const avg = recent.length ? recent.reduce((a, b) => a + b.v, 0) / recent.length : NaN;
    const priced = months.filter((x) => x.v > 0 && x.cost > 0).pop();
    const price = tier && Number.isFinite(tier.price) ? tier.price : priced ? priced.cost / priced.v : NaN;
    if (avg > 0 && Number.isFinite(price) && price > 0) estDays = Math.floor(sum / (avg * price));
  }
  return {
    name: (() => { const n = clean(u.consName_dst || u.consName); return /[:：]/.test(n) || n.length > 12 ? '' : n; })(),
    consNo: clean(u.consNo_dst || u.consNo),
    org: clean(u.orgName),
    balance: Number.isFinite(sum) ? Math.abs(sum) : NaN,
    owe,
    prepay: num(bill.prepayBal),
    days: estDays,
    billDate: clean(bill.date),
    yesterday: last ? last.v : NaN,
    yesterdayKey: last ? last.key : '',
    monthUse: Number.isFinite(num(acc.monthTotal)) ? num(acc.monthTotal) : monthDays.length ? monthDays.reduce((a, b) => a + b.v, 0) : NaN,
    lastMonth,
    yearUse: num(info.totalEleNum),
    yearCost: num(info.totalEleCost),
    tier,
    daily: uniq.slice(-30),
    months: months.filter((x) => x.key.startsWith(String(now.getFullYear()))),
  };
}



async function getData(ctx, force) {
  const env = ctx.env || {};
  const username = clean(env.SGCC_USERNAME);
  const password = clean(env.SGCC_PASSWORD);
  let cache = null;
  try { cache = ctx.storage.getJSON(K.data); } catch (_) {}
  if (!username || !password) return { configured: false, cache };
  const mine = cache && cache.user === username ? cache : null;
  const hours = Math.max(1, num(env.SGCC_REFRESH) || 6);
  if (mine && mine.list && Date.now() - mine.ts < hours * 3600000 && !force) return { configured: true, cache: mine };
  // 失败退避：同一账号密码失败后 30 分钟内不重复登录（避免触发锁号），填了新验证码时例外
  let err = null;
  try { err = ctx.storage.getJSON(K.err); } catch (_) {}
  const sig = md5hex(username + '|' + password + '|' + clean(env.SGCC_SMS));
  if (err && err.sig === sig && Date.now() - err.ts < 30 * 60000) return { configured: true, cache: mine, error: err.msg };
  let lock = 0;
  try { lock = Number(ctx.storage.get(K.lock) || 0); } catch (_) {}
  if (lock && Date.now() - lock < 90000) return { configured: true, cache: mine, busy: true, error: mine ? '' : '正在登录网上国网…' };
  try { ctx.storage.set(K.lock, String(Date.now())); } catch (_) {}
  try {
    const list = await runSgcc(ctx, username, password);
    const next = { ts: Date.now(), user: username, list };
    try { ctx.storage.setJSON(K.data, next); ctx.storage.setJSON(K.err, {}); } catch (_) {}
    return { configured: true, cache: next };
  } catch (e) {
    const msg = friendly(e);
    try { ctx.storage.setJSON(K.err, { sig, ts: Date.now(), msg }); } catch (_) {}
    return { configured: true, cache: mine, error: msg };
  } finally {
    try { ctx.storage.set(K.lock, '0'); } catch (_) {}
  }
}


function fmt(v, d = 1) {
  if (!Number.isFinite(v)) return '--';
  if (Math.abs(v) >= 1000) return v.toFixed(0);
  return v.toFixed(v % 1 === 0 && d === 1 ? 0 : d);
}
function money(v) { return Number.isFinite(v) ? v.toFixed(2) : '--'; }
function mmdd(key) { return key && key.length >= 8 ? `${Number(key.slice(4, 6))}/${Number(key.slice(6, 8))}` : ''; }

function hhmmOf(ts) { const d = new Date(ts); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
function updText(ts) {
  if (!ts) return '';
  const d = new Date(ts), n = new Date();
  return d.toDateString() === n.toDateString() ? hhmmOf(ts) : `${d.getMonth() + 1}/${d.getDate()} ${hhmmOf(ts)}`;
}

const TIER_CN = ['', '一阶', '二阶', '三阶'];
function tierText(p, short) {
  const t = p.tier;
  if (!t) return '';
  if (t.lv >= 3) return short ? '三阶' : `三阶 · 年累计 ${fmt(t.total, 0)} 度`;
  return short ? TIER_CN[t.lv] : `${TIER_CN[t.lv]} · 距${TIER_CN[t.lv + 1]} ${fmt(Math.max(0, t.left), 0)} 度`;
}
function tierColor(p) { return !p.tier ? C.faint : p.tier.lv === 1 ? C.ok : p.tier.lv === 2 ? C.warn : C.fail; }


// ==================== UI 层（Scriptable ListWidget） ====================

const _isDark = (typeof Device !== 'undefined' && Device.isUsingDarkAppearance) ? Device.isUsingDarkAppearance() : false;
const SC = {
  text: _isDark ? new Color('#FFFFFF') : new Color('#000000'),
  dim: new Color(_isDark ? '#EBEBF5' : '#3C3C43', 0.6),
  faint: new Color(_isDark ? '#EBEBF5' : '#3C3C43', 0.4),
  brand: new Color('#00A3A0'),
  ok: new Color('#30D158'),
  warn: new Color('#FF9F0A'),
  fail: new Color('#FF453A'),
  blue: new Color('#0A84FF'),
  teal: new Color('#64D2FF'),
};

function _bgGradient(w) {
  const g = new LinearGradient();
  if (_isDark) {
    g.colors = [new Color('#04201E'), new Color('#0A1630'), new Color('#07120D')];
  } else {
    g.colors = [new Color('#E6FAF6'), new Color('#EAF3FF'), new Color('#F1F6EC')];
  }
  g.locations = [0, 0.55, 1];
  w.backgroundGradient = g;
}

function _addText(parent, str, size, color, weight) {
  const t = parent.addText(String(str));
  t.font = weight === 'bold' ? Font.boldSystemFont(size)
    : weight === 'semibold' ? Font.semiboldSystemFont(size)
    : weight === 'medium' ? Font.mediumSystemFont(size)
    : Font.systemFont(size);
  t.textColor = color || SC.text;
  t.lineLimit = 1;
  t.minimumScaleFactor = 0.6;
  return t;
}

function _tierLabel(p) { return tierText(p, true) || ''; }
function _tierColor(p) {
  if (!p.tier) return SC.faint;
  if (p.tier.lv === 1) return SC.ok;
  if (p.tier.lv === 2) return SC.warn;
  return SC.fail;
}
function _balColor(p) {
  if (p.owe) return SC.fail;
  if (Number.isFinite(p.days) && p.days <= 7) return SC.warn;
  if (Number.isFinite(p.balance) && p.balance < 20) return SC.warn;
  return SC.ok;
}
function _accLabel(p) {
  const tail = p.consNo ? p.consNo.replace(/\D/g, '').slice(-4) : '';
  return p.name || (tail ? '尾号' + tail : '户号');
}

// DrawContext 画柱状图（逻辑对标 Egern 版 barsSvg）
function drawBars(vals, w, h, opts) {
  opts = opts || {};
  const dc = new DrawContext();
  dc.size = new Size(w, h);
  dc.opaque = false;
  const n = vals.length;
  if (!n) return dc.getImage();
  const max = Math.max.apply(null, vals.concat([0.1]));
  const gap = n > 20 ? 2 : 3;
  const bw = Math.max(2, (w - gap * (n - 1)) / n);
  for (let i = 0; i < n; i++) {
    const v = vals[i];
    const bh = Math.max(2, (v / max) * (h - 2));
    const x = i * (bw + gap);
    const y = h - bh;
    let color;
    if (i === n - 1) color = new Color(opts.latest || '#30D158');
    else if (v === max && v > 0) color = new Color(opts.hot || '#FF9F0A');
    else color = new Color(opts.top || '#64D2FF');
    dc.setFillColor(color);
    const r = Math.min(3, bw / 2);
    const path = new Path();
    path.addRoundedRect(new Rect(x, y, bw, bh), r, r);
    dc.addPath(path);
    dc.fillPath();
  }
  return dc.getImage();
}

function _headerRow(w, p, ts) {
  const r = w.addStack();
  r.layoutHorizontally();
  r.centerAlignContent();
  r.spacing = 5;
  try {
    const sym = SFSymbol.named('bolt.fill');
    const img = r.addImage(sym.image);
    img.imageSize = new Size(14, 14);
    img.tintColor = SC.brand;
  } catch (e) {}
  _addText(r, '网上国网', 13, SC.text, 'bold');
  const tail = p.consNo ? p.consNo.replace(/\D/g, '').slice(-4) : '';
  if (p.name || tail) _addText(r, p.name || ('尾号' + tail), 11, SC.dim, 'medium');
  r.addSpacer();
  const upd = updText(ts);
  if (upd) _addText(r, upd, 10, SC.dim);
}

function _balanceText(parent, p, bigSize) {
  const c = _balColor(p);
  const label = parent.addText(p.owe ? '欠费' : '账户余额');
  label.font = Font.systemFont(10);
  label.textColor = SC.dim;
  const row = parent.addStack();
  row.layoutHorizontally();
  row.bottomAlignContent();
  const y = row.addText('¥');
  y.font = Font.boldSystemFont(12);
  y.textColor = c;
  const b = row.addText(money(p.balance));
  b.font = Font.boldSystemFont(bigSize || 24);
  b.textColor = c;
  const sub = Number.isFinite(p.days) ? ('预计可用 ' + fmt(p.days, 0) + ' 天')
    : (p.billDate ? ('截至 ' + p.billDate) : '');
  if (sub) {
    const s = parent.addText(sub);
    s.font = Font.systemFont(9);
    s.textColor = SC.faint;
  }
}

// ---- 小尺寸 ----
function buildSmallWidget(p, r) {
  const w = new ListWidget();
  _bgGradient(w);
  w.setPadding(12, 12, 12, 12);
  _headerRow(w, p, r.cache.ts);
  w.addSpacer(4);
  _balanceText(w, p, 26);
  w.addSpacer(6);
  const row = w.addStack();
  row.layoutHorizontally();
  row.spacing = 8;
  const c1 = row.addStack(); c1.layoutVertically();
  _addText(c1, '昨日 ' + mmdd(p.yesterdayKey), 9, SC.faint);
  const yr = c1.addStack(); yr.layoutHorizontally(); yr.bottomAlignContent(); yr.spacing = 1;
  _addText(yr, fmt(p.yesterday), 16, SC.text, 'bold');
  _addText(yr, '度', 9, SC.dim);
  const c2 = row.addStack(); c2.layoutVertically();
  const tRow = c2.addStack(); tRow.layoutHorizontally(); tRow.spacing = 3;
  _addText(tRow, '本月', 9, SC.faint);
  const tl = _tierLabel(p);
  if (tl) _addText(tRow, tl, 9, _tierColor(p), 'semibold');
  const mr = c2.addStack(); mr.layoutHorizontally(); mr.bottomAlignContent(); mr.spacing = 1;
  _addText(mr, fmt(p.monthUse), 16, SC.text, 'bold');
  _addText(mr, '度', 9, SC.dim);
  w.addSpacer();
  const vals = p.daily.slice(-10).map(x => x.v);
  if (vals.length) {
    const img = w.addImage(drawBars(vals, 300, 36));
    img.imageSize = new Size(300, 36);
  }
  return w;
}

// ---- 中尺寸 ----
function buildMediumWidget(p, r) {
  const w = new ListWidget();
  _bgGradient(w);
  w.setPadding(12, 12, 12, 12);
  _headerRow(w, p, r.cache.ts);
  w.addSpacer(6);
  const row = w.addStack();
  row.layoutHorizontally();
  row.spacing = 6;
  const bc = row.addStack(); bc.layoutVertically(); bc.spacing = 1;
  _addText(bc, p.owe ? '欠费' : '余额', 10, SC.dim, 'medium');
  _addText(bc, '¥' + money(p.balance), 20, _balColor(p), 'bold');
  const mk = (label, val, unit, sub, subColor) => {
    const s = row.addStack(); s.layoutVertically(); s.spacing = 2;
    _addText(s, label, 10, SC.dim, 'medium');
    const vr = s.addStack(); vr.layoutHorizontally(); vr.bottomAlignContent(); vr.spacing = 1;
    _addText(vr, val, 17, SC.text, 'bold');
    _addText(vr, unit, 9, SC.dim);
    _addText(s, sub || ' ', 8, subColor || SC.faint);
  };
  mk('昨日', fmt(p.yesterday), '度', mmdd(p.yesterdayKey));
  mk('本月', fmt(p.monthUse), '度', tierText(p, false) || ' ', _tierColor(p));
  const lm = p.lastMonth;
  mk('上月', fmt(lm ? lm.v : NaN, 0), '度', lm && Number.isFinite(lm.cost) ? ('¥' + money(lm.cost)) : ' ');
  w.addSpacer(8);
  const list = p.daily.slice(-14);
  const vals = list.map(x => x.v);
  _addText(w, '近' + (list.length || 14) + '日用电', 10, SC.dim, 'medium');
  w.addSpacer(2);
  if (vals.length) {
    const img = w.addImage(drawBars(vals, 320, 44));
    img.imageSize = new Size(320, 44);
  }
  return w;
}

// ---- 大尺寸（单户完整版） ----
function buildLargeWidget(p, r) {
  const w = new ListWidget();
  _bgGradient(w);
  w.setPadding(12, 12, 12, 12);
  _headerRow(w, p, r.cache.ts);
  w.addSpacer(6);
  const top = w.addStack();
  top.layoutHorizontally();
  top.spacing = 8;
  const bc = top.addStack(); bc.layoutVertically(); bc.spacing = 2;
  _balanceText(bc, p, 28);
  const stats = top.addStack(); stats.layoutVertically(); stats.spacing = 6;
  const r1 = stats.addStack(); r1.layoutHorizontally(); r1.spacing = 10;
  const s1 = r1.addStack(); s1.layoutVertically(); s1.spacing = 1;
  _addText(s1, '昨日 ' + mmdd(p.yesterdayKey), 9, SC.dim, 'medium');
  _addText(s1, fmt(p.yesterday) + '度', 14, SC.text, 'bold');
  const s2 = r1.addStack(); s2.layoutVertically(); s2.spacing = 1;
  const tl = _tierLabel(p);
  _addText(s2, '本月' + (tl ? ' · ' + tl : ''), 9, tl ? _tierColor(p) : SC.dim, 'medium');
  _addText(s2, fmt(p.monthUse) + '度', 14, SC.text, 'bold');
  const r2 = stats.addStack(); r2.layoutHorizontally(); r2.spacing = 10;
  const lm = p.lastMonth;
  const s3 = r2.addStack(); s3.layoutVertically(); s3.spacing = 1;
  _addText(s3, '上月', 9, SC.dim, 'medium');
  _addText(s3, fmt(lm ? lm.v : NaN, 0) + '度', 14, SC.text, 'bold');
  const s4 = r2.addStack(); s4.layoutVertically(); s4.spacing = 1;
  _addText(s4, '今年', 9, SC.dim, 'medium');
  _addText(s4, fmt(p.yearUse, 0) + '度', 14, SC.text, 'bold');
  w.addSpacer(8);
  const list = p.daily.slice(-30);
  const vals = list.map(x => x.v);
  _addText(w, '近' + (list.length || 30) + '日用电', 10, SC.dim, 'medium');
  w.addSpacer(2);
  if (vals.length) {
    const img = w.addImage(drawBars(vals, 340, 60));
    img.imageSize = new Size(340, 60);
  }
  w.addSpacer(6);
  const now = new Date();
  const y = now.getFullYear();
  const mmap = {};
  (p.months || []).forEach(m => { mmap[m.key] = m.v; });
  const mv = [];
  for (let i = 1; i <= 12; i++) {
    const k = '' + y + String(i).padStart(2, '0');
    if (mmap[k] !== undefined) mv.push(mmap[k]);
    else if (i - 1 < now.getMonth()) mv.push(0);
  }
  if (mv.length) {
    _addText(w, y + ' 年月度用电', 10, SC.dim, 'medium');
    w.addSpacer(2);
    const img2 = w.addImage(drawBars(mv, 340, 44, { top: '#BF5AF2' }));
    img2.imageSize = new Size(340, 44);
  }
  return w;
}

// ---- 多户号 ----
function buildMultiSmallWidget(pList, r) {
  const w = new ListWidget();
  _bgGradient(w);
  w.setPadding(12, 12, 12, 12);
  _headerRow(w, pList[0], r.cache.ts);
  w.addSpacer(4);
  pList.slice(0, 4).forEach(p => {
    const row = w.addStack();
    row.layoutHorizontally();
    row.centerAlignContent();
    _addText(row, _accLabel(p), 12, SC.text, 'medium');
    row.addSpacer();
    _addText(row, (p.owe ? '欠' : '') + '¥' + money(p.balance), 14, _balColor(p), 'bold');
    w.addSpacer(3);
  });
  w.addSpacer();
  const totalY = pList.reduce((a, p) => a + (Number.isFinite(p.yesterday) ? p.yesterday : 0), 0);
  _addText(w, pList.length + ' 个户号 · 昨日共 ' + fmt(totalY) + ' 度', 9, SC.faint);
  return w;
}

function buildMultiMediumWidget(pList, r) {
  const w = new ListWidget();
  _bgGradient(w);
  w.setPadding(12, 12, 12, 12);
  _headerRow(w, pList[0], r.cache.ts);
  w.addSpacer(4);
  pList.slice(0, 4).forEach(p => {
    const row = w.addStack();
    row.layoutHorizontally();
    row.centerAlignContent();
    row.spacing = 6;
    const left = row.addStack(); left.layoutVertically(); left.spacing = 1;
    _addText(left, _accLabel(p), 12, SC.text, 'semibold');
    _addText(left, '昨日 ' + fmt(p.yesterday) + ' 度 · 本月 ' + fmt(p.monthUse) + ' 度', 9, SC.faint);
    row.addSpacer();
    const right = row.addStack(); right.layoutVertically(); right.spacing = 0;
    const bt = right.addText((p.owe ? '欠' : '') + '¥' + money(p.balance));
    bt.font = Font.boldSystemFont(15);
    bt.textColor = _balColor(p);
    bt.rightAlignText();
    const tl = _tierLabel(p);
    if (tl) {
      const tt = right.addText(tl);
      tt.font = Font.systemFont(8);
      tt.textColor = _tierColor(p);
      tt.rightAlignText();
    }
    w.addSpacer(5);
  });
  return w;
}

function buildMultiLargeWidget(pList, r, env) {
  const w = new ListWidget();
  _bgGradient(w);
  w.setPadding(12, 12, 12, 12);
  const focusWant = String((env || {}).SGCC_FOCUS || '').trim();
  let focusIdx = 0;
  if (focusWant) {
    const fi = pList.findIndex(p => String(p.consNo || '').endsWith(focusWant));
    if (fi >= 0) focusIdx = fi;
  }
  const focus = pList[focusIdx];
  const others = pList.filter((_, i) => i !== focusIdx);
  _headerRow(w, focus, r.cache.ts);
  w.addSpacer(4);
  const top = w.addStack();
  top.layoutHorizontally();
  top.spacing = 8;
  const bc = top.addStack(); bc.layoutVertically(); bc.spacing = 2;
  _balanceText(bc, focus, 26);
  const stats = top.addStack(); stats.layoutVertically(); stats.spacing = 4;
  const sr = stats.addStack(); sr.layoutHorizontally(); sr.spacing = 10;
  const q1 = sr.addStack(); q1.layoutVertically(); q1.spacing = 1;
  _addText(q1, '昨日', 9, SC.dim, 'medium');
  _addText(q1, fmt(focus.yesterday) + '度', 13, SC.text, 'bold');
  const q2 = sr.addStack(); q2.layoutVertically(); q2.spacing = 1;
  _addText(q2, '本月', 9, SC.dim, 'medium');
  _addText(q2, fmt(focus.monthUse) + '度', 13, SC.text, 'bold');
  const q3 = sr.addStack(); q3.layoutVertically(); q3.spacing = 1;
  const flm = focus.lastMonth;
  _addText(q3, '上月', 9, SC.dim, 'medium');
  _addText(q3, fmt(flm ? flm.v : NaN, 0) + '度', 13, SC.text, 'bold');
  w.addSpacer(6);
  const list = focus.daily.slice(-30);
  const vals = list.map(x => x.v);
  _addText(w, _accLabel(focus) + ' · 近' + (list.length || 30) + '日', 10, SC.dim, 'medium');
  w.addSpacer(2);
  if (vals.length) {
    const img = w.addImage(drawBars(vals, 340, 56));
    img.imageSize = new Size(340, 56);
  }
  others.slice(0, 4).forEach(p => {
    w.addSpacer(5);
    const row = w.addStack();
    row.layoutHorizontally();
    row.centerAlignContent();
    _addText(row, _accLabel(p), 11, SC.text, 'medium');
    row.addSpacer();
    _addText(row, '昨日 ' + fmt(p.yesterday) + '度', 10, SC.dim);
    row.addSpacer();
    _addText(row, (p.owe ? '欠' : '') + '¥' + money(p.balance), 13, _balColor(p), 'bold');
  });
  w.addSpacer();
  return w;
}

// ---- 锁屏 ----
function buildLockWidget(p) {
  const w = new ListWidget();
  _addText(w, '¥' + money(p.balance), 16, _balColor(p), 'bold');
  _addText(w, '昨日 ' + fmt(p.yesterday) + '度', 10, SC.dim);
  return w;
}

function buildMessageWidget(title, body) {
  const w = new ListWidget();
  _bgGradient(w);
  w.setPadding(14, 14, 14, 14);
  _addText(w, '网上国网', 13, SC.text, 'bold');
  w.addSpacer(6);
  const t = w.addText(title);
  t.font = Font.semiboldSystemFont(15);
  t.textColor = SC.text;
  t.lineLimit = 2;
  w.addSpacer(4);
  const b = w.addText(body);
  b.font = Font.systemFont(11);
  b.textColor = SC.dim;
  b.lineLimit = 5;
  return w;
}

// ==================== 主流程 ====================

async function main() {
  const env = ctx.env;
  const username = String(env.SGCC_USERNAME || '').trim();
  const password = String(env.SGCC_PASSWORD || '').trim();

  if (!username || !password) {
    const w = buildMessageWidget('还没填写账号', '在 Scriptable 脚本设置的「小组件参数」里填入 JSON，包含 username 和 password。详见脚本头部注释。');
    return finish(w);
  }

  let r = await getData(ctx, false);

  // 短信验证处理
  if (r.error && /验证/.test(r.error)) {
    if (config.runsInApp) {
      const alert = new Alert();
      alert.title = '短信验证';
      alert.message = r.error;
      alert.addTextField('6位验证码', '');
      alert.addAction('确定');
      alert.addCancelAction('取消');
      const idx = await alert.present();
      if (idx === 0) {
        const code = String(alert.textFieldValue(0) || '').replace(/\D/g, '');
        if (code.length === 6) {
          saveSmsCode(code);
          refreshSmsEnv();
          try { ctx.storage.setJSON('sgcc_hark_err2', {}); } catch (e) {}
          r = await getData(ctx, true);
          if (!r.error) clearSmsCode();
        }
      }
      if (r.error && /验证/.test(r.error)) {
        const w = buildMessageWidget('短信验证', r.error);
        return finish(w);
      }
    } else {
      const w = buildMessageWidget('需要短信验证', '国网要求验证新设备，请在 Scriptable App 内运行本脚本一次，按提示输入验证码。');
      return finish(w);
    }
  }

  if (r.error && /密码|账号/.test(r.error)) {
    try {
      const n = new Notification();
      n.title = '网上国网';
      n.body = r.error.slice(0, 120);
      n.schedule();
    } catch (e) {}
  }

  if (!r.cache || !r.cache.list) {
    const w = buildMessageWidget('暂时取不到数据', r.error || '请稍后刷新');
    return finish(w);
  }

  const isAll = /^all$/i.test(String(env.SGCC_ACCOUNT || '').trim());
  const accList = pickAccounts(r.cache.list, env.SGCC_ACCOUNT);
  if (!accList.length) {
    const w = buildMessageWidget('没有绑定户号', '请先在网上国网 App 里绑定用电户号。');
    return finish(w);
  }

  const family = ctx.widgetFamily;
  let w;
  if (isAll && accList.length > 1) {
    const pList = accList.map(a => parse(a, env));
    if (family === 'systemSmall') w = buildMultiSmallWidget(pList, r);
    else if (family === 'systemMedium') w = buildMultiMediumWidget(pList, r);
    else w = buildMultiLargeWidget(pList, r, env);
  } else {
    const p = parse(accList[0], env);
    if (family === 'systemSmall') w = buildSmallWidget(p, r);
    else if (family === 'systemMedium') w = buildMediumWidget(p, r);
    else w = buildLargeWidget(p, r);
  }
  return finish(w);
}

function finish(w) {
  if (config.runsInWidget) {
    Script.setWidget(w);
  } else {
    w.presentLarge();
  }
  Script.complete();
}

// 锁屏专用：另存脚本，参数加 {"lock":true}
if (params.lock) {
  (async () => {
    const r = await getData(ctx, false);
    let w;
    if (r.cache && r.cache.list && r.cache.list.length) {
      const accList = pickAccounts(r.cache.list, ctx.env.SGCC_ACCOUNT);
      const p = parse(accList[0] || r.cache.list[0], ctx.env);
      w = buildLockWidget(p);
    } else {
      w = buildMessageWidget('网上国网', '暂无数据');
    }
    finish(w);
  })();
} else {
  await main();
}
