# dsh-better-approve

[![npm version](https://img.shields.io/npm/v/dsh-better-approve.svg)](https://www.npmjs.com/package/dsh-better-approve)
[![License: MIT](https://img.shields.io/github/license/AngelosZou/dsh-better-approve)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%E2%89%A522.19-339933?logo=node.js&logoColor=white)](package.json)
[![DSH](https://img.shields.io/badge/DSH-0.2.1-4D6BFE)](https://github.com/deepseek-ai/deepseek-harness)

[English](README.md) | **简体中文**

为 DeepSeek Harness 原生 **自动审查（Auto review / Approve for me）** 提供一个增强实现。提供了自定义的审查模型、思考强度，以及修改审查未通过时的反馈方式，支持跳过人工审核自动拒绝。此外还修复了原生审查可能存在的问题。

## 功能

插件在 DSH 启用了自动审查权限模式后增加了一个新的审查设置面板。其中包含：
- **自定义审核模型**：可以自定义用于审查的提供方、模型、及思考强度。选项来源于 DSH 中已经配置的模型。
- **支持自动拒绝**：自定义审核未通过的表现。原生自动审核在审核未通过后会要求用户进行二次手动审核，这会暂停当前会话。如果没有人工介入，这会阻塞 Agent 进行的长任务。插件提供了一个自动拒绝的选项，可以使审核拒绝后自动将审核结果以未通过的形式返回请求者，避免阻塞会话。
- **可复用预设**：把当前设置保存为预设，之后一键应用到其他会话。
- **修复原生审查模型失败**：审查请求不再发送 `temperature`，解决原生自动审核在该类接口下发生错误的问题。

## 环境要求

- DeepSeek Harness `>=0.2.1-rc.2 <0.3.0`

## 安装

推荐通过 npm 进行安装：

```bash
dsh plugin --profile web add dsh-better-approve
```

你也可以将本仓库的地址提供给一个 DSH 的会话并要求 Agent 完成安装。

## 使用

1. 启用 DSH 原生实验性插件**自动授权审查**
2. 在会话的权限选择器中选择 **自动审查**（原生入口不变）。
3. 输入框工具行中会出现 **审查设置** 按钮；点击打开当前会话的设置。
4. 选择审查模型来源：
   - 跟随当前会话模型（默认）；
   - 或指定提供方、模型与思考强度。
5. 选择“未通过时”的处理方式。
6. 需要复用时点击“保存为预设”；之后其他会话可直接在“预设”下拉框中选择。

## 安全性

- **请仅使用可信的提供方用于模型审核。恶意的提供方会放大遭受攻击的风险。**
- 审查提示词与固定风险策略、风险分级（low / medium / high）与会话历史重建逻辑与原生实现一致。
- 审查提示词包含重建的会话上下文与待执行调用，并发送给该会话配置的审查提供方（默认即会话自身路由）。**请勿选择你不愿分享该上下文的审查提供方**。
- 与原生自动审查一样，本插件不提供文件沙箱；被允许的调用会以完全权限执行。**自动审查仍然有误判的风险**。

## 参与贡献

欢迎提交 issue 与 pull request。开发流程见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## License

MIT —— 见 [LICENSE](LICENSE)。Copyright (c) 2026 Yutong Zou.

本项目与 DeepSeek 无隶属或背书关系。项目包含派生自 DeepSeek Harness 的代码（同样为 MIT 许可），归属说明与上游许可全文见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
