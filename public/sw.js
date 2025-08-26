const CACHE_NAME = 'image-style-transfer-cache-v1';
const ONNX_MODELS_CACHE_NAME = 'onnx-models';

self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    if (url.pathname.endsWith('.onnx')) {
        event.respondWith(cacheFirst(event.request, ONNX_MODELS_CACHE_NAME));
        return;
    }

    event.respondWith(networkFirst(event.request, CACHE_NAME));
});

async function cacheFirst(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
        return cachedResponse;
    }
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
        await cache.put(request, networkResponse.clone());
    }
    return networkResponse;
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
        const cachedResponse = await cache.match(request);
        return cachedResponse || Response.error();
    }
}
