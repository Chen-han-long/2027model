# FORGE STUDIO — 2027 工程图三维可视化（v1.4）

这是基于八张二维 PDF 工程图制作的 Three.js / React / Vite 交互网站，可在 GitHub Pages 上免费部署（使用公开仓库时需确认图纸允许公开）。

## 功能

- A—H 八个零件的参数化三维**示意**重建（模型坐标单位 mm）
- 鼠标旋转、缩放、平移、视角切换、自动旋转、全屏查看
- 颜色、金属度、粗糙度、透明度、光照、阴影、网格调节
- 直接对照原始 PDF；三维窗口内可一键显示关键视图裁图
- 导入 STL/OBJ/GLB、导出预览 STL、保存 PNG 截图
- DeepSeek AI 问答：每次使用时输入 Key；不写入源码或本地存储；可附带当前三维截图
- 可选 Cloudflare Worker 转发（浏览器直接访问 DeepSeek 可能遇到 CORS）

## 重要：精度说明

模型是**可视化重建**，不是 STEP/SolidWorks 的工程实体，不能用于加工、铸造开模、有限元分析、承压安全计算或公差检验。虽然有一些尺寸来自图纸标注，复杂曲面、局部孔位、壁厚和内腔仍是近似。导出的 STL 同样仅供预览。

特别注意：E 件**总长 2040 mm**；1160 mm 是剖面局部尺寸，旧版标注错误已在 v1.4 更正。具体逐件复核内容见 `本次图纸复核.md`。

## 本地运行

需要 Node.js 20.19+ 或 22+。

```bash
npm install
npm run check:models
npm run dev
```

正式构建：

```bash
npm run build
```

部署到 GitHub Pages：仓库 Settings → Pages → Source 选择 **GitHub Actions**。项目自带 `.github/workflows/deploy.yml`，提交到 `main` 即会部署。**无需 Vercel**。

## DeepSeek 接口

每次打开网站，在右侧 AI 助手输入 DeepSeek API Key。Key 仅存在页面内存中，刷新后清空。浏览器直接请求可能遇到 CORS；`worker/deepseek-proxy.js` 是可选转发代码，Worker 不持久保存 Key。Worker 地址可以保存（它不是密钥）。

## 项目结构

- `src/modelFactory.js`：八个三维模型生成器
- `src/Viewer.jsx`：Three.js 渲染、相机、XYZ 轴、STL 导出
- `src/App.jsx`：界面、图纸对照、AI 控件
- `src/data.js`：图纸可读尺寸、结构说明、误差提醒
- `public/drawings/`：原始 PDF、预览图与关键视图裁图
- `worker/`：可选的 BYOK AI 转发接口
- `.github/workflows/deploy.yml`：GitHub Pages 自动部署
- `本次图纸复核.md`：与 PDF 逐件对照的更改及未完成项目

## 测试状态

已完成语法检查、JSX 解析、隔离模型构造模拟测试和 Worker 模拟测试；因当前环境不能下载 npm 依赖，未完成真实 Three.js 渲染验证。请在 GitHub Actions 构建后再进行浏览器检查。
