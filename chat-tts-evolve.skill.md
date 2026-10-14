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

## 项目当前状态基线（2026-10-14 v4.7.1 落地 · 126/126 PASS）

> **过时判据**：若 `demo.html` / `e2e-test*.cjs` / `workflow_status.md` / `计划书/*.md` 的 mtime 晚于上方日期，或 git log 有新 commit，本节可能过时，需先核验再采信。
> **本会话状态快照**：另见 `.claude/SESSION-STATE.md`（含"已跑过的测试/已做过的优化/环境特性"，**优先读取以避免重复劳动**）。

### v4.7.1 新增硬规则（2026-10-14，血泪教训）

1. **改 `demo.html` 后必须 `cp demo.html dist/index.html`** —— CI 有 `diff -q` 硬检查，不同步则推送即红。
2. **新增 E2E 套件必须同时改三处**：`verify-acceptance.cjs` 的 `E2E_FILES`、`ci.yml` 的 shard 分片列表、`package.json` 的 `test:all`。**否则测试只在本地跑、CI 给假绿灯**（`e2e-test-v47.cjs` 8 项曾长期未进 CI）。
3. **重构 HTML 结构后必须全局搜索受影响的 `getElementById`** —— v4.6 把面板收进 `#data-panel` 时漏改了 `wireTimelineUI`/`wireMemoryUI`，导致两个顶部按钮死了一年（`if (!btn || !panel) return;` 静默返回）。
4. **共用 CSS 类 + 全局 `querySelectorAll` = 跨面板污染** —— `#wizard-panel` 与 `#data-panel` 复用 `.wizard-tab`/`.wizard-body`，向导切 tab 会清空数据管理面板。**wiring 一律限定作用域**。
5. **状态机的「重置点」比「状态表」更易错** —— `playBlocked` 曾漏声明（非严格模式下成全局变量、永不重置）。新增状态变量必须问：**在哪声明？在哪重置？**
6. **修一个失败案例时必须搜同类路径** —— P-13 修了 `error` 却漏了 `blocked`，两者都是「失败被静默当成功」。用纯函数做单点映射（如 `playResultToChainResult`），未预期值一律降级为 error。
7. **审计证据必须指向调用链，不是标识符计数** —— 项目里 `indexedDB`/`BM25`/`Worker`/`queue`/`kind`/`resume` 都有命中，但全部来自第三方库 kokoro-js、Rust 编译产物符号表、pLimit 内部变量、Service Worker。**零个是自研实现。**

### v5 批次真实落地率（2026-10-14 独立审计）

**1/15（6.7%）** —— 仅 V5-11（播放状态机）落地。其余 14 项未实现。
**23 个 V5 验收测试 ID 仅存在于 `v5待办清单.md` 自身**，测试套件中 0 存在（"看起来已有验收标准、只差实现"是假象）。
**规划漂移警示**：`pptxgenjs`/`OfflineAudioContext`/`__chattts.speak` 在三代文档中反复登记却始终未实施。

### 三文件架构（硬约束，不得破坏）

- `demo.html`（**3132 行**，全部 JS/CSS 内联 + 引擎1.5 WASM 中文音素器内联版 + E1 SSML 子集 + E2 分块增强 + E7 i18n + E3 听写/E4 可视化/E5 试听/E6 语速预设 + V5-11 播放状态机 + v4.7.1 P0 修复）— 主文件，三闭环逻辑全在此（四级降级链）。**`dist/index.html` 必须与其逐字节一致**。
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

| 套件 | 文件 | 项数 | 实测（2026-10-14）|
|------|------|------|------|
| E2E 主套件 | `e2e-test.cjs` | T1-T17 + T3b = 18 | ✅ 18/18 |
| E2E SW 跨域 | `e2e-test-sw.cjs` | T_SW_1-3 = 3 | ✅ 3/3 |
| E2E 配置中心 | `e2e-test-cfg.cjs` | T_CFG_1-5 = 5 | ✅ 5/5 |
| E2E 引擎1.5 | `e2e-test-zh.cjs` | T_ZH_1-4 = 4 | ✅ 4/4（含自检按钮诊断）|
| 单元 推理清洗 | `unit-test.cjs` | U_CLEAN 7 + 22 样本 | ✅ 7/7 |
| 单元 并发池 | `unit-test-pool.cjs` | U_POOL 4 | ✅ 4/4 |
| 单元 配置中心 | `unit-test-cfg.cjs` | U_CFG 8 | ✅ 8/8 |
| 单元 中文引擎 | `unit-test-zh.cjs` | U_ZH 9（音素器+voice 表+WAV 四分支+CJK 判定）| ✅ 9/9 |
| 单元 场景向导 | `unit-test-wizard.cjs` | WZ_1-6 | ✅ 6/6 |
| 单元 健康池 | `unit-test-health.cjs` | A2_1-5 | ✅ 5/5 |
| 单元 记忆三层 | `unit-test-memory.cjs` | B1_1-4 | ✅ 4/4 |
| E2E SSML/分块 | `e2e-test-ssml.cjs` | T_SPLIT_1 + T_SSML_1-3 = 4 | ✅ 4/4 |
| E2E 无障碍 | `e2e-test-a11y.cjs` | T_A11Y_1-4 = 4 | ✅ 4/4 |
| E2E 性能预算 | `e2e-test-perf.cjs` | T_LH_1-4 = 4 | ✅ 4/4 |
| E2E 可用性 | `e2e-test-avail.cjs` | T_AVAIL_1-4 = 4 | ✅ 4/4 |
| 单元 SSML/分块 | `unit-test-ssml.cjs` | U_SPLIT 1-4 + U_SSML 1-3 = 7 | ✅ 7/7 |
| 单元 状态机/语速 | `unit-test-v47.cjs` | U_PLAY_1-8 + U_SPEED_1-2 = 10 | ✅ 10/10 |
| E2E P0 死按钮 | `e2e-test-p0-deadbtn.cjs` | T_P0_1/2/3/3b/4 = 5 | ✅ 5/5 |
| E2E v4.7 批次 | `e2e-test-v47.cjs` | T_VER_1/T_I18N_1/T_SPEED_1/T_VIZ_1-2/T_SR_1-2/T_AUD_1 = 8 | ✅ 8/8 |
| **合计** | — | **126** | **✅ 126/126**（2026-10-14 复跑）|

> **v4.7.0 新增（2026-09-17）**：体验收口·续 + 状态机 P0 —— E3 听写（SpeechRecognition + 不支持降级）、E4 可视化（AnalyserNode 频谱 + 估算降级 + 停止清空）、E5 试听（切换即听，朗读中不打断）、E6 语速 0.25-4 + 预设 + 每语音记忆、E7 i18n（zh/en 静态界面全覆盖 + 中央状态文案精确翻译，长尾中文回退）、X-1 徽章读真源、V5-11 播放状态机（nextPlayState/playState，**P-13 修复**：playBlob 的 error 不再被静默当作播放成功）。新增 unit-test-v47.cjs（7 项）+ e2e-test-v47.cjs（8 项，外部端点用 Playwright 路由替身）。**改 i18n 文案/新增界面文案时必跑 e2e-test-v47.cjs；改播放/竞态/停止/错误处理时必跑 unit-test-v47.cjs + 主套件；改启动期 JS 时必跑 e2e-test-perf.cjs。** 已知环境项：本机第三方域不可达时 load 事件不触发（v4.6.3 原版同），perf 套件已改为不依赖 load；FCP 本机 v4.7≈1.9s（基线同日≈2.4s）仍超 1.5s 预算，预算不放水。
> **v4.6.3 新增（2026-09-15）**：E2E 确定性收口 —— `e2e-test-ssml.cjs` 原为 4 用例共享同一 page + 固定 `waitForTimeout` 断言，会被上一用例迟到完成的朗读闭环污染状态栏（本机 3 跑 2 败、CI tag 运行 T_SSML_1 失败）。**铁则：每个用例必须独立 page（或 newContext）+ 显式等 `window.__chattts` 就绪 + 轮询等目标状态，禁用“固定 sleep 后断言”**。连跑 6 次 + 全 shard-2 三 轮 81 项零失败。同型收口：`e2e-test-a11y.cjs` T_A11Y_2 在 CI 出现一次性焦点失败（第三方浮层初始化期间短暂抢焦点属合法行为）→ 已改为独立 page + 关遮挡弹窗 + 聚焦轮询 3s + 失败输出证据（activeElement/hasFocus/弹窗数/inert）。**改加载方式或新增浮层后必跑 `e2e-test-avail.cjs` + `e2e-test-a11y.cjs`。**

> **v4.6.2 新增（2026-09-15）**：第三方脚本（`uncloseai.com/uncloseai.js`）改为**运行时动态注入**（先前后台 module 会阻塞内联 module 与 `DOMContentLoaded`，第三方慢/断网时整页 JS 均不执行，连离线朗读也失效）；新增 `LOAD_TIMEOUT_MS=10000` 降级位；新增可用性门禁 `e2e-test-avail.cjs`。**改动加载方式 / 引入任何外部 `<script src>` 时必跑 `e2e-test-avail.cjs`。** CI security 作业 checkout 必须 `fetch-depth: 0`（gitleaks 增量扫描需 `<before>^`）。

> **v4.6.1 新增（2026-09-15）**：E8 axe 无障碍门禁（`e2e-test-a11y.cjs`，serious/critical 零容忍；修复 `role=tablist` 误用 + `.ep-down` 对比度 → 新增 `--danger-ink` 主题 token）；E9 性能预算（`e2e-test-perf.cjs`，FCP<1.5s / CLS<0.1 / gzip<60KB / LCP<8s 护栏，LCP 由第三方 widget 主导）。改颜色 token 或新增面板时必跑 `e2e-test-a11y.cjs`；改体积/首屏时必跑 `e2e-test-perf.cjs`。

> **v4.5.1 新增（2026-09-15）**：E1 SSML 子集（`parseSSML` 白名单 break/prosody/emphasis + 属性校验 + speak() 集成 + `pushTimeline('ssml')`）；E2 分块增强（段落边界不合并 + 英文词边界回退 + 无损）；P-1 版本真源 `VERSION`（四处一致性由 `verify-acceptance --strict` 硬校验）；`window.__chattts = { version, splitIntoChunks, parseSSML }`。改分块/SSML 时必跑 `unit-test-ssml.cjs` + `e2e-test-ssml.cjs`，且内联版与测试拷贝必须同步。

> **基线说明**：v4.1 为 44/44（17+3+5+19）；v4.2 起 57/57（新增 T_ZH 4 + U_ZH 9，unit-zh 从 0→9）。

### 文档基线（必须与代码同步）

- `README.md` — v4.7.1（四级降级链 + 引擎1.5 结构性前提披露 + CSP 披露 + **126/126** 基线 + 复跑命令 + v4.7/v4.7.1 章节）
- `变更报告.html`（v2 历史）/ `变更报告-v4.html`（v4）/ `变更报告-v5.html`（v4.2 引擎1.5 + CRITIC 两轮，含底部交互测验）
- `workflow_status.md` — N4 表 17 项真实枚举 + §8 v4/v4.1/v4.2 落地进度
- `计划书/下一步改进指南.md` — ★ 当前有效指南（v4.6.3→v8+ 第二版，下游以此为准）；`优化计划/` — 历史指南归档（v4.1/v4.2 修正指令等保留追溯）
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
node --check verify-acceptance.cjs
# demo.html 内联 JS 语法检查（三块 <script> 逐个 new Function 验证）
node -e "const fs=require('fs');const h=fs.readFileSync('demo.html','utf8');[...h.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)].forEach((x,i)=>{try{new Function(x[1])}catch(e){console.log('块'+i+':'+e.message)}})"

# 1. 单元测试（纯逻辑，无需浏览器）
node --test unit-test.cjs unit-test-pool.cjs unit-test-cfg.cjs unit-test-zh.cjs unit-test-health.cjs unit-test-memory.cjs unit-test-wizard.cjs unit-test-ssml.cjs unit-test-v47.cjs   # 60 项

# 2. 同步 dist（CI 有 diff -q 硬检查，漏做则推送即红）
cp demo.html dist/index.html && diff -q demo.html dist/index.html

# 3. 启动静态服务器（8765；package.json 的 serve 脚本可用）
npm run serve

# 4. E2E 测试（需 node_modules 已装 playwright）
npm run test:all    # 一键全量：10 个 E2E 套件 + 9 个单元套件

# 5. 台账门禁（三向一致：E2E 数 + 单元数 + 文档声称）
node verify-acceptance.cjs --strict   # 期望：STRICT 一致 + TOTAL 125 + VERSION 四处一致

# 6. 变更报告测验自检（改了报告 HTML 才需要）
node verify-report.cjs   # 10 项：全对/全错/部分/重做 四条路径
```

## 新增功能 / 新 API 的标准工作流（复用清单）

> 无论加什么功能，按此顺序走，可避免本项目历史上踩过的全部坑。

### 步骤 1：先读状态，判断是否过时
```
1. 读 .claude/SESSION-STATE.md  → 看基线、已跑过的测试、已做过的优化、环境特性
2. 读本 skill 的"项目当前状态基线"→ 看日期 vs 实际 mtime
3. 读 v5待办清单.md             → 看是否已有该节点的规划与验收 ID
```
**过时即更新**，未过时直接进入步骤 2。**这一步的目的是避免重复劳动**——不要重新跑已跑过的测试、不要重新优化已优化过的点。

### 步骤 2：用调用链定位，不用标识符计数
```bash
# ✗ 错误：只看命中数
grep -c indexedDB demo.html       # 有命中 ≠ 有实现（可能来自第三方库）

# ✓ 正确：追踪调用链
# 1) 用 codegraph_context 或语义搜索找到功能入口
# 2) 追 handler → 核心函数 → 副作用（DOM/存储/网络）
# 3) 确认触发路径完整（有 UI 入口 + 有实际逻辑 + 有用户可见反馈）
```

### 步骤 3：RED 先行
- 纯逻辑 → 在 `unit-test-*.cjs` 加断言（把逻辑抽成纯函数，如 `playResultToChainResult`）
- 交互 → 新建/扩展 `e2e-test-*.cjs`（**独立 page + 显式等 `window.__chattts` + 轮询断言**）
- 跑一次确认**失败**，再动实现。**测试第一次就通过 = 没测到东西**。

### 步骤 4：GREEN 最小实现
- 改 `demo.html`（主文件）
- 如果新增**状态变量** → 自问：**在哪声明？在哪重置？**（`playBlocked` 的教训）
- 如果新增 **UI 元素** → 必须同时绑事件并确认元素 id 真实存在（`getElementById` 返回 null 要显式报错，不要静默 return）
- 如果用**共用 CSS 类** → wiring 必须限定作用域（跨面板污染的教训）
- 如果新增**失败路径** → 搜一遍同类路径，确认所有失败都不会被静默当成功

### 步骤 5：五处同步（漏一处就出问题）
| # | 位置 | 原因 |
|---|------|------|
| 1 | `cp demo.html dist/index.html` | CI `diff -q` 硬检查 |
| 2 | `verify-acceptance.cjs` 的 `E2E_FILES` | 门禁计数 |
| 3 | `ci.yml` 的 shard 分片列表 | 否则只在本地跑、CI 假绿灯 |
| 4 | `package.json` 的 `test:all` | 一键全量覆盖 |
| 5 | `README.md` / `workflow_status.md` / 本 skill 数字 | 四件套一致 |

### 步骤 6：验证与披露
- 跑步骤"验证命令清单"全部 6 项
- 在 `workflow_status.md` 追加台账小节（节点 | 内容 | 关键标识符 | 证据等级）
- 在 `evidence/acceptance-ledger.ndjson` 留记录（门禁自动追加）
- **诚实标注证据等级**：`已验证`（真实运行）/ `静态确认`（读代码）/ `合理推断` / `待验证`（外部受限）

### 步骤 7：独立审查
- 启动独立审查代理（只读，不改代码），从**需求完整性 / 逻辑正确性 / 边界情况 / 代码质量 / 测试覆盖 / 实际运行结果**六维验证
- 拿到修复清单 → 主线程修复 → 复审，直到 PASS 或明确阻塞

## 三条最易踩的坑（本项目血泪统计）

1. **静默失败**：`if (!el) return;` 让死按钮活了一年；`playBlob('blocked')` 被当成功。**任何失败路径都必须有用户可见反馈。**
2. **跨面板污染**：共用 CSS 类 + 全局选择器。**wiring 一律限定作用域。**
3. **CI 假绿灯**：测试文件存在 ≠ CI 在跑。**新增套件必须改 ci.yml。**

## 修改范围与禁区

- **允许修改**：`demo.html`、`dist/index.html`、`sw.js`、`site.webmanifest`、`tts-zh.js`、`engines/`、`e2e-test*.cjs`、`unit-test*.cjs`、`test-cases/*.json`、`README.md`、`workflow_status.md`、`计划书/*.md`、`变更报告-*.html`、`package.json`、`.github/workflows/ci.yml`、`.gitignore`
- **禁区（不得碰）**：`上游资料/*.txt`（只读）、历史变更报告（`变更报告.html` v2 / `变更报告-v4.html`）、git 历史（禁止 `git reset --hard`/force push/amend 用户提交）
- **禁止入库**：API Key、真实用户数据、`node_modules/`、临时验证脚本、`.tmp-e2e/`
- **禁止操作**：真实付费 API 调用（预算默认 0）；`git reset --hard`/`git clean`/force push

## 已知边界（诚实披露，改引擎1.5 必读）

1. **真机出声待测**：82MB 模型 + WASM 推理在 headless 不可跑；真机路径 = ⚙️ 引擎1.5 自检（依赖可达）→ 朗读中文（出声复验）。若真机失败回落引擎2/3。
2. **质量自评 C/D**：Kokoro 官方 voice 表 `targetQuality:C / overallGrade:D`，UI 文案禁用"高质量"。
3. **`unsafe-eval`**：WASM 必需；E10 收敛需用户在两方案（拆 app.js / sha256 哈希）间决策。
4. **iOS Safari WASM 内存**：待真机压测，禁止预设数字。
5. **双实现漂移风险**：demo.html 内联音素器与 tts-zh.js 独立维护，U_ZH_4/5 断言 + U_ZH_8（WAV）守护，改一处必须同步。
6. **外部端点不稳定**：本机 `speech.ai.unturf.com` / `uncloseai.com` 时通时断 → 涉及外部端点的断言**必须用 Playwright 路由拦截**，不依赖真实网络。
7. **`demo.html:1154` 注释否决了 `onboundary`**："Chrome onboundary 不可靠故用块级定时推进"——与 V5-13 规划冲突，实施前需先推翻该判断依据。

## 停止条件

### 可停止并交付
- 所有验收标准通过且有证据；无未解决 P0/P1；必要文档已同步；剩余风险已披露

### 停止循环并报告阻塞（而非无限尝试）
- 缺不可替代的凭证/权限/环境（真机出声、联网权限）
- 引擎1.5 依赖（kokoro-js/pinyin-pro/HF 模型）均不可达 → 记录 `engine15-probe` 并回落到引擎2/3 交付
- 需用户拍板的业务分歧（如 E10 CSP 两方案、v6 架构路线）
- 同一阻塞经两次有意义的替代尝试仍无进展

## 相关文档

- `.claude/SESSION-STATE.md` — ★ **会话续接真源**（基线/已跑测试/已做优化/环境特性），**优先读**
- `v5待办清单.md` — ★ **下一轮输入**（15 个未落地节点 + 20 条根因 + 未决项 + TDD 铁则 + 验收红线）
- `计划书/下一步改进指南.md` — 全量路线图（v4.6.3→v8+，节点定义 + 执行顺序 + 风险登记册）
- `workflow_status.md` — 任务台账（§15 v4.7.0 / §16 v4.7.1 审计）+ 历史落地进度
- `变更报告-v4.7.1-终局审计.html` — 本轮变更报告 + 交互测验（底部 8 题，`verify-report.cjs` 守护）
- `优化计划/`、`归档/`、`参考的结果计划指南.md` — 历史规划归档（追溯用，部分结论已失效）

## 下次会话启动检查清单

1. **读 `.claude/SESSION-STATE.md`**（基线 + 已跑测试 + 已做优化 + 环境特性）——**这一步避免重复劳动**
2. 读本 skill 的"项目当前状态基线"（2026-10-14 v4.7.1 · 126/126）
3. `git log --oneline -6` + `git status` 看是否有新 commit / 未提交改动
4. `ls -la demo.html dist/index.html e2e-test*.cjs workflow_status.md` 看 mtime，并 `diff -q demo.html dist/index.html`
5. 判断过时 → 先更新本 skill + SESSION-STATE 基线节，再编码；未过时 → 进入步骤 6
6. 读 `v5待办清单.md` 确认下一节点与依赖顺序（V5-1 数据层是地基）
7. 按"新增功能 / 新 API 的标准工作流"七步执行
8. 收尾：五处同步 + 台账 + 独立审查