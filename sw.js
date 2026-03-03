const CACHE_NAME = 'watchlist-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './list.html',
  './stats.html',
  './style.css',
  './app.js',
  './list.js',
  './stats.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
});

self.addEventListener('fetch', (event) => {
  // Ignora le richieste API (GitHub, TMDB, Gemini, ecc.)
  if (event.request.url.includes('api.github.com') || 
      event.request.url.includes('themoviedb.org') || 
      event.request.url.includes('googleapis.com')) {
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        return response || fetch(event.request);
      })
  );
});