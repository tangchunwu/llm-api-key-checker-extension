# 浏览器插件版 API Key Checker 使用说明

## 1. 项目概况

这是一个完全可以在浏览器本地运行的 API Key 检测工具，不再依赖 Cloudflare Worker 或本地 Node.js 服务器。

- **源代码位置**: `E:\llm-api-key-checker-extension`
- **构建产物**: `E:\llm-api-key-checker-extension\dist`
- **原项目位置**: `E:\llm-api-key-checker` (未修改)

## 2. 安装步骤

1. 打开 Chrome 或 Edge 浏览器。
2. 在地址栏输入 `chrome://extensions` 并回车。
3. 打开右上角的 **"开发者模式" (Developer mode)** 开关。
4. 点击左上角的 **"加载已解压的扩展程序" (Load unpacked)** 按钮。
5. 选择文件夹：`E:\llm-api-key-checker-extension\dist`。

## 3. 功能特性

- **独立标签页**: 点击插件图标，自动打开全屏检测界面。
- **本地直连**: 利用浏览器插件权限，直接请求 OpenAI、DeepSeek 等接口，无跨域(CORS)限制。
- **数据隐私**: 所有 Key 仅在本地浏览器处理，不经过任何第三方服务器中转。
- **并发控制**: 支持自定义并发数，批量高速检测。

## 4. 开发指南

如果你想修改插件代码：

1. 进入 `E:\llm-api-key-checker-extension` 目录。
2. 修改 `frontend/` 下的代码。
3. 运行 `npm run build` 重新构建。
4. 在浏览器扩展管理页点击 **刷新** 图标即可生效。
