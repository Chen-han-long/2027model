# FORGE STUDIO · GitHub Pages + 每次输入 DeepSeek API Key

这是基于用户提供的 `2027题目.zip`（A–H 共 8 张机械工程图）制作的可视化网页。**不使用 Vercel，不在 GitHub、网页代码或部署环境变量中保存 DeepSeek API Key**。每次打开网页，在右侧 AI 助手输入你自己的 Key；关闭或刷新页面后该 Key 会从页面内存中消失。外观、旋转、图纸对照、导入导出不需要 AI Key。

> **工程精度说明**：8 个三维模型是参考二维图纸概括的**示意外形**，并未按全部标注建立精确 CAD 实体；尺寸、孔位、壁厚、配合与公差未经可靠复核。STL 导出只供展示，不可直接用于加工。AI 可以参考文字上下文及可选的当前视角渲染截图，但无法读取 PDF 的全部尺寸标注、不可把截图当量具。

## 功能

- 八个独立程序化示意模型、自由旋转、滚轮缩放、视角切换、自动旋转、线框与分解示意。
- 颜色、金属度、粗糙度、透明度、灯光、实时阴影、背景和网格调节。
- A–H 原始工程图 PNG 和 PDF 对照；导入 STL / OBJ / GLB；导出当前视角 PNG 和 STL 示意网格。
- DeepSeek 多轮问答：输入你自己的 API Key，可选附带当前三维渲染截图。
- 自带 GitHub Actions 工作流，提交到 GitHub 后自动构建 GitHub Pages 网站；适配 `/仓库名/` 子路径。
- 可选 Cloudflare Worker 小网关，用于解决浏览器直接请求 DeepSeek 的 CORS 限制；**Worker 只临时转发 Key，不存储 Key**。

## 核心文件

```text
2027-cad-studio-pages/
├── .github/workflows/deploy.yml   # GitHub Pages 自动构建/发布
├── src/App.jsx                     # 三维工作台 UI + 临时输入 API Key
├── src/ai.js                       # DeepSeek API 请求（直接/网关）、零件提示词
├── src/Viewer.jsx                  # Three.js 渲染与截图
├── src/models.jsx                  # A–H 8 种程序化示意模型
├── src/data.js                     # 零件信息与 AI 上下文
├── public/drawings/               # 8 份 PDF 与对应预览图
├── worker/deepseek-proxy.js        # 可选 Cloudflare Worker 网关源码
├── vite.config.js                  # GitHub Pages 自动子目录配置
├── package.json
└── 部署教程.md                      # 完整中文上手步骤
```

## 必须理解的限制

1. **GitHub Pages 是静态托管。** 浏览器直接 `fetch('https://api.deepseek.com/chat/completions')` 的请求可能被 DeepSeek 的跨域策略（CORS）拦截；填写 Key 不会自动解决 CORS。界面保留“浏览器直接连接”试用选项，但**不能保证可用**。如果需要可靠的网页 AI，推荐部署自己的 Cloudflare Worker（不用 Vercel）；将网关网址在网页中配置一次，之后每次只输入 Key。
2. Key 在当前页面组件内存里，不写入 `localStorage`、`sessionStorage` 或 GitHub。**只有网关 URL 这项非机密配置会记录在浏览器 `localStorage`**。在不可信电脑、被篡改网站或恶意浏览器扩展中输入 Key 仍有风险；Key 会经你指定的网关转发给 DeepSeek，请只使用自己可信的 Worker 地址。密钥在网络传输中是通过 HTTPS 传送，不代表绝对安全。
3. **GitHub Free 的 GitHub Pages 一般要求公开仓库。** 若你之前选择了 Private，免费账户可能无法启用 Pages；GitHub Pro 等支持私有仓库源，但**发布出来的 Pages 网站通常仍是公开的**。`public/drawings` 内的原始 PDF 和 PNG 会被网站访问者下载。如果图纸涉及保密，**不要公开上传此项目，也不要开启公开 Pages**；应考虑本地运行或另选具备访问控制的托管环境。
4. DeepSeek 按自身政策、账户额度和所选模型计费；附带截图通常增加图像 token 开销。界面发送的是当前画布截图和模型文字信息，不会直接上传用户导入的 STL/OBJ/GLB 原文件。

## 本地试用

安装 Node.js 22 或兼容的 LTS 版本，在此目录运行：

```bash
npm install
npm run dev
```

浏览器访问终端提示的网址（通常 `http://localhost:5173`）。本地 3D 不需要网关。AI 如需正常使用，配置个人 Worker 网址；直接访问模式也可能因 CORS 无法工作。

## 在线部署与网关配置

零基础中文步骤见 **[部署教程.md](./部署教程.md)**。流程简述：

1. 上传本项目所有文件（含 `.github/workflows/deploy.yml`，不是仅上传 ZIP）到 GitHub 仓库。
2. 在 GitHub `Settings` → `Pages` 选择 **GitHub Actions**；推送到 `main` 自动构建后，打开 `https://用户名.github.io/仓库名/`。
3. 只要三维功能，可以停在这里。要使用 AI：在 Cloudflare Workers 创建一个 Worker，将 `worker/deepseek-proxy.js` 代码粘贴进去，并把 `ALLOWED_ORIGIN` 改成 `https://用户名.github.io`；部署获得 `.workers.dev` 地址。
4. 打开自己的 GitHub Pages 页面 → 右侧 **AI 助手** → 连接方式选 **自建 Worker 网关** → 填 Worker 地址（保存一次）；每次打开网页填入 DeepSeek API Key 后即可提问。

## 原站变更说明

本版本已经删除旧的 Vercel `/api/chat` 函数、站点访问口令和 Vercel 环境变量配置。DeepSeek Key 改为用户每次主动输入、仅在本次页面会话内存中使用。**不能把 Key 写在 GitHub 仓库里、放在 Worker 源码里或提交 `.env`。**

## 官方参考

- [GitHub Pages 发布与可见性](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)
- [Vite 的 GitHub Pages 部署](https://vite.dev/guide/static-deploy)
- [DeepSeek API](https://api-docs.deepseek.com/zh-cn/)
- [DeepSeek API Key 控制台](https://platform.deepseek.com/api_keys)
- [Cloudflare Workers](https://developers.cloudflare.com/workers/get-started/guide/)
- [MDN：CORS 跨域限制](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS/Errors/CORSMissingAllowOrigin)
