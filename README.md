# 免费的在线聊天转语音

纯前端单文件静态页，接入 [uncloseai.js](https://uncloseai.com)（公共领域），提供 **AI 对话 + 文本转语音 + 整页朗读** 三条闭环。无需后端、无需注册、无需 API Key。

**当前版本：v4.1**（2026-09-07 P0-3 配置中心 + P1-1 SW 跨域缓存 + 全栈迭代路线图）

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
| ② 任意文本转语音 | "🔊 朗读这段话"按钮 | **三级降级链**：在线 F5-TTS → 浏览器 SpeechSynthesis → 文本兜底；pLimit 3 并发 + 429 退避 | ✅ 端点宕机仍出声 + 并发合成 |
| ③ 整页朗读 | "📖 朗读整页内容"按钮 | 提取正文 → 7 规则清洗 → 走三级降级链 | ✅ 不混读 UI，端点宕机走离线 |

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
- Service Worker：`sw.js`（同源 NetworkFirst + 跨域 uncloseai.com SWR 7 天 TTL）

## 已知限制（v4.1 诚实披露）

1. **TTS 端点 2026-09-06 持续 502**：可能是临时维护或长期停摆。v4.1 降级链保证此时仍有声可用（浏览器内置），但音色机械；用户可在 ⚙️ 配置自带端点恢复在线高质量。
2. **WASM 引擎1.5（Kokoro）未落地**：断网 + Linux 无 zh 包时降级到文本兜底（无声）。v4.2 待真机测 Kokoro `zf_xiaobei` voice 后落地。
3. **浏览器 SpeechSynthesis 中文语音因平台而异**：Windows 有 Huihui/Yaoyao（质量尚可）；Linux 多数发行版无中文语音包，此时引擎2也会失败 → 走引擎3 文本兜底。
4. **iOS Safari 未真机测**：autoplay 与 SpeechSynthesis + WASM 内存限制待真机验证。
5. **库请求体无法干预**：库自带的 per-message 🔊 朗读按钮走库内部 speakText，前端无法注入 enable_thinking 参数。闭环①库内朗读可能仍带思考过程，闭环③整页朗读已前端 7 规则过滤。
6. **CSP 含 'unsafe-inline'**：因 uncloseai.js 需内联配置脚本。script-src 已白名单限制。v4.2 P3-1 计划用 hash 强化。
7. **字级高亮未落地**：v4.1 朗读时无视觉跟随，v4.2 P1-2 计划落地。

## 测试基线（v4.1 真实复跑，2026-09-07）

| 套件 | 文件 | 项数 | 真实通过 |
|------|------|------|---------|
| E2E 主套件 | `e2e-test.cjs` | T1-T17 = 17 项 | ✅ 17/17 PASS |
| E2E SW 跨域 | `e2e-test-sw.cjs` | T_SW_1-3 = 3 项 | ✅ 3/3 PASS |
| E2E 配置中心 | `e2e-test-cfg.cjs` | T_CFG_1-5 = 5 项 | ✅ 5/5 PASS |
| 单元 推理清洗 | `unit-test.cjs` | U_CLEAN 7 项 + 22 样本 | ✅ 7/7 PASS |
| 单元 并发池 | `unit-test-pool.cjs` | U_POOL 4 项 | ✅ 4/4 PASS |
| 单元 配置中心 | `unit-test-cfg.cjs` | U_CFG 8 项 | ✅ 8/8 PASS |
| **总计** | — | **44 项** | **✅ 44/44 PASS** |

复跑命令：

```bash
npm install --registry https://registry.npmmirror.com
npx playwright install chromium
npm run serve &            # 后台启动静态服务器
node e2e-test.cjs          # 17 项
node e2e-test-sw.cjs       # 3 项
node e2e-test-cfg.cjs      # 5 项
node --test unit-test.cjs unit-test-pool.cjs unit-test-cfg.cjs  # 19 项
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
- [workflow_status.md](workflow_status.md) — 任务台账 + v4 落地进度（§8）
- [变更报告-v4.html](变更报告-v4.html) — v4 变更报告 + 测验
- [chat-tts-evolve.skill.md](chat-tts-evolve.skill.md) — 项目演进工作流 skill（下次会话优先读取）
- `上游资料/` — uncloseai.js、TTS、反向 RAG 等原始文档

## 文件结构

```
免费的在线聊天转语音/
├── demo.html             # ★ 主文件（v4.1，1470 行，gzip 23111 字节）
├── site.webmanifest      # PWA 清单（display:standalone）
├── sw.js                 # Service Worker（143 行，同源 NetworkFirst + 跨域 SWR）
├── README.md             # 本文件
├── workflow_status.md    # 任务台账 + v4 落地进度
├── 变更报告.html          # v2 变更报告
├── 变更报告-v4.html      # v4 变更报告 + 测验
├── chat-tts-evolve.skill.md  # 项目演进工作流 skill
├── e2e-test.cjs          # E2E 主套件（Playwright，17 项 T1-T17）
├── e2e-test-sw.cjs       # E2E SW 跨域缓存（3 项 T_SW_1-3）
├── e2e-test-cfg.cjs      # E2E 配置中心（5 项 T_CFG_1-5）
├── unit-test.cjs         # 单元 推理清洗（node:test，U_CLEAN 7 项 + 22 样本夹具）
├── unit-test-pool.cjs    # 单元 并发池（U_POOL 4 项 + 429 退避）
├── unit-test-cfg.cjs     # 单元 配置中心（U_CFG 8 项 schema/URL/往返校验）
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

*v4.1 基于 2026-09-07 真实复跑：E2E 主套件 17/17 + SW 3/3 + 配置 5/5 = 25/25 PASS；单元 U_CLEAN 7 + U_POOL 4 + U_CFG 8 = 19/19 PASS；全量回归 **44/44 PASS**。demo.html gzip 23111 字节。git `b2f89f6`。**v4.2 待办**：P0-1 Kokoro WASM 引擎1.5 真机测（zf_xiaobei 出声）+ P1-2 字级高亮 + P3-1 CSP hash + P3-2 Lighthouse + P4-1 axe-core。*
