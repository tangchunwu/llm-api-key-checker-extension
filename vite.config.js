import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

/**
 * @description Vite 配置文件。
 * @see https://vitejs.dev/config/
 */
export default defineConfig({
    // 指定前端项目的根目录为 'frontend'
    root: 'frontend',
    // 配置 Vite 插件
    plugins: [
        vue(), // 启用 Vue 3 单文件组件支持
    ],
    // 配置模块解析别名
    resolve: {
        alias: {
            // 设置 '@' 别名，指向 './frontend/src' 目录，方便导入模块
            '@': fileURLToPath(new URL('./frontend/src', import.meta.url))
        }
    },
    // 开发服务器配置
    // 开发服务器配置
    server: {
        port: 5173
    },
    // 构建配置
    build: {
        outDir: '../dist', // 输出到项目根下的 dist
        emptyOutDir: true,
        rollupOptions: {
            // 确保 manifest.json 和 background.js 被包含
            input: {
                main: fileURLToPath(new URL('./frontend/index.html', import.meta.url)),
            }
        }
    },
    // 基础路径设为相对，确保插件内资源加载正确
    base: '',
});
