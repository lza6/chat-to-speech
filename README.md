# 免费的在线聊天转语音

纯前端单文件静态页，接入 [uncloseai.js](https://uncloseai.com)（公共领域），提供 **AI 对话 + 文本转语音 + 整页朗读** 三条闭环。无需后端、无需注册、无需 API Key。

**当前版本：v4.5**（2026-09-09 引擎1.5 本地中文 WASM + 多端点健康自愈 + 透明操作时间线 + 本地记忆三层/技能结晶 + 场景向导 B3/B4/B5 + 体验增强 P2-4 + 完整 CI/CD + 全量回归 78 PASS）

## 桌面版（免安装 / 安装包，双击即用）

发布在项目 `发布/` 目录（或已复制到桌面）：

| 文件 | 用法 |
|------|------|
| `ChatTTS-v4.5.1-免安装版.exe` | 双击直接运行，免安装免注册（Windows 10/11，依赖系统已装的 WebView2 运行时） |
| `ChatTTS_4.5.1_x64-setup.exe` | NSIS 安装向导，安装后可卸载 |
| `ChatTTS_4.5.1_x64_en-US.msi` | MSI 企业级安装包 |

> 桌面版与网页版同源（同一 `dist/index.html`），离线也可用：引擎1.5 本地中文 WASM + 浏览器语音兜底。WebView2 在 Windows 10/11 通常已预装；若提示缺失可到微软官网安装 WebView2 Runtime。

## 快速开始

### 本地预览（推荐）

```powershell
# 安装测试依赖（仅 E2E/单元测试需要，部署无需）
npm install --registry https://registry.npmmirror.com
npx playwright install chromium

# 在项目目录下起一个静态服务器
npm run serve          # 监听 8765
# 或：python -m http.server 8765
# 浏览器打开 http://localhost:8765/demo.html
```

> 不要用 `file://` 直接打开——浏览器会阻止远程脚本和 fetch（CORS/模块限制）。

### 直接部署

`demo.html` + `site.webmanifest` + `sw.js` 三个文件放到任意静态托管（GitHub Pages、Vercel、Netlify、Nginx、CDN）即可。无构建步骤。

## 三条闭环

| 闭环 | 入口 | 实现 | v4.1 状态 |
|------|------|------|---------|
| ① AI 对话 | 页面中部聊天框 | uncloseai.js widget。回复可点 🔊 朗读 | 模型名自动注入（30分钟缓存）+ 推理过程 7 规则结构化清洗 |
| ② 任意文本转语音 | "🔊 朗读这段话"按钮 | **四级降级链**：在线 F5-TTS → 引擎1.5 本地中文 WASM(Kokoro) → 浏览器 SpeechSynthesis → 文本兜底；pLimit 3 并发 + 429 退避 | ✅ 端点宕机仍出声 + 并发合成 |
| ③ 整页朗读 | "📖 朗读整页内容"按钮 | 提取正文 → 7 规则清洗 → 走四级降级链 | ✅ 不混读 UI，端点宕机走离线 |

## v4.5 核心升级（相对 v4.4）

- **P2-4 体验增强（主题/语速持久化 + 实时联动）**：主题与语速并入配置中心持久化（`tts_cfg_v1`，迁移旧 `tts_theme_v2`）；`auto` 主题实时跟随系统深浅色（`matchMedia`）；**朗读中拖语速滑块立即生效**（浏览器引擎实时改 rate）；刷新后主题/语速自动恢复。
- **B3 任务看板状态机**：🧭 场景向导新增「🗂️ 任务看板」页签——五态看板（Backlog/Planning/Running/Review/Done）+ 取消列；新增任务 → 点击推进一格（`wzCanTransit` 合法流转门）；右键取消；数据落 localStorage（`tts_wizard_v1`，刷新保留）。
- **B4 PPT 大纲向导**：「📑 PPT 大纲」页签——空行分页输入 → `wzParsePptSpec` 解析（标题+要点，页数/要点数钳位）→ `wzDetectOverflow` 几何审计（中文宽度估算 + autofit 缩字 + 溢出标记）→ 分页预览 + 导出 `.md` 大纲文本。
- **B5 电商文案向导**：「🛒 电商文案」页签——商品卡（名/价格/人群/卖点）→ schema 校验 → 三段草稿（标题版/正文版/快发版）+ 禁用词替换（最低价/全网最低/第一/绝对/100% → ★）+ 一键复制全部。
- **A3 台账门槛升级**：`verify-acceptance.cjs` 纳入新增测试文件（E2E 35 + 单元 43 = **78 PASS**），门槛同步提高（E2E≥35 且 单元≥39）。
- **全部纯前端**：无后端、无构建、无账号；数据全在 localStorage，可整体清空。

## v4.4 核心升级（相对 v4.2/4.3）

- **A1 透明操作时间线（黑匣子日志全开）**：🧾 按钮 + 事件信封 `{id,ts,kind,msg,ok,ctx}` + 环形 200 条 localStorage + 全链路埋点（system/probe/engine1/1.5/2/3 尝试与结果）+ 导出 JSON + 密钥脱敏（sk-xxx/Bearer 掩码）。
- **A2 多端点健康自愈池**：⚙️ 设置面板「备用 TTS 端点（逗号分隔）」+ 冷却 TTL 自动复活（指数退避封顶 5min）+ 健康池路由（坏端点自动跳过，全冷选最短恢复）+ 探针路径修复（不再拼 `/v1/audio/speech/v1/voices`）+ 引擎1.5 `from_pretrained` dtype 兼容链（q8f16→q8）。
- **B1 本地记忆三层 + 画像卡**：🧠 记忆按钮 + 面板（👤 画像 / 🗂️ 记忆 / ✨ 结晶技能 三 tab）+ 朗读后写 episodic 记忆 + 画像克制更新（相似事实强化计数不覆盖、超 2000 字拒绝）+ 导出/清空记忆 JSON。
- **B2 技能结晶 UI**：重复操作按四维门控（≥5 次 ∧ ≥80% 成功 ∧ ≥2 种问法 ∧ 30 天内）聚合建议 → 💡 建议结晶 → 一键 ✅ 结晶 → 移入已结晶列表 + 记 skill 记忆（不重复建议）。
- **A3 验收卡台账门禁**：`verify-acceptance.cjs` 统计 E2E 断言(35) + 单元断言(43) = **78 PASS**，落盘 `evidence/acceptance-ledger.ndjson` + `evidence/manifest.json`；缺文件即 FAIL；`--strict` 对比文档声称打 WARN。
- **B3/B4/B5 场景向导**：见上节——任务看板状态机 + PPT 大纲几何审计 + 电商文案三段草稿，全部纯前端、localStorage 持久化、时间线埋点。
- **CI/CD 完整 Pipeline**：`.github/workflows/ci.yml` 5 阶段（Build+dist 同步 / Quality 语法+台账 / Test 单元+E2E 分片 / Security audit+gitleaks / Deploy GitHub Pages+Release），main 自动部署生产 + 自动 Release，PR 评论预览。

## v4.2 核心升级（相对 v4.1）

- **P0-1-B 引擎1.5 本地中文 WASM**：在引擎1（在线）与引擎2（浏览器）之间插入 Kokoro 82M ONNX + 中文音素器（移植 kokoro PR #352 `phonemize-zh.js` + `pinyin-pro`）。断网 + 系统无中文包时可本地合成。`⚙️ 引擎1.5 自检`按钮可探依赖可用性并透出失败原因。真机出声待测（质量官方自评 C/D）。
- **依赖可达性预检 + 失败透出**：`canUseZhWasm()` 前置探测（WASM + kokoro-js + pinyin-pro），失败跳过引擎1.5 并在状态栏明示原因，不再静默降级。
- **CSP 强化对齐**：script-src 增加 `cdn.jsdelivr.net` / `huggingface.co` 与 `'unsafe-eval'`（WASM 必需）；connect-src 增加 `huggingface.co` / `cdn.jsdelivr.net`。依赖全部走 CSP 白名单域名。
- **本地 vendor 兜底**：`engines/` 收录 `pinyin-pro.mjs` + `kokoro-js.mjs` 静态副本，CDN 不可达时同源兜底。
- **触发判定修复**：引擎1.5 仅对含 CJK 汉字文本触发（`\p{Script=Han}`），修复前"首字符非 ASCII"对前导空格/全角/emoji 的误判。
- **分块合成**：引擎1.5 按 `splitIntoChunks` 逐块合成拼接，规避 5000 字无标点文本超上下文窗口截断。
- **WAV 转换健壮化**：显式 Float32/Int16/Array 分支，Int16 先 /32768 转 float，禁止按字节/4 错读任意 TypedArray。

## v4.1 核心升级（相对 v3）

- **P0-3 配置中心**：⚙️ 设置面板，用户自带 TTS 端点 + 模型 + 语音列表 + 引擎开关；API Key 走 UncloseVault AES-256（不裸 localStorage，导出不含）；导入 schema 校验 + URL 校验 + 版本化迁移。
- **P1-1 SW 跨域 CDN 缓存**：`sw.js` 升级双缓存（同源 NetworkFirst + 跨域 uncloseai.com SWR 7 天 TTL + maxEntries=50 + ETag 304 协商）。断网刷新不白屏，聊天 UI 离线可渲染。
- **P0-2 推理清洗 7 规则管线**：`CLEAN_RULES` 数组从 3 前缀升级为 7 规则（XML 标签 / markdown fence / markdown heading / 多前缀块 / 行内前缀 / 尾部剥离×2），22 样本夹具回归保护。
- **P1-3 并发合成池**：手写 pLimit（`Object.defineProperties` 修复 getter bug），3 并发预取 + 播放时预取 i+3 + 429 退避降并发到 2 + 恢复回 3。
- **屎山清理**：`.playwright-mcp/` 75 项残留删除。

## v3 保留功能（不回归）

- 42 语音动态加载（端点 up 时）/ localStorage 24h 缓存保留（端点 down 时）
- 端点健康探测 + 徽章三态（up/down/unknown）
- 语速滑块 0.5x–2x
- 进度条分块进度
- 下载完整音频 mp3（文件名带语音+语速+时间戳）
- 朗读历史 20 条（按 text+voice 去重，重听 ▶ + 实时搜索 + 导出 JSON）
- 主题三态 auto/dark/light（Ctrl+, 切换）
- 键盘快捷键 Ctrl+Enter 朗读 / Esc 停止 / Ctrl+D 下载 / Ctrl+H 历史 / Ctrl+, 主题
- 示例 chips 一键填充
- 字符计数实时更新
- PWA manifest 可安装（display:standalone）
- 错误日志 localStorage 环形缓冲（50 条）
- fetch 指数退避重试 + 60s 超时
- CSP 收敛（移除已下线 qwen 端点）

## 配置

### 页面级配置（demo.html 头部 `<script>`）

在 `<script src="uncloseai.js">` 之前设置 `window` 变量：

```html
<script>
  window.UNCLOSEAI_LANGUAGE = "zh";                    // 中文界面
  window.UNCLOSEAI_SYSTEM_PROMPT = "你是中文助手，直接给出最终答案…";  // 推理模型抑制思考
  window.UNCLOSEAI_CUSTOM_STYLING = true;              // 保留内置样式
  window.UNCLOSEAI_FLOATING_BUTTON = true;             // 右下角浮动按钮
</script>
```

### 用户级配置（⚙️ 设置面板，v4.1 新增）

页面内点"⚙️ 设置"按钮，可配置：
- TTS 合成端点 URL（兼容 OpenAI `/v1/audio/speech` 格式）
- TTS 模型名（默认 tts-1-f5）
- 语音列表端点 URL（默认 `/v1/voices`）
- API Key（可选，优先 UncloseVault AES-256 加密，不入仓库不导出）
- 启用/禁用各引擎（引擎1 在线 / 引擎2 浏览器 / 引擎3 文本兜底）
- 导入/导出 JSON 配置（schema 校验，不含 API Key）
- 恢复默认

## 排障

| 现象 | 原因 | 处理 |
|------|------|------|
| 在线语音朗读失败 | speech.ai.unturf.com 端点宕机（502） | v4.1 自动切换浏览器内置离线语音，状态栏明示；或用 ⚙️ 配置自带端点 |
| 语音下拉只有 3 项 | 端点宕机且无缓存 | 24h 内访问过的语音会从缓存填充；首次即宕则只剩 3 兜底 |
| 徽章显示"离线" | 端点探测返回 502 | 正常降级，朗读仍可用（浏览器内置音色）；可在 ⚙️ 填自建端点恢复在线高质量 |
| 聊天回复含思考过程 | 当前模型为推理型 | 库无法干预请求体加 enable_thinking，前端 7 规则 cleanAssistantText 兜底过滤 |
| 浏览器拦截自动播放 | autoplay policy | 按页面提示点重试按钮（手势内可直接 play） |
| 整页朗读读 UI 文案 | 旧版 main.innerText 抓所有文本 | extractReadableText 精确选择器 + 7 规则清洗 |
| 下载只有最后一段 | v1 缺陷 | v2 已修复 audioBlobs 拼接；v3+ 离线模式明确提示不可下载 |
| 控制台 CSP 报错 | 旧版 CSP 缺 uncloseai.com 字体 | v2 已放行；v3 移除死配置 qwen 端点 |
| favicon 404 | 浏览器自动请求 | 已用内联 SVG favicon 覆盖 |
| 离线刷新聊天白屏 | v3 SW 不缓存跨域 uncloseai.js | v4.1 P1-1 SW 跨域 SWR 缓存已修复（断网刷新聊天 UI 不白屏） |

## 技术栈

- 单文件 HTML + 原生 JS（无框架、无构建）
- uncloseai.js（远程 ES 模块，公共领域，SW 跨域 SWR 缓存）
- TTS 端点：`speech.ai.unturf.com/v1`（OpenAI 兼容，F5-TTS，42 语音，支持 speed）— 用户可在 ⚙️ 配置自带端点
- 聊天端点：`hermes.ai.unturf.com/v1`（Qwen3.6-27B，已验证 localhost CORS 放行）
- 离线引擎：浏览器原生 Web Speech API SpeechSynthesis（零依赖，端点宕机时降级）
- **引擎1.5 本地中文 WASM（v4.2 新增）**：Kokoro 82M ONNX（`onnx-community/Kokoro-82M-v1.0-ONNX` q8f16 82MB）+ 中文音素器（移植 kokoro PR #352 `phonemize-zh.js` + `pinyin-pro`），引擎 1→1.5→2→3 降级链；依赖经 `cdn.jsdelivr.net`（CSP 白名单）加载，本地 `engines/` vendor 兜底；**真机出声待测**
- Service Worker：`sw.js`（同源 NetworkFirst + 跨域 uncloseai.com SWR 7 天 TTL）

## 已知限制（v4.5 诚实披露）

1. **TTS 端点 2026-09-06 持续 502**：可能是临时维护或长期停摆。降级链保证此时仍有声可用（浏览器内置），但音色机械；用户可在 ⚙️ 配置自带端点恢复在线高质量（支持多端点 failover）。
2. **引擎1.5 本地中文（Kokoro）代码已入，真机出声待测（含结构性前提）**：断网 + Linux 无 zh 包时可走引擎1.5（本地 82MB 模型，音素器已实现，`⚙️ 引擎1.5 自检`可探依赖可用性）；中文合成走 `generate_from_ids` 适配层（绕过 kokoro-js@1.2.1 英文 voice 白名单，`zf_xiaobei.bin` 已核验存在于 HF）。**真机（含 iOS Safari WASM 内存）尚未验证**；若真机不可用则回落到引擎2/3。语音质量官方自评 C/D（非「高质量」）。
3. **浏览器 SpeechSynthesis 中文语音因平台而异**：Windows 有 Huihui/Yaoyao（质量尚可）；Linux 多数发行版无中文语音包，此时引擎2也会失败 → 走引擎3 文本兜底。
4. **iOS Safari 未真机测**：autoplay 与 SpeechSynthesis + WASM 内存限制待真机验证。
5. **库请求体无法干预**：库自带的 per-message 🔊 朗读按钮走库内部 speakText，前端无法注入 enable_thinking 参数。闭环①库内朗读可能仍带思考过程，闭环③整页朗读已前端 7 规则过滤。
6. **CSP 含 'unsafe-inline' 与 'unsafe-eval'**：`unsafe-inline` 因 uncloseai.js 需内联配置脚本；`unsafe-eval` 为 WASM 引擎1.5 必需。script-src 已白名单限制（仅 uncloseai.com / cdn.jsdelivr.net / cdnjs.cloudflare.com / huggingface.co）。v4.3 P3-1 计划用 hash + 移除 eval（引擎1.5 用编译过的 wasm 时）。
7. **记忆/画像/技能全部仅存本机 localStorage**：无账号、无跨设备同步（后续可接后端做持久化）。
8. **CI action Node 20 弃用警告**：GH 自动跑 Node 24，不影响功能；建议后续升级 `actions/*@v5`。
9. **场景向导 B3/B4/B5 为纯前端轻量实现**：任务看板/PPT 大纲/电商文案数据全部存 localStorage（无跨设备）；PPT 导出为 Markdown 大纲文本（非二进制 .pptx）；电商草稿不含真实发布动作（草稿→预览→确认门后续扩展）。
10. **P2-4 语速实时调节仅浏览器引擎即时生效**：在线引擎/WASM 引擎语速在合成时确定，朗读中拖动滑块对它们需下一段生效；浏览器引擎（引擎2）即时改 rate。

## 测试基线（v4.5 真实复跑，2026-09-09）

| 套件 | 文件 | 项数 | 真实通过 |
|------|------|------|---------|
| E2E 主套件 | `e2e-test.cjs` | T1-T17 = 17 项 | ✅ 17/17 PASS |
| E2E SW 跨域 | `e2e-test-sw.cjs` | T_SW_1-3 = 3 项 | ✅ 3/3 PASS |
| E2E 配置中心 | `e2e-test-cfg.cjs` | T_CFG_1-5 = 5 项 | ✅ 5/5 PASS |
| E2E 引擎1.5 | `e2e-test-zh.cjs` | T_ZH_1-4 = 4 项 | ✅ 4/4 PASS |
| E2E 场景向导 | `e2e-test-wizard.cjs` | T_WZ_1-6 = 6 项 | ✅ 6/6 PASS |
| 单元 推理清洗 | `unit-test.cjs` | U_CLEAN 7 项 + 22 样本 | ✅ 7/7 PASS |
| 单元 并发池 | `unit-test-pool.cjs` | U_POOL 4 项 | ✅ 4/4 PASS |
| 单元 配置中心 | `unit-test-cfg.cjs` | U_CFG 8 项 | ✅ 8/8 PASS |
| 单元 中文引擎 | `unit-test-zh.cjs` | U_ZH 9 项 | ✅ 9/9 PASS |
| 单元 健康池 | `unit-test-health.cjs` | A2_1-5 项 | ✅ 5/5 PASS |
| 单元 记忆三层 | `unit-test-memory.cjs` | B1_1-4 项 | ✅ 4/4 PASS |
| 单元 场景向导 | `unit-test-wizard.cjs` | WZ_1-6 项 | ✅ 6/6 PASS |
| **总计** | — | **78 项** | **✅ 78/78 PASS** |

复跑命令：

```bash
npm install --registry https://registry.npmmirror.com
npx playwright install chromium
npm run serve &            # 后台启动静态服务器
node e2e-test.cjs          # 17 项
node e2e-test-sw.cjs       # 3 项
node e2e-test-cfg.cjs      # 5 项
node e2e-test-zh.cjs       # 4 项
node e2e-test-wizard.cjs   # 6 项
node --test unit-test.cjs unit-test-pool.cjs unit-test-cfg.cjs unit-test-zh.cjs unit-test-health.cjs unit-test-memory.cjs unit-test-wizard.cjs  # 43 项
node verify-acceptance.cjs # 台账门禁：E2E≥35 且 单元≥39
```

## v4.1 关键修复（P0/P1）

| # | 级别 | v3 问题 | v4.1 修复 | 验收 |
|---|------|---------|---------|------|
| 1 | P0 | 端点宕机用户无法自救 | P0-3 配置中心（自带端点 + UncloseVault API Key + 引擎开关）| U_CFG 8/8 + T_CFG 5/5 |
| 2 | P0 | 推理清洗仅 3 前缀，新格式漏洗 | 7 规则结构化管线（CLEAN_RULES 数组 + 22 样本夹具）| U_CLEAN 7/7 |
| 3 | P1 | 离线刷新聊天白屏（SW 不缓存跨域）| P1-1 SW 跨域 SWR 缓存（uncloseai.com 7 天 TTL + ETag 304）| T_SW 3/3 |
| 4 | P1 | 长文本串行合成慢 | P1-3 pLimit 3 并发池 + 429 退避降并发 | U_POOL 4/4 |
| 5 | P1 | pLimit getter bug（Object.assign 读一次为静态值）| Object.defineProperties 修复 | U_POOL_3 回归保护 |

## 相关文档

- [下一步改进指南](优化计划/下一步改进指南.md) — v4.1→v4.2→v5→v6+ 全栈迭代路线图（重写版，下游以此为准）
- [下一步改进指南-v4.1基线归档](优化计划/下一步改进指南-v4.1基线归档.md) — v4.1 时代规划（历史参考）
- [下一步改进指南-v3基线归档](优化计划/下一步改进指南-v3基线归档.md) — v3 时代对 v4 的初步规划（历史参考，部分描述已过时）
- [workflow_status.md](workflow_status.md) — 任务台账 + v4/v4.3/v4.4 落地进度
- [变更报告-v5.html](变更报告-v5.html) — v4.2 引擎1.5 变更报告 + 测验
- [CI/CD 指南](CI-CD-指南.md) — GitHub Actions Pipeline 架构 / Stage 明细 / 故障排查 / 回滚
- [参考的结果计划指南.md](参考的结果计划指南.md) — 全库深度对标 + Phase B 批次台账
- [chat-tts-evolve.skill.md](chat-tts-evolve.skill.md) — 项目演进工作流 skill（下次会话优先读取）
- `上游资料/` — uncloseai.js、TTS、反向 RAG 等原始文档

## 文件结构

```
免费的在线聊天转语音/
├── demo.html             # ★ 主文件（v4.5，引擎1.5 + 多端点健康池 + 时间线 + 记忆 UI + 场景向导）
├── site.webmanifest      # PWA 清单（display:standalone）
├── sw.js                 # Service Worker（143 行，同源 NetworkFirst + 跨域 SWR）
├── dist/index.html       # 桌面壳 frontendDist（与 demo.html 强制同步，CI diff 校验）
├── README.md             # 本文件
├── workflow_status.md    # 任务台账 + v4/v4.3/v4.4/v4.5 落地进度
├── 变更报告.html          # v2 变更报告
├── 变更报告-v4.html      # v4 变更报告 + 测验
├── 变更报告-v5.html      # v4.2 引擎1.5 变更报告 + 测验
├── chat-tts-evolve.skill.md  # 项目演进工作流 skill
├── CI-CD-指南.md         # CI/CD Pipeline 指南
├── .github/workflows/ci.yml  # GitHub Actions 5 阶段 Pipeline
├── .gitleaks.toml        # gitleaks vendor 豁免
├── e2e-test.cjs          # E2E 主套件（Playwright，17 项 T1-T17）
├── e2e-test-sw.cjs       # E2E SW 跨域缓存（3 项 T_SW_1-3）
├── e2e-test-cfg.cjs      # E2E 配置中心（5 项 T_CFG_1-5）
├── e2e-test-zh.cjs       # E2E 引擎1.5（4 项 T_ZH_1-4）
├── e2e-test-wizard.cjs   # E2E 场景向导（6 项 T_WZ_1-6）
├── unit-test.cjs         # 单元 推理清洗（node:test，U_CLEAN 7 项 + 22 样本夹具）
├── unit-test-pool.cjs    # 单元 并发池（U_POOL 4 项 + 429 退避）
├── unit-test-cfg.cjs     # 单元 配置中心（U_CFG 8 项 schema/URL/往返校验）
├── unit-test-zh.cjs      # 单元 中文引擎（U_ZH 9 项）
├── unit-test-health.cjs  # 单元 健康池（A2_1-5 项）
├── unit-test-memory.cjs  # 单元 记忆三层（B1_1-4 项）
├── unit-test-wizard.cjs  # 单元 场景向导（WZ_1-6 项：看板/PPT/电商）
├── verify-acceptance.cjs # 验收台账门禁（三向一致性，CI 强制）
├── evidence/             # 验收台账（acceptance-ledger.ndjson + manifest.json）
├── package.json          # 声明 playwright ^1.49.0 + serve 脚本（无构建工具链，保持单文件部署）
├── .gitignore            # node_modules / verify-*.cjs / server.cjs / .playwright-mcp/
├── test-cases/            # 测试夹具
│   └── 推理清洗样本.json   # 22 真实推理回复样本（U_CLEAN_4 回归保护）
├── 优化计划/              # 改进指南 + 基线归档
│   ├── 下一步改进指南.md                      # ★ v4.1→v4.2→v5→v6+ 全栈迭代路线图（重写版，下游以此为准）
│   ├── 下一步改进指南-v4.1基线归档.md         # v4.1 时代规划（历史参考）
│   └── 下一步改进指南-v3基线归档.md            # v3 时代对 v4 的初步规划（历史参考，部分过时）
└── 上游资料/              # 11 份原始文档
```

---

*v4.5 基于 2026-09-09 真实复跑：E2E 核心 17/17 + SW 3/3 + 配置 5/5 + 引擎1.5 4/4 + 场景向导 6/6 = 35/35 PASS；单元 U_CLEAN 7 + U_POOL 4 + U_CFG 8 + U_ZH 9 + A2 5 + B1 4 + WZ 6 = 43/43 PASS；全量回归 **78/78 PASS**（README 测试基线表）。CI（GitHub Actions）已真实全绿含 Pages 部署与 Release。**剩余待办**：引擎1.5 真机出声测（cfg 引擎1.5 自检→朗读中文）、C1 图片/视频场景扩展、action 升级 @v5。*
