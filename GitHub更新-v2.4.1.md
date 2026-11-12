# v2.4.1 更新现有 GitHub Pages 网站（手机／平板适配）

这是基于你已经在用的 v2.4 网站做的纯前端更新，不需要重建仓库，不需要修改 `.github/workflows`，**不要重新上传 GLB、STEP、PDF 或 DeepSeek API Key**。

1. 下载并解压 **`2027-cad-studio-v2.4.1-响应式更新包.zip`**。
2. 在 GitHub 打开你的仓库 → **Code** → `src`。
3. 将补丁中 `src/App.jsx`、`src/Viewer.jsx`、`src/main.jsx` 更新到 GitHub 同名文件。
4. 在 GitHub 的 `src` 文件夹**新建** `responsive.css`，内容与补丁同名文件一致。不能只上传 CSS 而不更新 `main.jsx`，因为 `main.jsx` 负责引入新样式。
5. 可选：更新仓库根目录的 `package.json`，只把版本号改为 2.4.1，没有增加任何依赖。也可保持原版本号。
6. **Commit changes** 到 `main` 分支。进入 **Actions** 等待部署绿色对勾。
7. 打开 GitHub Pages 地址，按 `Ctrl + Shift + R`（Mac：`Command + Shift + R`）强制刷新；手机可以关闭浏览器标签页后重新打开以清理缓存。

## 检查手机页面

- 底部应出现零件库／三维模型／外观设置／AI 助手／工程图五项。
- 左侧零件库可展开、点击零件后关闭。
- 外观与 AI 右侧抽屉可打开；遮罩或 X 可关闭。
- 三维视图不应缩成一条细线；按钮太多时，底部操作条可以左右滑动。
- 下滑可以看到零件说明和原图预览，原有 DeepSeek 密钥输入方式不变。

如果部署后出现旧版样式，确认 `responsive.css` 位于 `src/responsive.css`，以及 `src/main.jsx` 有 `import './responsive.css';`，随后强制刷新缓存。
