# FORGE STUDIO 2027 — 2.0 Clean CAD（三维几何清理版）

这不是在 v1.6 的几何上继续拼接网格，而是 **从 A–H 原始 PDF 参考尺寸重新生成了八个可编辑布尔 CAD 实体**，再导出轻量 GLB 供 GitHub Pages 在线旋转、投影、显示。

## 这次到底改了什么

- 已清理历史模型中大量互相重叠的面、游离螺栓头、装饰性筋板和假的孔洞；三维核心不再依赖旧 `src/modelFactory.js`。
- **CAD 形体经 OpenCascade/CadQuery 实体运算和有效性检查，八件各为一个实体。** 导出的 GLB 都完成了顶点焊接，网格均通过 watertight（封闭）检查。
- 网站使用 `GLTFLoader` 加载 `public/models/A.glb` — `H.glb`；模型失败时明确报错且尽量保留上一件，不再以空白或假的零件冒充成功。
- 独立的**透视 / 正交**投影、可随时旋转、正视/后视/侧视/俯视/底视/轴测、全屏、材质、阴影、颜色、坐标轴均保留。
- 删除没有真实装配数据支撑的“爆炸分解”和不存在的“结构标注”功能，避免误导。
- DeepSeek 仍由用户每次打开网页手动输入 API Key，静态网页使用 GitHub Pages（无需 Vercel），可选自建 Cloudflare Worker。

## 文件结构

```text
public/drawings/        # 原始 A-H PDF、PNG、关键视图裁图
public/models/          # 最终生成的 A-H GLB + validation.json
cad_models/generate.py  # 可编辑的 CadQuery 参数化建模源码，Python 环境运行
cad_models/preview.py   # 独立 VTK 渲染 QA 预览工具
src/Viewer.jsx          # Three.js GLTFLoader 三维渲染与投影
src/App.jsx             # 原来的网页 UI + DeepSeek 控件
scripts/check-models.mjs # CI GLB 完整性验证
.github/workflows/      # 现有 GitHub Pages 自动部署
previews/               # 真正渲染出来的 CAD 模型预览截图
```

## 测试情况与工程精度边界

**已完成的实际验证**：8 个 CAD 构型都满足 `Solid.isValid()`，均为**单个有效 CAD 实体**，导出的 8 个 GLB 全部封闭（watertight）；逐一使用 VTK 离屏渲染成 PNG 检查，逐一核对包围尺寸；Node.js 对 GLB 文件头、几何属性和尺寸进行校验；JSX 静态解析；Cloudflare Worker 模拟请求测试。

**尚未完成**：当前工作环境无法访问 npm 仓库，因此未在真实 Chrome 中完成 Vite 网站最终交互验证（GitHub Actions 会下载依赖并进行自动构建）。

**尺寸精度特别说明**：有效、封闭的 CAD 实体 **不代表** 已还原正式图纸全部尺寸！八件铸件中的未注自由曲面、装配台阶、沉孔深度、公差、内部流道和部分筋板是简化表达；不能用于加工、开模、承压安全分析或尺寸验收。完整生产级模型请以经审核的原始 STEP/SolidWorks 文件为准。

## 本地运行

```bash
npm install
npm run check:models
npm run dev
```

部署前：`npm run build`，它会执行纯 Node.js 的 GLB 检验。

重新生成模型（**仅在你要修改 CAD 参数时**）：

```bash
pip install cadquery trimesh numpy
python cad_models/generate.py A B C D E F G H
```

其他说明、GitHub 更新教程请看 `GitHub更新步骤-v2.0.md`。普通用户**不必**安装 Python 或 CadQuery：八个 `.glb` 已经生成。
