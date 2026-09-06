---
name: chat-tts-evolve
description: 在线聊天转语音项目的持续演进工作流。新增 API/功能/引擎/端点前先读本 skill 判断是否过时，过时则更新，未过时则直接查实际代码编码。覆盖三闭环（AI对话/文本转语音/整页朗读）+ 三级降级链 + 推理清洗 + 并发合成池 + Service Worker 离线缓存 + E2E/单元测试基线 + 文档同步铁则。
---

# chat-tts-evolve — 在线聊天转语音项目演进工作流

## 何时使用

当你在本项目（`免费的在线聊天转语音/`）做以下任一工作时：
- 新增 TTS 引擎 / 聊天端点 / API 接入
- 修改 `demo.html` 内联 JS（三闭环逻辑、降级链、清洗、并发池）
- 修改 `sw.js`（缓存策略）/ `site.webmanifest`（PWA）
- 修改 `e2e-test.cjs` / `unit-test.cjs` / `unit-test-pool.cjs` / 测试夹具
- 修改 `README.md` / `workflow_status.md` / `优化计划/*.md`
- 发版（git tag）

## 启动协议（CRITICAL，每次必做）

1. **先读本 skill**（chat-tts-evolve）判断是否过时（看下方"项目当前状态基线"的日期 vs 你当前的 git log / 文件 mtime）。
2. **过时** → 先更新本 skill 的"项目当前状态基线"节，再编码。
3. **未过时** → 直接查实际代码（用 Grep 按标识符定位，不整文件 Read），按下方"编码铁则"动手。
4. **编码前必查** `优化计划/下一步改进指南.md`（重写版，下游以此为准）的"七、执行顺序与依赖图"，确认你的改动节点的前置是否已 PASS。**注意**：旧版的 `全阶段落地闭环完整的步骤+多agent子代理并行计划.md` / `全阶段落地步骤拆解-每小步详解.md` / `项目全栈分析报告-stage-*.md` 已于 2026-09-07 删除（部分描述过时，如 cleanAssistantText 误记为 3 前缀，实际为 7 规则管线），仅 `下一步改进指南.md` 与 `下一步改进指南-v3基线归档.md` 保留。
5. **编码后必跑** 下方"验证命令"清单，真实通过才能声称完成。

## 项目当前状态基线（2026-09-07 stage-mtpqxr8w）

> **过时判据**：若 `demo.html` / `e2e-test.cjs` / `workflow_status.md` 的 mtime 晚于上方日期，或 git log 有新 commit，本节可能过时，需先核验再采信。

### 三文件架构（硬约束，不得破坏）

- `demo.html`（~1220 行，全部 JS/CSS 内联，零框架零构建）— 主文件，三闭环逻辑全在此
- `sw.js`（85 行）— Service Worker，网络优先回退缓存，跨域不缓存
- `site.webmanifest`（19 行）— PWA 清单，display:standalone，icons 仅 1 SVG
- **单文件部署承诺**：三文件可直接托管到任意静态服务（GitHub Pages/Vercel/Nginx/CDN），无构建步骤

### 三闭环代码锚点（行号会漂移，用 Grep 按标识符定位）

| 闭环 | 关键函数 | 标识符（Grep 用） |
|------|---------|------------------|
| ② 文本转语音 | `synthChain` 三级降级链 | `async function synthChain` |
| ② 引擎1 在线 | `fetchTTSChunk` + `probeTtsEndpoint` | `async function fetchTTSChunk` / `async function probeTtsEndpoint` |
| ② 引擎2 浏览器 | `synthWithBrowser`（stallGuard 守护） | `function synthWithBrowser` |
| ② 引擎3 文本兜底 | `synthFallbackText`（剪贴板） | `async function synthFallbackText` |
| ② P1-3 并发池 | `pLimit`（手写，max=3 + 429 退避） | `function pLimit` |
| ③ 整页朗读 | `extractReadableText` + `cleanAssistantText` | `function extractReadableText` / `function cleanAssistantText` |
| ③ 推理清洗 | `CLEAN_RULES` 7 规则管线 | `const CLEAN_RULES` |
| ① AI 对话 | uncloseai.js widget（远程 module） | `window.UNCLOSEAI_` |
| 模型动态发现 | `fetchRealModel`（30 分钟缓存） | `async function fetchRealModel` / `MODEL_CACHE_TTL` |
| 语音列表缓存 | `initVoices` + `VOICES_CACHE_KEY`（24h） | `async function initVoices` / `VOICES_CACHE_TTL` |
| 停止 | `stopPlayback`（cancel audio + SpeechSynthesis + 解锁 resolve） | `function stopPlayback` |
| SW 注册 | `navigator.serviceWorker.register('./sw.js')` | `serviceWorker.register` |

### 测试基线（必须全绿才能发版）

- `e2e-test.cjs` — 17 项 T1-T17（Playwright headless），`BASE=http://localhost:8765` 硬编码
- `unit-test.cjs` — U_CLEAN_1-4 + 边界（node:test，22 样本夹具）
- `unit-test-pool.cjs` — U_POOL_1-4（并发池 + 429 退避）
- `test-cases/推理清洗样本.json` — 22 真实推理回复样本
- **T1-T17 真实通过数**：待 `npm install` + 复跑确认（v3 文档称 16/16 但系 v2 残留旧枚举，已废弃）

### 文档基线（必须与代码同步）

- `README.md` — 三处数字已修正（:101 无SW→已集成 / :133 13项→17项 / :141 13/13→待复跑）
- `workflow_status.md` — N4 表已整套重写为真实 17 项枚举，§8 记录 v4 落地进度
- `优化计划/` — 5 份文档（全栈分析×2 + 改进指南 + 并行计划 + 每小步详解）

### 外部依赖（v3 文档记录，待联网复测）

- `speech.ai.unturf.com/v1` — 在线 F5-TTS，2026-09-06 持续 502（待复测）
- `hermes.ai.unturf.com/v1` — 聊天，CORS 放行 `*`，模型 `Lorbus/Qwen3.6-27B-int4-AutoRound`（推理型）
- `uncloseai.com/uncloseai.js` — 远程 ES module，离线即聊天全挂（SW 跨域不缓存）
- **官方限流**：每 IP 每端点 3 req/s（硬约束，pLimit max=3 恰卡边界）

## 编码铁则

### 1. 复用优先，不造轮子
- 新增 TTS 引擎前先查 `gh search repos` + `npm search`（WASM 候选优先 piper/Kokoro/sherpa-onnx）
- 改 SW 缓存策略前先加载 `pwa-development` skill 参考
- 改推理清洗前先查现有 `CLEAN_RULES` 是否已覆盖你的场景

### 2. TDD 先行
- 新功能先写 RED 测试（`unit-test.cjs` 单元 + `e2e-test.cjs` E2E），跑确认 FAIL
- 再写 GREEN 最小实现
- 最后 REFACTOR，跑确认仍 PASS
- **无测试不合并**

### 3. 真实验证，不假实现
- 所有"已完成"必须有实际运行命令 + 真实输出
- E2E 基线 17 项必须先复跑确认真实通过数，才能声称"基线绿"
- WASM 候选所有数字/许可/模型名必须联网验证，禁止套用未验证数字

### 4. 不破坏核心价值
- v3 的"纯前端、无构建、单文件可部署"是硬约束
- 任何节点不得破坏（`demo.html` + `site.webmanifest` + `sw.js` 三文件可直接托管）
- 引入 `package.json` 仅声明 playwright 依赖，不引入构建工具链

### 5. 文档同步
- 改代码后必同步 `README.md` + `workflow_status.md` + 相关 `优化计划/*.md`
- 发版前 `grep` 校验无陈旧数字残留

## 验证命令清单（每次改动后跑）

```bash
# 0. 静态语法检查（无需浏览器，秒级）
node --check unit-test.cjs
node --check unit-test-pool.cjs
node --check e2e-test.cjs

# 1. 单元测试（纯逻辑，无需浏览器）
node --test unit-test.cjs          # U_CLEAN_1-4 + 22 样本
node --test unit-test-pool.cjs     # U_POOL_1-4

# 2. 启动静态服务器（后台）
npm run serve                      # 或 python -m http.server 8765

# 3. E2E 测试（需 npm install + npx playwright install chromium）
node e2e-test.cjs                  # 17 项 T1-T17

# 4. 文档一致性检查
grep -n "13 项\|13/13\|无 Service Worker" README.md   # 应无残留
grep -n "16/16" workflow_status.md                      # 应无残留
```

## 修改范围与禁区

- **允许修改**：`demo.html`、`sw.js`、`site.webmanifest`、`e2e-test.cjs`、`unit-test.cjs`、`unit-test-pool.cjs`、`test-cases/*.json`、`README.md`、`workflow_status.md`、`优化计划/*.md`、`package.json`、`.gitignore`
- **禁区（不得碰）**：`上游资料/*.txt`（只读）、`变更报告.html`（v2 历史产物）、`变更报告-v4.html`（本 stage 产物，除非用户要求重写）、git 历史（禁止 `git reset --hard`/force push/amend 用户提交）
- **禁止入库**：API Key、真实用户数据、`node_modules/`、`verify-*.cjs`（临时验证脚本）、`server.cjs`（临时调试）
- **禁止操作**：commit/push/deploy（除非用户明确要求）；真实付费 API 调用（预算默认 0）；`git reset --hard`/`git clean`/force push/amend 用户历史

## 降级链与并发池设计（改引擎时必读）

```
synthChain(text, voice, speed, myId):
  引擎1 在线 F5-TTS（probeTtsEndpoint 探测，up 才进）
    ├ pLimit(3) 并发池（与官方限流 3 req/s 对齐）
    ├ prefetchPromises[i] 幂等缓存（顺序播放保证）
    ├ 429 退避：lowerMax(2) 降并发 + fetchTTSChunk 指数退避
    └ 维持 3 在途：播放第 i 块时预取第 i+3 块
  → 失败降级
  引擎2 浏览器 SpeechSynthesis（synthWithBrowser + stallGuard 轮询守护 onend 不触发）
  → 失败降级
  引擎3 文本兜底（synthFallbackText 复制到剪贴板）
```

## 推理清洗 7 规则（改清洗时必读）

CLEAN_RULES 数组，顺序敏感（前规则剥离后规则才匹配）：
1. XML 标签整段（`<think>`/`<reasoning>`/`<analysis>`）
2. markdown 代码块（` ```thinking ` / ` ```reasoning ` / ` ```analysis `）
3. markdown 标题区块（`### 思考过程` / `### Reasoning` / `### Analysis` 到下个同级标题）
4. 多前缀整块（要求 `\n` 防止误删正文中的"思考"词）
5. 行内前缀行（`思考:` / `Reasoning:` / `Analysis:`，要求冒号）
6. 尾部"以上是思考过程，仅供参考。"
7. 尾部"以上是思考。"

**新增前缀**：往规则 4 的交替组加，并往 `test-cases/推理清洗样本.json` 加样本。

## 停止条件

### 可停止并交付
- 所有验收标准通过且有证据
- 无未解决 P0/P1
- 必要文档已同步（README + workflow_status）
- 剩余风险已披露

### 停止循环并报告阻塞（而非无限尝试）
- 缺不可替代的凭证/权限/环境（如真机、联网权限）
- WASM 候选（piper/Kokoro/sherpa-onnx）均不可用 → P0-1 暂缓
- 同一阻塞经两次有意义的替代尝试仍无进展

## 相关文档

- `优化计划/下一步改进指南.md` — ★ v3→v4→v5→v6+ 全栈迭代路线图（重写版，2026-09-07，下游以此为准；含第一性原理 + TDD 清单 60+ + 验收红线 15 条 + 待验证项 V1-V10）
- `优化计划/下一步改进指南-v3基线归档.md` — v3 时代对 v4 的初步规划（历史参考，部分描述已过时，如 cleanAssistantText 误记为 3 前缀，实际为 7 规则管线）
- `workflow_status.md` — 任务台账 + v4 落地进度（§8）
- `变更报告-v4.html` — v4 变更报告 + 测验（stage-mtpqxr8w 产物）

## 下次会话启动检查清单

1. 读本 skill（chat-tts-evolve）的"项目当前状态基线"日期
2. `git log --oneline -5` 看是否有新 commit 晚于基线日期
3. `ls -la demo.html e2e-test.cjs workflow_status.md` 看 mtime
4. 若有变化 → 先更新本 skill 基线节，再编码
5. 若无变化 → 直接 Grep 定位标识符编码
6. 编码后跑"验证命令清单"
7. 更新 `workflow_status.md` §8 落地进度
