const CACHE_NAME = 'image-style-transfer-cache-v2'; // increment version
const ONNX_MODELS_CACHE_NAME = 'onnx-models-v2';
const APP_SHELL_FILES = [
    '/',
    '/image',
    '/video',
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            console.log('SW: Precaching app shell');
            return cache.addAll(APP_SHELL_FILES);
        })
    );
});

self.addEventListener('activate', event => {
    const cacheWhitelist = [CACHE_NAME, ONNX_MODELS_CACHE_NAME];
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        console.log('SW: Deleting old cache', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    return self.clients.claim();
});

self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Cache ONNX models with a cache-first strategy
    if (url.pathname.endsWith('.onnx')) {
        event.respondWith(cacheFirst(event.request, ONNX_MODELS_CACHE_NAME));
        return;
    }

    // For app shell and other assets, use a network-first strategy to keep them updated.
    // The networkFirst function will cache the response on successful fetch.
    event.respondWith(networkFirst(event.request, CACHE_NAME));
});

async function cacheFirst(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
        return cachedResponse;
    }
    try {
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
            await cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    } catch (error) {
        console.error('Fetch failed, and not in cache:', request.url, error);
        return Response.error();
    }
}

async function networkFirst(request, cacheName) {
    const cache = await caches.open(cacheName);
    try {
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
            await cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    } catch (error) {
        console.log('Network request failed, trying cache for:', request.url);
        const cachedResponse = await cache.match(request);
        return cachedResponse || Response.error();
    }
}