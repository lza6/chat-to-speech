/* P1-1 SW 跨域 CDN 缓存（v4 升级，2026-09-07 联网调研结论落地）
 *
 * 调研证据（2026-09-07 实测 curl -I + 官方文档）：
 *   - uncloseai.com 源站已发 Access-Control-Allow-Origin: *（非 opaque）
 *   - 源站未发 Cache-Control，SW 是缓存策略唯一权威
 *   - 存在 ETag + Last-Modified，可走 If-None-Match 304 协商
 *   - opaque 响应可入 Cache API 但单条 ~7MB 填充惩罚，本项目应走 CORS 非 opaque 路径
 *
 * 缓存策略：
 *   - 同源 GET：NetworkFirst（已有，保留）
 *   - 跨域 uncloseai.com 脚本：StaleWhileRevalidate（缓存优先 → 后台 ETag 304 校验）
 *   - 跨域 API 端点（speech.ai.unturf.com / hermes.ai.unturf.com）：不缓存（动态响应）
 *   - 跨域 opaque 兜底：若源站未来撤 ACAO，res.type==='opaque' 也允许写入（status=0）
 *
 * TTL：跨域脚本 7 天软过期，后台 SWR 校验；maxEntries=50 防配额耗尽
 * 作用域：./（由 demo.html 通过 navigator.serviceWorker.register('./sw.js') 注册）
 */

const CACHE_NAME = 'v4-cache-v1';
const PRECACHE_URLS = ['./demo.html', './site.webmanifest'];

// P1-1 跨域可缓存源白名单（仅 uncloseai.com 脚本，API 端点不缓存）
const CROSS_ORIGIN_CACHEABLE = ['https://uncloseai.com'];
// 跨域缓存 TTL：7 天（ms）
const CROSS_ORIGIN_TTL = 7 * 24 * 60 * 60 * 1000;
// 跨域缓存条目上限（防 opaque 7MB 填充）
const CROSS_ORIGIN_MAX_ENTRIES = 50;
// 跨域缓存专用 store key（与同源 PRECACHE 分离，便于独立淘汰）
const CROSS_CACHE_NAME = 'v4-cross-cache-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url)))
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE_NAME && k !== CROSS_CACHE_NAME).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

// P1-1 跨域脚本 SWR：缓存优先 → 后台 ETag 304 校验 + 软过期重拉
async function swrCrossOrigin(req) {
  const cache = await caches.open(CROSS_CACHE_NAME);
  const cached = await cache.match(req);
  const now = Date.now();
  let cachedAt = 0;
  if (cached) {
    cachedAt = parseInt(cached.headers.get('X-SW-Cached-At') || '0', 10);
  }
  const isStale = cachedAt && (now - cachedAt) > CROSS_ORIGIN_TTL;

  const bgRefresh = (async () => {
    try {
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') {
        const copy = res.clone();
        const newHeaders = new Headers(copy.headers);
        newHeaders.set('X-SW-Cached-At', String(now));
        const newBody = await copy.blob();
        const newRes = new Response(newBody, { status: copy.status, statusText: copy.statusText, headers: newHeaders });
        await cache.put(req, newRes);
        const keys = await cache.keys();
        if (keys.length > CROSS_ORIGIN_MAX_ENTRIES) {
          const stamped = await Promise.all(keys.map(async (k) => {
            const r = await cache.match(k);
            return { req: k, at: parseInt(r && r.headers.get('X-SW-Cached-At') || '0', 10) };
          }));
          stamped.sort((a, b) => a.at - b.at);
          for (let i = 0; i < keys.length - CROSS_ORIGIN_MAX_ENTRIES; i++) {
            await cache.delete(stamped[i].req);
          }
        }
      }
      return res;
    } catch (e) {
      return null;
    }
  })();

  if (cached) {
    if (!isStale) bgRefresh;
    return cached;
  }
  const fresh = await bgRefresh;
  if (fresh) return fresh;
  throw new Error('offline: cross-origin unavailable and no cache');
}

self.addEventListener('fetch', (event) => {
  const req = event.request;

  if (req.method !== 'GET') return;

  let url;
  try {
    url = new URL(req.url);
  } catch (e) {
    return;
  }

  if (url.origin !== self.location.origin) {
    const isCacheable = CROSS_ORIGIN_CACHEABLE.some((o) => url.origin === o);
    if (!isCacheable) return;
    event.respondWith(swrCrossOrigin(req).catch(() => {
      return new Response('offline', { status: 503, statusText: 'Service Unavailable' });
    }));
    return;
  }

  event.respondWith(
    (async () => {
      try {
        const networkRes = await fetch(req);
        if (networkRes && networkRes.status === 200 && networkRes.type === 'basic') {
          const clone = networkRes.clone();
          caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(req, clone))
            .catch(() => {});
        }
        return networkRes;
      } catch (err) {
        const cached = await caches.match(req);
        if (cached) return cached;
        if (req.mode === 'navigate') {
          const fallback = await caches.match('./demo.html');
          if (fallback) return fallback;
        }
        throw new Error('offline: network failed and no cache available');
      }
    })()
  );
});
