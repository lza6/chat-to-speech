---
name: chat-tts-evolve
description: 在线聊天转语音项目的持续演进工作流。新增 API/功能/引擎/端点前先读本 skill 判断是否过时，过时则更新，未过时则直接查实际代码编码。覆盖三闭环（AI对话/文本转语音/整页朗读）+ 四级降级链（引擎1→1.5本地中文WASM→2→3）+ 推理清洗 + 并发合成池 + Service Worker 离线缓存 + 中文音素器 + E2E/单元测试基线 + 文档同步铁则。
---

# chat-tts-evolve — 在线聊天转语音项目演进工作流

## 何时使用

当你在本项目（`免费的在线聊天转语音/`）做以下任一工作时：
- 新增 TTS 引擎 / 聊天端点 / API 接入
- 修改 `demo.html` 内联 JS（三闭环逻辑、降级链、清洗、并发池、中文音素器、WASM 引擎1.5）
- 修改 `sw.js`（缓存策略）/ `site.webmanifest`（PWA）
- 修改 `tts-zh.js` / `engines/`（中文音素器与 vendor 兜底）
- 修改 `e2e-test*.cjs` / `unit-test*.cjs` / 测试夹具
- 修改 `README.md` / `workflow_status.md` / `优化计划/*.md`
- 发版（git tag）

## 启动协议（CRITICAL，每次必做）

1. **先读本 skill**（chat-tts-evolve）判断是否过时（看下方"项目当前状态基线"的日期 vs 你当前的 git log / 文件 mtime）。
2. **过时** → 先更新本 skill 的"项目当前状态基线"节，再编码。
3. **未过时** → 直接查实际代码（用 Grep 按标识符定位，不整文件 Read），按下方"编码铁则"动手。
4. **编码前必查** `优化计划/下一步改进指南-v4.2升级版.md`（修正指令：哪些旧结论已死、v4.2 按什么顺序做）→ 再查 `优化计划/下一步改进指南.md`（重写版，v4.2→v5→v6+ 全量节点定义）的"执行顺序与依赖图"。**历史残留**：`下一步改进指南-v3基线归档.md` / `-v4.1基线归档.md` 为历史参考，不作为依据。
5. **编码后必跑** 下方"验证命令"清单，真实通过才能声称完成。

## 项目当前状态基线（2026-09-07 v4.2 落地 · tag v4.2.0）

> **过时判据**：若 `demo.html` / `e2e-test*.cjs` / `workflow_status.md` / `优化计划/*.md` 的 mtime 晚于上方日期，或 git log 有新 commit，本节可能过时，需先核验再采信。

### 三文件架构（硬约束，不得破坏）

- `demo.html`（**1676 行**，全部 JS/CSS 内联 + 引擎1.5 WASM 中文音素器内联版）— 主文件，三闭环逻辑全在此（四级降级链）
- `sw.js`（143 行）— Service Worker：同源 NetworkFirst + 跨域 uncloseai.com SWR 7 天 TTL + maxEntries=50 + ETag 304
- `site.webmanifest`（20 行）— PWA 清单，display:standalone
- **引擎1.5 伴随文件（不进三文件承诺，但必须入库）**：`tts-zh.js`（167 行，Node 可测的中文音素器/voice 表，与 demo.html 内联版双实现同步）、`engines/pinyin-pro.mjs`（468KB，jsdelivr vendor 兜底）、`engines/kokoro-js.mjs`（2.1MB，jsdelivr vendor 兜底）
- **单文件部署承诺**：demo.html + site.webmanifest + sw.js 三文件可直接托管到任意静态服务；引擎1.5 运行时从 cdnd.jsdelivr.net / huggingface.co 拉依赖（已入 CSP 白名单），CDN 不可达时退回同源 `engines/` vendor（需一并托管）

### 四级降级链（改引擎时必读）

```
synthChain(text, voice, speed, myId):
  引擎1 在线 F5-TTS（probeTtsEndpoint 探测，up 才进）
    ├ pLimit(3) 并发池（与官方限流 3 req/s 对齐）
    ├ prefetchPromises[i] 幂等缓存（顺序播放保证）
    ├ 429 退避：lowerMax(2) 降并发 + fetchTTSChunk 指数退避
    └ 维持 3 在途：播放第 i 块时预取第 i+3 块
  → 失败降级
  引擎1.5 本地中文 WASM（Kokoro 82M q8f16 ONNX + pinyin-pro 音素器）
    ├ 触发条件：含 CJK 汉字（/\p{Script=Han}/u）且 cfg.engines_enabled.engine15 !== false 且 WebAssembly 可用
    ├ canUseZhWasm() 预检（WASM + kokoro-js/pinyin-pro 动态 import，结果缓存 + zhWasmFailReason 透出）
    ├ generateZhWithVoice 适配层：tokenizer→input_ids→generate_from_ids（绕过 kokoro-js@1.2.1 英文 voice 白名单 zf_xiaobei 必抛错，且避免二次 espeak）
    ├ 分块合成：按 splitIntoChunks 逐块 phonemize+generate+按序播放（规避 5000 字无标点截断）
    ├ WAV：wavFromSamples 显式 Float32/Int16/Array 分支
    └ 质量自评 C/D，徽章文案禁用"高质量"，用"本地可用"
  → 失败降级
  引擎2 浏览器 SpeechSynthesis（synthWithBrowser + stallGuard 轮询守护 onend 不触发）
  → 失败降级
  引擎3 文本兜底（synthFallbackText 复制到剪贴板）
```

### 引擎1.5 关键标识符（Grep 定位，行号会漂移）

| 用途 | 标识符 |
|------|--------|
| 降级链入口 | `async function synthChain` |
| 引擎1.5 调度分支 | `cfg.engines_enabled.engine15 !== false` |
| 依赖预检 | `async function canUseZhWasm` / `zhWasmFailReason` / `resetZhWasmAvailability` |
| 引擎1.5 主流程 | `async function synthWithZhWasm` / `zhWasmBusy` |
| 中文 voice 适配 | `async function generateZhWithVoice`（`generate_from_ids`）|
| WAV 转换 | `function wavFromSamples` |
| 中文 IPA 音素器（内联）| `async function phonemizeZh` / `function zn` / `function zmap` |
| 设置面板自检 | `#cfg-eng15-check` |
| 中文音素器（Node 可测）| `tts-zh.js` `normalizeSyllable` / `phonemizeChinese` / `VOICES_ZH` |
| **修改提醒** | demo.html 内联 `phonemizeZh/zn/zmap` 与 `tts-zh.js` 是**双实现**，改一处必须同步另一处（U_ZH_4/5 断言守护）|

### CSP 现状（引擎1.5 落地后，2026-09-07）

```html
<META 内联 CSP content="default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://uncloseai.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://huggingface.co; style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://uncloseai.com; connect-src 'self' https://uncloseai.com https://speech.ai.unturf.com https://hermes.ai.unturf.com https://huggingface.co https://cdn.jsdelivr.net; img-src 'self' data: https:; font-src 'self' data: https://uncloseai.com; media-src 'self' blob: data:; manifest-src 'self' data:; frame-src 'none'; object-src 'none'; base-uri 'self'">
```
- `'unsafe-eval'` 为 WASM 引擎1.5 必需（v4.3 P3-1 计划用编译后 wasm 收敛）
- 新增 **任何** 动态加载域必须同步 `script-src` + `connect-src`，否则引擎1.5 静默降级（`engine15-probe` 日志）

### 测试基线（必须全绿才能发版）

| 套件 | 文件 | 项数 | 实测（2026-09-07）|
|------|------|------|------|
| E2E 主套件 | `e2e-test.cjs` | T1-T17 = 17 | ✅ 17/17 |
| E2E SW 跨域 | `e2e-test-sw.cjs` | T_SW_1-3 = 3 | ✅ 3/3 |
| E2E 配置中心 | `e2e-test-cfg.cjs` | T_CFG_1-5 = 5 | ✅ 5/5 |
| E2E 引擎1.5 | `e2e-test-zh.cjs` | T_ZH_1-4 = 4 | ✅ 4/4（含自检按钮诊断）|
| 单元 推理清洗 | `unit-test.cjs` | U_CLEAN 7 + 22 样本 | ✅ 7/7 |
| 单元 并发池 | `unit-test-pool.cjs` | U_POOL 4 | ✅ 4/4 |
| 单元 配置中心 | `unit-test-cfg.cjs` | U_CFG 8 | ✅ 8/8 |
| 单元 中文引擎 | `unit-test-zh.cjs` | U_ZH 9（音素器+voice 表+WAV 四分支+CJK 判定）| ✅ 9/9 |
| **合计** | — | **57** | **✅ 57/57** |

> **基线说明**：v4.1 为 44/44（17+3+5+19）；v4.2 起 57/57（新增 T_ZH 4 + U_ZH 9，unit-zh 从 0→9）。

### 文档基线（必须与代码同步）

- `README.md` — v4.2（四级降级链 + 引擎1.5 结构性前提披露 + CSP 披露 + 57/57 基线 + 复跑命令）
- `变更报告.html`（v2 历史）/ `变更报告-v4.html`（v4）/ `变更报告-v5.html`（v4.2 引擎1.5 + CRITIC 两轮，含底部交互测验）
- `workflow_status.md` — N4 表 17 项真实枚举 + §8 v4/v4.1/v4.2 落地进度
- `优化计划/` — 4 份：`下一步改进指南.md`（主重写版，挂接 v4.2 落地态）+ `下一步改进指南-v4.2升级版.md`（★ 修正指令：Kokoro 中文路线三 A/B/C、README 断言已失效、模型体积 82MB、CRITIC 取证）+ 2 份历史归档
- `chat-tts-evolve.skill.md`（本文件）— 每次发版更新基线节

### 外部依赖（2026-09-07 实测）

- `speech.ai.unturf.com/v1` — 在线 F5-TTS，**持续 502**（长期停摆，用户可 ⚙️ 自带端点）
- `hermes.ai.unturf.com/v1` — 聊天，**200**（存活，CORS `*`）
- `uncloseai.com/uncloseai.js` — 远程 ES module，**200**（SW 跨域 SWR 缓存）
- `cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js` — **200**（2.1MB，vendor `engines/kokoro-js.mjs`）
- `cdn.jsdelivr.net/npm/pinyin-pro@3.28.2/+esm` — **200**（468KB，vendor `engines/pinyin-pro.mjs`）
- `huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX` — 模型仓（**82MB** `onnx/model_q8f16.onnx` + 8 中文 voice `zf_*`/`zm_*`，blobs API 实测；请勿写 86MB）
- **官方限流**：每 IP 每端点 3 req/s（引擎1 pLimit max=3 恰卡边界）

## 编码铁则

### 1. 复用优先，不造轮子
- 新增 TTS 引擎前先读 `优化计划/下一步改进指南-v4.2升级版.md` 第三章（Kokoro 中文路线已证伪与三路线 A/B/C），不重走 P0-1 老路
- 改 SW 缓存策略前先加载 `pwa-development` skill 参考
- 改引擎1.5 前先确认 `engines/` vendor 是否已覆盖（缺则 curl jsdelivr 落库）
- 禁止 monkey-patch kokoro-js 冻结对象（`_validate_voice`/`Object.freeze` voice 表）——中文走 `generate_from_ids` 适配层

### 2. TDD 先行
- 新功能先写 RED 测试（`unit-test*.cjs` 单元 + `e2e-test*.cjs` E2E），跑确认 FAIL
- 再写 GREEN 最小实现，最后 REFACTOR 跑确认仍 PASS
- **无测试不合并**；每完成 3 个节点跑一次全量回归（57 项）

### 3. 真实验证，不假实现
- 所有"已完成"必须有实际运行命令 + 真实输出
- 引擎1.5 的「真机出声」是外部受限（82MB WASM 推理 + iOS 内存）——**只能标"待真机"，不得标已完成**；代码路径是否闭环看 T_ZH_1（含 `engine15` 尝试痕迹断言）+ T_ZH_4（自检按钮）
- 模型体积/voice 清单/依赖可用性等数字必须联网核验，禁止套用未验证数字

### 4. 不破坏核心价值
- "纯前端、无构建、单文件可部署"是硬约束；demo.html + site.webmanifest + sw.js 可直接托管
- 引擎1.5 依赖走 CSP 白名单域名（jsdelivr/huggingface.co）+ `engines/` vendor 兜底，不得悄悄加未放行域名
- package.json 仅声明 playwright 测试依赖，不引入构建工具链

### 5. 文档同步
- 改代码后必同步 `README.md` + `workflow_status.md` + `优化计划/*.md`（v4.2升级版优先）
- 发版前 `grep` 校验无陈旧数字残留（57/57、1676 行、82MB、engine15）
- 引擎1.5 内联版与 tts-zh.js 双实现：改一处同步另一处 + 跑 U_ZH_4/5 断言

## 验证命令清单（每次改动后跑）

```bash
# 0. 静态语法检查（无需浏览器，秒级）
node --check tts-zh.js unit-test-zh.cjs e2e-test-zh.cjs
# demo.html 内联 JS 抽出后 check（node -e 提取 <script type="module"> 内容到临时文件再 node --check）

# 1. 单元测试（纯逻辑，无需浏览器）
node --test unit-test.cjs unit-test-pool.cjs unit-test-cfg.cjs unit-test-zh.cjs   # 28 项

# 2. 启动静态服务器（后台，8765 若被占用先杀）
npm run serve

# 3. E2E 测试（需 node_modules 已装 playwright）
node e2e-test.cjs        # 17 项
node e2e-test-sw.cjs     # 3 项
node e2e-test-cfg.cjs    # 5 项
node e2e-test-zh.cjs     # 4 项（引擎1.5，含自检按钮）

# 4. 文档一致性检查
grep -n "44/44\|19/19\|86MB\|未落地" README.md workflow_status.md 优化计划/*.md   # 应无过时残留
```

## 修改范围与禁区

- **允许修改**：`demo.html`、`sw.js`、`site.webmanifest`、`tts-zh.js`、`engines/`、`e2e-test*.cjs`、`unit-test*.cjs`、`test-cases/*.json`、`README.md`、`workflow_status.md`、`优化计划/*.md`、`package.json`、`.gitignore`、`变更报告-v5.html`
- **禁区（不得碰）**：`上游资料/*.txt`（只读）、`变更报告.html`（v2 历史产物）、git 历史（禁止 `git reset --hard`/force push/amend 用户提交）
- **禁止入库**：API Key、真实用户数据、`node_modules/`、`verify-*.cjs`（临时验证脚本）、`server.cjs`（临时调试）、`.tmp-e2e/`
- **禁止操作**：真实付费 API 调用（预算默认 0）；`git reset --hard`/`git clean`/force push

## 已知边界（诚实披露，改引擎1.5 必读）

1. **真机出声待测**：70MB 模型 + WASM 推理在 headless 不可跑；真机路径 = ⚙️ 引擎1.5 自检（依赖可达）→ 朗读中文（出声复验）。若真机失败回落引擎2/3。
2. **质量自评 C/D**：Kokoro 官方 voice 表 `targetQuality:C / overallGrade:D`，UI 文案禁用"高质量"。
3. **`unsafe-eval`**：WASM 必需；v4.3 P3-1 计划收敛（用编译后 wasm + nonce 化）。
4. **iOS Safari WASM 内存**：待真机压测，禁止预设数字。
5. **双实现漂移风险**：demo.html 内联音素器与 tts-zh.js 独立维护，U_ZH_4/5 断言 + U_ZH_8（WAV）守护，改一处必须同步。

## 停止条件

### 可停止并交付
- 所有验收标准通过且有证据；无未解决 P0/P1；必要文档已同步；剩余风险已披露

### 停止循环并报告阻塞（而非无限尝试）
- 缺不可替代的凭证/权限/环境（真机出声、联网权限）
- 引擎1.5 依赖（kokoro-js/pinyin-pro/HF 模型）均不可达 → 记录 `engine15-probe` 并回落到引擎2/3 交付
- 同一阻塞经两次有意义的替代尝试仍无进展

## 相关文档

- `优化计划/下一步改进指南-v4.2升级版.md` — ★ **修正指令**（2026-09-07 复核：kokoro-js@1.2.1 不支持中文四重证据 / PR#352 diff 全解析 / README 断言已失效 / 模型体积 82MB / P0-1 重定义三路线 A/B/C / 十节待验证 V1-V12）
- `优化计划/下一步改进指南.md` — 主重写版（v4.2→v5→v6+ 全量节点定义 + TDD 80+ 清单 + 18 验收红线；头部已挂接 v4.2 落地态）
- `workflow_status.md` — 任务台账 + v4/v4.1/v4.2 落地进度（§8 起始）
- `变更报告-v5.html` — v4.2 引擎1.5 变更报告 + 交互测验（底部 5 题）
- `变更报告-v4.html` — v4 变更报告 + 测验（历史）

## 下次会话启动检查清单

1. 读本 skill（chat-tts-evolve）的"项目当前状态基线"日期（2026-09-07 v4.2）
2. `git log --oneline -6` 看是否已有晚于 v4.2 的 commit
3. `ls -la demo.html e2e-test*.cjs workflow_status.md 优化计划/` 看 mtime
4. 若有变化 → 先更新本 skill 基线节，再编码
5. 若无变化 → 先读 `优化计划/下一步改进指南-v4.2升级版.md` 确认修正指令，再 Grep 定位标识符编码
6. 编码后跑"验证命令清单"（57/57）
7. 更新 `workflow_status.md` 落地进度 + README + 变更报告