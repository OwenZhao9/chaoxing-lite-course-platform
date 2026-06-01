# 大学英语智课通

面向“大学英语”课程的学习通原型，包含管理员、教师、学生三端，以及课程资源、章节编辑、题库组卷、作业批改、学情分析和 AI 助教。

## 本地运行

```bash
npm install
npm run dev
```

本地模式会启动 React 前端和 Express API。DeepSeek key 可放在项目根目录 `apikey.txt`，或使用 `DEEPSEEK_API_KEY=你的key npm run dev`。

## GitHub Pages

GitHub Pages 部署的是静态演示版，使用 `VITE_STATIC_DEMO=true` 内置演示数据运行，不会读取或暴露 `apikey.txt`，也不会调用真实 DeepSeek API。

当前公开访问版发布在 `gh-pages` 分支。更新站点时重新执行 `npm run build:pages`，再把 `dist` 推送到 `gh-pages` 分支即可。

## 操作文档

完整演示步骤见 `docs/使用文档.md`。
