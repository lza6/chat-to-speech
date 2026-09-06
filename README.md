# 免费的在线聊天转语音

纯前端单文件静态页，接入 [uncloseai.js](https://uncloseai.com)（公共领域），提供 **AI 对话 + 文本转语音 + 整页朗读** 三条闭环。无需后端、无需注册、无需 API Key。

**当前版本：v3**（2026-09-06 多引擎自愈升级交付）

## 快速开始

### 本地预览（推荐）

```powershell
# 在项目目录下起一个静态服务器
python -m http.server 8765
# 或：node -e "require('http').createServer(...).listen(8765)"
# 浏览器打开 http://localhost:8765/demo.html
```

> 不要用 `file://` 直接打开——浏览器会阻止远程脚本和 fetch（CORS/模块限制）。

### 直接部署

`demo.html` + `site.webmanifest` 两个文件放到任意静态托管（GitHub Pages、Vercel、Netlify、Nginx、CDN）即可。无构建步骤。

## 三条闭环

| 闭环 | 入口 | 实现 | v3 状态 |
|------|------|------|---------|
| ① AI 对话 | 页面中部聊天框 | uncloseai.js widget。回复可点 🔊 朗读 | 模型名自动注入（30分钟缓存）+ 推理过程前端过滤 |
| ② 任意文本转语音 | "🔊 朗读这段话"按钮 | **三级降级链**：在线 F5-TTS → 浏览器 SpeechSynthesis → 文本兜底 | ✅ 端点宕机仍出声 |
| ③ 整页朗读 | "📖 朗读整页内容"按钮 | 提取正文 → 走三级降级链 | ✅ 不混读 UI，端点宕机走离线 |

## v3 核心升级（相对 v2）

- **P0-1 三级降级链**：在线端点宕机（实测 2026-09-06 持续 502）自动切换浏览器内置语音，无中文语音再切文本兜底。**工具永远不哑火**。
- **P0-2 端点健康探测 + 语音缓存**：下拉旁徽章实时显示在线/离线状态；42 语音列表 localStorage 缓存 24h，端点宕时仍可填充。
- **P0-3 推理模型回复清洗**：当前 Hermes 模型（Qwen3.6 推理型）回复带 "thinking process" 前缀，`cleanAssistantText` 兜底过滤，整页朗读不读思考过程。
- **P0-4 清理调试屎山**：删除 `.playwright-mcp/` 75 个残留快照。
- **P1-2 CSP 收敛**：移除已关闭的 `qwen.ai.unturf.com` 死配置。
- **P1-3 按句分块**：按中文/英文句末标点切分，TTS 断句处自然停顿，不再硬切"你好。"成两块。
- **P1-4 竞态加固**：`stopPlayback` 同时取消浏览器内置语音；离线朗读加 `isStopped` 轮询守护（headless cancel 不触发 onend 的兜底）。
- **P1-5 下载强化**：离线引擎模式下明确提示"无法下载"，文件名含语速信息。
- **P2-2 快捷键扩展**：Ctrl+D 下载、Ctrl+H 历史、Ctrl+, 主题；Esc 取消离线朗读；按钮加 `aria-keyshortcuts`。

## v2 保留功能（不回归）

- 42 语音动态加载（端点 up 时）/ 缓存保留（端点 down 时）
- 语速滑块 0.5x–2x
- 进度条分块进度
- 下载完整音频 mp3（文件名带语音+语速+时间戳）
- 朗读历史 20 条（按 text+voice 去重，可一键回填）
- 主题三态 auto/dark/light
- 键盘快捷键（Ctrl+Enter 朗读 / Esc 停止 / 空格 暂停）
- 示例 chips 一键填充
- 字符计数实时更新
- PWA manifest 可安装
- 错误日志 localStorage 环形缓冲（50 条）
- fetch 指数退避重试 + 60s 超时

## 配置

在 `<script src="uncloseai.js">` 之前设置 `window` 变量（见 `demo.html` 头部）：

```html
<script>
  window.UNCLOSEAI_LANGUAGE = "zh";                    // 中文界面
  window.UNCLOSEAI_SYSTEM_PROMPT = "你是中文助手，直接给出最终答案…";  // 推理模型抑制思考
  window.UNCLOSEAI_CUSTOM_STYLING = true;              // 保留内置样式
  window.UNCLOSEAI_FLOATING_BUTTON = true;             // 右下角浮动按钮
</script>
```

## 排障

| 现象 | 原因 | 处理 |
|------|------|------|
| 在线语音朗读失败 | speech.ai.unturf.com 端点宕机（502） | v3 自动切换浏览器内置离线语音，状态栏明示 |
| 语音下拉只有 3 项 | 端点宕机且无缓存 | 24h 内访问过的语音会从缓存填充；首次即宕则只剩 3 兜底 |
| 徽章显示"离线" | 端点探测返回 502 | 正常降级，朗读仍可用（浏览器内置音色） |
| 聊天回复含思考过程 | 当前模型为推理型 | 库无法干预请求体加 enable_thinking，前端 cleanAssistantText 兜底过滤 |
| 浏览器拦截自动播放 | autoplay policy | 按页面提示点重试按钮（手势内可直接 play） |
| 整页朗读读 UI 文案 | 旧版 main.innerText 抓所有文本 | v3 extractReadableText 精确选择器 + cleanAssistantText |
| 下载只有最后一段 | v1 缺陷 | v2 已修复 audioBlobs 拼接；v3 离线模式明确提示不可下载 |
| 控制台 CSP 报错 | 旧版 CSP 缺 uncloseai.com 字体 | v2 已放行；v3 移除死配置 qwen 端点 |
| favicon 404 | 浏览器自动请求 | 已用内联 SVG favicon 覆盖 |

## 技术栈

- 单文件 HTML + 原生 JS（无框架、无构建）
- uncloseai.js（远程 ES 模块，公共领域）
- TTS 端点：`speech.ai.unturf.com/v1`（OpenAI 兼容，F5-TTS，42 语音，支持 speed）
- 聊天端点：`hermes.ai.unturf.com/v1`（Qwen3.6-27B，**已验证 localhost CORS 放行**）
- 离线引擎：浏览器原生 Web Speech API SpeechSynthesis（零依赖，端点宕机时降级）

## 已知限制（v3 诚实披露）

1. **TTS 端点 2026-09-06 持续 502**：可能是临时维护或长期停摆。v3 降级链保证此时仍有声可用（浏览器内置），但音色机械。
2. **浏览器 SpeechSynthesis 中文语音因平台而异**：Windows 有 Huihui/Yaoyao（质量尚可）；Linux 多数发行版无中文语音包，此时引擎2也会失败 → 走引擎3 文本兜底。
3. **iOS Safari 自动播放**：Web Audio + data: URI 双保险，极端情况仍需用户二次点击。未在真机 iOS 实测。
4. **库请求体无法干预**：库自带的 per-message 🔊 朗读按钮走库内部 speakText，前端无法注入 enable_thinking 参数。闭环①库内朗读可能仍带思考过程，闭环③整页朗读已前端过滤。
5. **CSP 含 'unsafe-inline'**：因 uncloseai.js 需内联配置脚本。script-src 已白名单限制。
6. **Service Worker 已集成**：v3 P3-1 启用 `sw.js`（网络优先回退缓存，commit `f8d71b8`，T17 测注册通过）。跨域 CDN 资源当前不缓存（留作 v4 P1-1 升级）。

## v3 关键修复（P0/P1）

| # | 级别 | v2 问题 | v3 修复 | 验收 |
|---|------|---------|---------|------|
| 1 | P0 | 端点宕机整链路死 | 三级降级链 synthChain | E2E T4/T10 实跑降级 |
| 2 | P0 | 语音列表无缓存 | localStorage 24h + 徽章 | E2E T3 徽章状态 |
| 3 | P0 | 推理模型思考过程被朗读 | cleanAssistantText 兜底过滤 | E2E T13 单测 |
| 4 | P0 | .playwright-mcp 75 文件屎山 | 删除 | 文件系统确认 |
| 5 | P1 | CSP 含已关闭 qwen 端点 | 移除 | E2E T12 |
| 6 | P1 | 硬切分块断句异常 | 按句末标点切分 | 单测 4/4 |
| 7 | P1 | 离线引擎 cancel 不解锁 | isStopped 轮询守护 | E2E T9 Esc 停止 |
| 8 | P1 | 离线模式下载静默失败 | 明确提示 + 文件名含语速 | 静态扫描 |
| 9 | P2 | 快捷键少 | Ctrl+D/H/, + aria-keyshortcuts | E2E T8 |

## 相关文档

- [下一步改进指南](优化计划/下一步改进指南.md) — v2→v3 路线图（P0-P3 改进项清单）
- [workflow_status.md](workflow_status.md) — v2 终局审计（历史记录）
- [变更报告.html](变更报告.html) — v2 变更记录+知识点速览
- `上游资料/` — uncloseai.js、TTS、反向 RAG 等原始文档

## 文件结构

```
免费的在线聊天转语音/
├── demo.html             # ★ 主文件（v3）
├── site.webmanifest      # PWA 清单
├── README.md             # 本文件
├── workflow_status.md    # v2 历史审计
├── 变更报告.html          # v2 变更报告
├── e2e-test.cjs          # v3 E2E 测试套件（Playwright，17 项 T1-T17）
├── unit-test.cjs         # v4 P0-2 推理清洗单元测试（node:test，U_CLEAN_1-4 + 22 样本夹具）
├── package.json          # 声明 playwright 依赖（无构建工具链，保持单文件部署）
├── test-cases/            # 测试夹具
│   └── 推理清洗样本.json   # 22 真实推理回复样本（U_CLEAN_4 回归保护）
├── 优化计划/              # 改进指南 + v3 基线归档
│   ├── 下一步改进指南.md                      # ★ v3→v4→v5→v6+ 全栈迭代路线图（重写版，下游以此为准）
│   └── 下一步改进指南-v3基线归档.md            # v3 时代对 v4 的初步规划（历史参考，部分描述已过时，如 cleanAssistantText 误记为 3 前缀）
└── 上游资料/              # 11 份原始文档
```

---

*v3 基于 2026-09-06 实测：TTS 端点 502 持续宕机、Hermes CORS 已放行、模型变 Qwen3.6 推理型。**v4 Phase 0.2 复跑确认（2026-09-07）**：E2E 套件 17 项（T1-T17）真实复跑 **17/17 PASS**；单元测试 U_CLEAN_1-4（22 样本夹具）+ U_POOL_1-4（并发池 + 429 退避）真实复跑 **11/11 PASS**。pLimit `Object.assign`→`Object.defineProperties` getter bug 已修复（U_POOL_3 回归保护）。**v4.1（2026-09-07）**：新增 P0-3 配置中心（用户自带端点 + UncloseVault API Key + 引擎开关 + 导入导出 schema 校验）+ SW 跨域 CDN 缓存（P1-1，3/3 PASS）+ 全栈迭代路线图。**全量回归 44/44 PASS**（E2E 17 + SW 3 + P0-3 5 + 单元 19）。*
