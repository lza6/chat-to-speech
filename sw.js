/* P3-1 离线缓存 Service Worker
 * 缓存策略：网络优先回退缓存（Network-first, fallback to cache）
 * - 同源 GET：先请求网络，成功则克隆响应缓存后返回；失败回退缓存，再失败回退 demo.html（SPA 兜底）
 * - 跨域资源（uncloseai.com / cdn.jsdelivr.net / cdnjs.cloudflare.com）：不缓存，直接放行
 *   原因：远程 ES module + CDN 资源涉及 CORS 与模块语义，缓存复杂且易过期，网络失败即失败
 * - TTS 音频 blob：不缓存（blob: URL 不可缓存且体积大）
 * 作用域：./（由 demo.html 通过 navigator.serviceWorker.register('./sw.js') 注册）
 */

const CACHE_NAME = 'v3-cache-v1';
const PRECACHE_URLS = ['./demo.html', './site.webmanifest'];

// install：预缓存核心资源
// 用 Promise.allSettled 逐个添加，避免单个资源失败（如首次离线）拖垮整个安装
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url)))
    )
  );
});

// activate：清理旧版本缓存并立即接管页面控制权
// CACHE_NAME 版本化后，升级版本号即可触发旧缓存自动清理
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      );
      // 立即接管未受控制的客户端，避免需刷新两次才生效
      await self.clients.claim();
    })()
  );
});

// fetch：网络优先回退缓存
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // 非 GET 请求放行：POST/PUT/DELETE 等写入操作不应被拦截
  if (req.method !== 'GET') return;

  let url;
  try {
    url = new URL(req.url);
  } catch (e) {
    // URL 解析失败（如 blob: data: 等特殊协议）直接放行，不处理
    return;
  }

  // 跨域请求放行：远程 module/CDN 资源不缓存，由浏览器直接处理
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      try {
        // 网络优先：成功则克隆响应缓存后返回
        const networkRes = await fetch(req);
        // 只缓存有效的同源响应（200 + basic 类型），避开 opaqueredirect/error
        if (networkRes && networkRes.status === 200 && networkRes.type === 'basic') {
          const clone = networkRes.clone();
          // 异步写入缓存，不阻塞响应返回；失败静默忽略（不影响主流程）
          caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(req, clone))
            .catch(() => {});
        }
        return networkRes;
      } catch (err) {
        // 网络失败：回退缓存
        const cached = await caches.match(req);
        if (cached) return cached;
        // 缓存也无：导航请求回退 demo.html（SPA 兜底，离线刷新可打开应用壳）
        if (req.mode === 'navigate') {
          const fallback = await caches.match('./demo.html');
          if (fallback) return fallback;
        }
        // 彻底失败：抛出错误，由浏览器显示标准离线状态
        throw new Error('offline: network failed and no cache available');
      }
    })()
  );
});
