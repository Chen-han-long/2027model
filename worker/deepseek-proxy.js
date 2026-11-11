/**
 * FORGE Studio 轻量 BYOK 网关（Cloudflare Worker）
 * - 不配置也不保存 DeepSeek API Key；每次请求从用户浏览器收到，转发给 DeepSeek。
 * - 不读取/修改用户密钥、不持久化聊天内容、不打印请求内容。
 * - 必须把 ALLOWED_ORIGIN 改为你的实际 GitHub Pages 站点域名（只写 origin，不含仓库路径）。
 * - 这个网关并不提供账户身份验证；它只处理带用户自己 API Key 的请求。
 */
const ALLOWED_ORIGIN = 'https://YOUR-USERNAME.github.io'; // ← 改成你的 GitHub 用户名（小写）
const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';

const responseJson = (message, status, origin) => new Response(JSON.stringify({error:{message}}), {
  status, headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin', ...(origin ? {'Access-Control-Allow-Origin':origin}: {})}
});
export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || '';
    // 原始站点（含路径）例如：https://username.github.io/2027-cad-studio/
    // Origin 只包含 https://username.github.io，没有仓库路径。
    if (origin !== ALLOWED_ORIGIN) return responseJson('来源站点不在允许名单中，请检查 ALLOWED_ORIGIN。', 403, null);
    const cors = {
      'Access-Control-Allow-Origin':ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods':'POST, OPTIONS',
      'Access-Control-Allow-Headers':'Authorization, Content-Type',
      'Access-Control-Max-Age':'3600',
      'Cache-Control':'no-store',
      'Vary':'Origin',
    };
    if(request.method === 'OPTIONS') return new Response(null,{status:204,headers:cors});
    if(request.method !== 'POST') return responseJson('仅允许 POST。',405, origin);
    const auth = request.headers.get('Authorization') || '';
    if(!/^Bearer\s+[^\s]+$/.test(auth) || auth.length>500) return responseJson('请提供有效 DeepSeek API Key。',401,origin);
    const length = Number(request.headers.get('Content-Length') || 0);
    if(length>1550000) return responseJson('请求内容过大。',413,origin);
    let body;
    try {
      const raw=await request.text();
      if(raw.length>1550000) return responseJson('请求内容过大。',413,origin);
      body=JSON.parse(raw);
    } catch { return responseJson('请求 JSON 无效。',400,origin); }
    // 固定 API 目标地址，禁止用户构造外部 URL，避免沦为开放代理。
    if(!body || !Array.isArray(body.messages) || body.messages.length>12 || body.model!=='deepseek-flash') return responseJson('请求格式无效。',400,origin);
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),45000);
    try {
      const upstream=await fetch(DEEPSEEK_URL, {
        method:'POST', signal:controller.signal, redirect:'error',
        headers:{'Content-Type':'application/json','Authorization':auth},
        body:JSON.stringify(body),
      });
      // 不把上游的响应头（例如 Set-Cookie）透传，只返回 JSON 正文和状态码。
      return new Response(upstream.body,{
        status:upstream.status,
        headers:{'Content-Type':'application/json; charset=utf-8',...cors},
      });
    } catch(e) {
      return responseJson(e?.name==='AbortError'?'DeepSeek 响应超时。':'暂时无法连接 DeepSeek。',504,origin);
    } finally {clearTimeout(timer);}
  }
};
