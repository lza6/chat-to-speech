B1 本地记忆三层方案（参考 D-MEM-1 报告）：
- store：conversations(L0) / records(L1 三层记忆) / persona(L3 画像单文档) / skills(结晶) / sessions(日志)
- 记忆记录字段：{id,type,content,priority,tier,topics[],source,session_id,version,supersedes,created_at,attributed_to,confidence,reinforcement_count}
- 画像克制更新：2000 字硬上限 + 只喂变化场景 + 强化计数(reinforcement_count+1)而非覆盖
- 检索：BM25 字段加权(title×4+tags×3.5+desc×2.5+body×1) × IDF(log(1+(N-df+.5)/(df+.5)))
- 结晶：同概念 observations≥3 → 建议成 skill → 用户确认
测试文件：unit-test-memory.cjs（纯 JS BM25 + 画像克制 + 记录 schema）