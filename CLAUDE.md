@AGENTS.md

# CLAUDE.md — Claude Code 补充

本文件只放 Claude Code 的操作差异。项目规则、设计规范、安全约束以 `AGENTS.md` 和 `DESIGN.md` 为准；两者冲突时按 `AGENTS.md` 第 10 章处理。

- 界面、原型、组件、界面文案任务开始前，用 `Read` 完整读取 `docs/brief.md`、`DESIGN.md` 和 `docs/wireframes.md`，不要只读摘要或凭记忆。
- 修改 UI 前先看 `DESIGN.md` 第 1、2、3、5 章和附录 B 的本期范围；超出范围先停下来说明。
- 页面结构、P0/P1/P2 与线框以 `docs/wireframes.md` 为准；未确认结构前不写页面 HTML/CSS。
- 视觉验证优先用真实 Electron 窗口：开发版 CDP 端口 9223，安装版 9224；截图尺寸 440×680，必要时加 125% / 150% 缩放。
- 回复、文档、提交信息用中文；代码注释也用中文。
- 提交前确认工作区状态；提交信息结尾保留：
  `Co-Authored-By: Claude Code <noreply@anthropic.com>`
- 不自行创建 Release、不自行改线上资产；发版前先构建、安装并验证，再向 William 报告。
- 遇到规则无法执行、参考不足或需要扩大范围时，停下来说明，不自行假设。
