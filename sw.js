// ⚽ 足彩泊松分析 - 离线缓存 Service Worker
const CACHE = 'football-poisson-v1';
const ASSETS = [
  '.',
  'index.html',
  'style.css',
  'app.js',
  'manifest.json',
  'team_map.json',
  'icon.svg',
  'icon-192.png',
  'icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  
  // 动态数据不缓存（GitHub raw, The Odds API）
  if (url.hostname.includes('raw.githubusercontent.com') ||
      url.hostname.includes('api.the-odds-api.com')) {
    return;
  }
  
  // 静态资源优先从缓存
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});
