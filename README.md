# 2027 FORGE STUDIO — v2.3 孔系与机械细节版

保留 v2.2 的 GitHub Pages、透视/正交投影、可旋转查看、颜色材质、阴影及 DeepSeek BYOK（每次手动输入 Key）。重点改进七件的机械孔系与实体通孔，**C 件保留**。

## 新版内容

- A、B、D、E、F、G、H 七个零件新增/校正了实际布尔开孔、沉台、底座固定孔、检查口等。
- 以前有些法兰孔被后面的实体主体填住，本版在实体**最终合并后重新钻孔**。
- 右侧新增「孔径与加工特征」表：列出图纸标注、模型实际采用直径、数量，以及不确定性，并可对真实孔位进行镜头聚焦。
- 新增可选的「加工棱线」观察模式：只显示真实网格的锐边，而不是额外生成装饰性零件。
- 预览图、可编辑 STEP（供继续校核）、GLB、CadQuery 参数化源码、原始工程 PDF 都在完整项目里。

## 质量检查

```bash
python cad_models/generate.py A B C D E F G H
python cad_models/verify_features.py
npm run check:models
npm run test:api
npm run build
```

其中 Python 生成需要 `cadquery`、`vtk`、`trimesh`、`numpy`。通常只在重建 CAD 时运行；GitHub Pages 的静态构建不需要安装 CadQuery，也不运行 Python。

## 精度边界

所有模型是有来源、有标注与推定区别的**实体 CAD 可视化模型**，不应误认为全尺寸和公差已完成的加工零件。尤其是多阶内腔、铸造复杂曲面、孔深和螺纹牙形不完整。请阅读 `孔径复核与精度边界-v2.3.md`。

GitHub 更新步骤见 `更新到GitHub-v2.3.md`。
