# CI/CD 指南 — 在线聊天转语音（纯前端 PWA）

## 一、Pipeline 架构（GitHub Actions）

```
feature/* ──PR──▶ develop ──merge──▶ ⎡ Stage 0 Install (cache) ⎤
hotfix/* ──PR──▶ main   ──merge──▶ ⎢ Stage 1 Build+Dist      ⎥
                                    ⎢ Stage 2 Quality(语法+台账)⎥
                                    ⎢ Stage 3 Test(单元+E2E)   ⎥
                                    ⎢ Stage 4 Security(audit)  ⎥
                                    ⎣ Stage 5 Deploy Pages     ⎦
                                          │
                     main → production Pages + auto Release
                     develop → staging Pages
                     PR → preview 评论（含 Stage 状态表）
```

## 二、Stage 明细与配置

### Stage 0 Install（缓存加速）
```yaml
- uses: actions/setup-node@v4
  with: { node-version: '22', cache: npm }
- run: npm ci
- run: npx playwright install --with-deps chromium   # 缓存浏览器
```

### Stage 1 Build + Dist 同步
- 目的：确保 `dist/index.html` 与 `demo.html` 永远一致（桌面壳 frontendDist 读取 dist）
- `cp demo.html dist/index.html && diff -q` — 不一致即 FAIL
- 产出 `dist/` artifact + SHA256 指纹

### Stage 2 Quality
| 检查 | 命令 | 失败标准 |
|------|------|---------|
| demo.html 内联 JS 语法 | `node -e "提取 script → node --check"` | 语法错 |
| 全部测试文件语法 | `node --check *.cjs`（12 文件） | 语法错 |
| 验收台账门禁 | `node verify-acceptance.cjs --strict` | E2E<29 或 单元<33 或 缺文件 |
| 无硬编码密钥 | `grep sk-/ghp_/AKIA` | 命中即 FAIL |
| 无 TODO/FIXME 残留 | `grep TODO\|FIXME\|XXX` | 命中即 FAIL |

### Stage 3 Test（真实浏览器）
- 单元：6 个 `unit-test-*.cjs`（37 项）`node --test`
- E2E：4 套件（17+3+5+4=29 项）`node e2e-test*.cjs`，Playwright headless 真跑
- 分片：`strategy.matrix.shard: [1,2]` 并行（shard1=e2e-test+sw，shard2=cfg+zh）
- 服务器：`node -e "...listen(8765)"` 后台起，3s 等待
- 台账：`node verify-acceptance.cjs` 追加 ledger（continue-on-error：真实断言已在上方）

### Stage 4 Security
| 检查 | 工具 | 说明 |
|------|------|------|
| 依赖漏洞 | `npm audit --omit=dev --audit-level=high` | 生产依赖 0 漏洞基线 |
| 密钥泄漏 | gitleaks-action | 全仓库扫描历史 |
| 硬编码密钥 | 自写 grep | 治本 |

### Stage 5 Deploy（GitHub Pages）
- `main` merge → **production** Pages（`https://<user>.github.io/chat-to-speech/`）
- `develop` merge → **staging** Pages（`/develop/` 子路径）
- `main` 上 feat/fix commit → **自动创建 GitHub Release**（softprops/action-gh-release，tag=v<run_number>）

## 三、分支管理

| 分支 | 用途 | CI | 部署 |
|------|------|----|----|
| `feature/*` | 新功能开发 | PR 触发 Build/Quality/Test/Security | PR 预览评论 |
| `develop` | 集成分支 | merge 触发全量 | staging Pages |
| `main` | 生产 | merge 触发全量 | production Pages + Release |
| `hotfix/*` | 紧急修复 | PR 直接打 main | 过全部 4 Stage 后进 prod |
| `v*` tag | 版本标记 | 触发 workflow（可选） | Release |

## 四、Secrets 与环境变量

| 名称 | 位置 | 必填 | 说明 |
|------|------|------|------|
| `GITHUB_TOKEN` | 自动注入 | ✅ | Release + Pages 部署 |
| Pages 配置 | Settings→Pages | ✅ | Source 选 GitHub Actions |
| `NODE_VERSION` | 仓库常量 | — | 22（含 `node --test` 稳定） |

> 本项目 **无任何第三方 Secret**（无 API Key/无部署凭证/无云服务账号）。纯 GitHub 托管即可运转。

## 五、性能优化

1. **依赖缓存**：`setup-node cache: npm` 缓存 node_modules + `send-cache-dependency-path`
2. **Playwright 浏览器缓存**：`PLAYWRIGHT_BROWSERS_PATH=0` + run 级缓存
3. **E2E 分片**：matrix shard 1/2 并行（快一倍）
4. **Concurrency 取消**：`cancel-in-progress: true`（同分支新 push 取消旧 run）
5. **依赖 jenkins**：`needs: [build, quality, test, security]` 并行 → 单 deploy

## 六、故障排查指南

| 症状 | 原因 | 修复 |
|------|------|------|
| `node --check .ci-check.js` 失败 | demo.html 内联 script 引号未闭合 | 本地跑 `node -e "提取" && node --check` 定位 |
| `verify-acceptance --strict` exit 1 | E2E 或单元数不符/缺文件 | 检查新增测试文件是否已加进 `UNIT_FILES` |
| E2E T4/T8 偶发红 | 端点探测/引擎1.5 下载超时 | 等待放宽至 4s；确定性改 `waitForFunction` |
| `npm audit` 报 high | dev 依赖有漏洞 | `npm audit fix`；锁文件升级 |
| Pages 部署 404 | 根路径渲染 | 检查 `dist/index.html` 存在 + Pages source=Actions |
| Release 未创建 | commit message 非 feat/fix 开头 | 统一 `<type>: <desc>` 格式 |
| E2E 本地过 CI 挂 | headless 语音不可用 | CI 已装 chromium；确认 `speechSynthesis` 兜底 |

## 七、本地等价命令（不打 CI 也能验）

```bash
npm ci
cp demo.html dist/index.html && diff -q demo.html dist/index.html
node --check verify-acceptance.cjs && node verify-acceptance.cjs --strict
node --test unit-test.cjs unit-test-pool.cjs unit-test-cfg.cjs unit-test-zh.cjs unit-test-health.cjs unit-test-memory.cjs
npm run serve &   # 8765
node e2e-test.cjs && node e2e-test-sw.cjs && node e2e-test-cfg.cjs && node e2e-test-zh.cjs
npm audit --omit=dev --audit-level=high
```

## 八、回滚策略

- **部署回滚**：GitHub Pages 支持切回历史部署（Actions→deploy-pages→Re-run previous）
- **发布回滚**：`gh release delete <tag>` 再删 tag；`git revert <sha>` 触发新 CI 重新部署
- **代码回滚**：`git revert`（保留历史）而非 `reset`（丢历史）
