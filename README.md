# 大学英语智课通

面向“大学英语”课程的学习通原型，包含管理员、教师、学生三端，以及课程资源、章节编辑、题库组卷、作业批改、学情分析和 AI 助教。

## 本地运行

```bash
npm install
npm run dev
```

本地模式会启动 React 前端和 Express API。DeepSeek key 可放在项目根目录 `apikey.txt`，或使用 `DEEPSEEK_API_KEY=你的key npm run dev`。

## GitHub Pages

GitHub Pages 公开访问版：

- 前端地址：<https://owenzhao9.github.io/chaoxing-lite-course-platform/>
- 后端地址：<https://chaoxing-lite-course-api.vercel.app/api>

线上前端通过 `VITE_API_BASE_URL=https://chaoxing-lite-course-api.vercel.app/api` 连接 Vercel 后端，由后端安全读取 `DEEPSEEK_API_KEY` 并调用真实 DeepSeek API。API Key 不会进入前端打包产物。

如需发布静态离线演示版，执行 `npm run build:pages -- --base /chaoxing-lite-course-platform/`。如需发布连接真实后端的 Pages 版，执行：

```bash
VITE_API_BASE_URL=https://chaoxing-lite-course-api.vercel.app/api npm run build:pages:api -- --base /chaoxing-lite-course-platform/
```

当前公开访问版发布在 `gh-pages` 分支。更新站点时重新构建 `dist`，再把 `dist` 推送到 `gh-pages` 分支即可。

## 操作文档

完整演示步骤见 `docs/使用文档.md`。
