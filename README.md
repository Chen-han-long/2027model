# FORGE STUDIO 2027 · v2.2 硬边实体模型版

通过 CAD 实体建模（CadQuery/OpenCascade）生成 A–H 八个参考零件，导出适合 GitHub Pages 的 GLB 网格。支持三维旋转、透视/正交、材质、灯光、图纸对照、STL 预览导出和 DeepSeek API Key 每次手动输入。

**本版针对用户反馈的「像气球」现象：** 修改了三个示例的实体几何（C、E、H）以及全部八件的法线导出。圆柱面按曲面正常平滑，法兰直角、板边、孔边通过 36° 特征角硬边处理，材质默认改为哑光铸件。模型依然是有厚度、有内孔的实心 CAD B-rep 实体，**不是充气的贴图或开放网格**。

### 下载和安装

- 在现有仓库更新：请阅读 [`更新教程-v2.2.md`](./更新教程-v2.2.md)，最重要的是一起替换 `public/models` 里的全部八个 GLB。
- 完整网站包含 `public/drawings` 八份 PDF；附有 `.github/workflows/deploy.yml`。无需 Vercel。
- STEP 文件在单独的 CAD 工程压缩包中，方便在 FreeCAD 等软件继续校核。

### 开发

```bash
npm install
npm run check:models
npm run dev
```

构建 `npm run build`；部署 GitHub Pages 仍采用现有 GitHub Actions 工作流。

### 工程精度说明

CAD 的实体有效性不是完整图纸尺寸准确性的证明。这里保留了原图主要可读尺寸，但未标注的铸造曲面、内部复杂流道、公差等未全部约束。**参考实体不得未经复核直接用于加工、检测、开模或安全计算。**

模型源码位于 `cad_models/generate.py`；GLB 渲染预览位于 `previews_hard_edges/`。当前容器无法从 npm 下载依赖，因此实际 Chrome 交互需通过 GitHub Actions 构建后进行最后验证。
