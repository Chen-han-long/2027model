import { partById } from './data';

// API Key 不持久化：只在页面 App 的 useState 内保存，刷新页面会清除。
// 网关地址可在页面中配置并保存（它不是机密），也可构建时传 VITE_AI_GATEWAY_URL。
export const DEFAULT_GATEWAY_URL = import.meta.env.VITE_AI_GATEWAY_URL || '';
const DIRECT_API_URL = 'https://api.deepseek.com/chat/completions';

export function buildAIRequest({ partId, customModel, question, history = [], screenshot }) {
  const part = customModel ? null : partById[partId];
  if (!part && !customModel) throw new Error('请先选择有效零件。');
  const context = part ? `编号：${part.id}；零件名称：${part.name}；材料：${part.material}；类别：${part.kind}；外形：${part.shape}；可辨识特征：${part.features.join('、')}；说明：${part.note}` : '';
  const userModel = customModel ? `用户导入的模型名称为：${String(customModel).slice(0, 200)}。除截图外，你无法读取其真实几何数据。` : '';
  const system = `你是机械工程图与三维模型解读助手。用户当前正在查看以下零件：\n${context}\n${userModel}\n重要限制：内置三维模型只是根据二维图纸概括出来的可视化示意模型，不是尺寸精确的 CAD 实体；截图只能显示当前视角，不能从中可靠测量孔径、壁厚、尺寸、公差或隐藏的结构。你没有读取 PDF 标注或完整三维网格数据的能力。用户要求具体尺寸、公差、载荷、加工参数或规范时，必须提示查阅正式工程图并由工程人员核实，严禁编造数字。若附带截图，请明确依据可见外形进行观察。用简体中文回答，专业、实用、清晰。`;
  const safeHistory = Array.isArray(history) ? history.slice(-8).filter(m => m && ['user','assistant'].includes(m.role) && typeof m.content === 'string').map(m => ({ role:m.role, content:m.content.slice(0, 1500) })) : [];
  if(typeof question !== 'string' || !question.trim() || question.length > 1500) throw new Error('请输入 1–1500 字的问题。');
  if(screenshot && (!/^data:image\/jpeg;base64,[a-z0-9+/=]+$/i.test(screenshot) || screenshot.length > 1400000)) throw new Error('截图大小或格式无效。');
  return {
    model: 'deepseek-flash', thinking:{type:'disabled'}, max_tokens:1400, stream:false,
    messages:[
      { role:'system', content:system }, ...safeHistory,
      { role:'user', content: screenshot ? [
        { type:'text', text:question.trim() },
        { type:'image_url', image_url:{ url:screenshot, detail:'low' } },
      ] : question.trim() },
    ],
  };
}

export async function askDeepSeek({ key, mode, gatewayUrl, partId, customModel, question, history, screenshot }) {
  const apiKey = String(key || '').trim();
  if (!apiKey) throw new Error('请先输入你的 DeepSeek API Key。');
  const endpoint = mode === 'direct' ? DIRECT_API_URL : String(gatewayUrl || '').trim();
  if (!endpoint) throw new Error('请先填写你自己部署的 Cloudflare Worker 网关地址（一次设置即可）。也可以切换“直接访问”模式试用，但浏览器可能被 CORS 阻止。');
  let url;
  try { url = new URL(endpoint); } catch { throw new Error('接口地址不是有效网址。'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error('请使用不包含用户名、密码或锚点的 HTTPS 接口地址。');
  const payload = buildAIRequest({partId, customModel, question, history, screenshot});
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45000);
  try {
    const response = await fetch(url.href, {
      method:'POST', signal:ctrl.signal, cache:'no-store', redirect:'error', credentials:'omit',
      headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${apiKey}` },
      body:JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401) throw new Error('DeepSeek API Key 无效或已过期（401），请确认密钥。');
      if (response.status === 402) throw new Error('DeepSeek 账户额度不足或需要充值（402）。');
      if (response.status === 429) throw new Error('请求过于频繁（429），请稍后再试。');
      throw new Error(data?.error?.message || data?.error || `DeepSeek 请求失败（HTTP ${response.status}）。`);
    }
    const answer = data?.choices?.[0]?.message?.content;
    if (typeof answer !== 'string' || !answer.trim()) throw new Error('AI 未返回有效回答。');
    return answer.trim();
  } catch (e) {
    if (e?.name === 'AbortError') throw new Error('AI 请求超过 45 秒，请重试。');
    if (e instanceof TypeError) {
      throw new Error(mode === 'direct'
        ? '浏览器无法直接访问 DeepSeek（可能是 CORS 跨域限制或网络问题）。请切换到自建 Cloudflare Worker 网关，按部署教程配置一次。'
        : '无法访问 AI 网关：请检查 Worker HTTPS 地址、Cloudflare 部署与 ALLOWED_ORIGIN 设置，或查看浏览器控制台。');
    }
    throw e;
  } finally { clearTimeout(timer); }
}
