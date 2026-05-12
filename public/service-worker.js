const CACHE_VERSION = "imgconvert-v3";
const SHELL_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
];

function cacheableResponse(response) {
  if (!response || !response.ok) return null;
  if (!response.redirected) return response.clone();
  return response.clone().blob().then((body) =>
    new Response(body, {
      headers: response.headers,
      status: response.status,
      statusText: response.statusText,
    })
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) =>
        Promise.all(
          SHELL_ASSETS.map((url) =>
            fetch(url, { redirect: "follow" }).then(async (response) => {
              const toCache = await cacheableResponse(response);
              if (toCache) await cache.put(url, toCache);
            })
          )
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.protocol === "chrome-extension:") return;
  if (url.origin !== self.location.origin) return;

  const isNavigationRequest = request.mode === "navigate";
  const isStaticAsset =
    url.pathname.startsWith("/assets/") ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".wasm") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".webp") ||
    url.pathname.endsWith(".json");

  if (isNavigationRequest) {
    event.respondWith(
      caches
        .match("/index.html")
        .then((cached) => {
          if (cached) return cached;
          return fetch(request, { redirect: "follow" }).then((response) => {
            if (!response.ok) return response;
            const clone = response.clone();
            caches.open(CACHE_VERSION).then(async (cache) => {
              const toCache = await cacheableResponse(clone);
              if (toCache) await cache.put("/index.html", toCache);
            });
            return response;
          });
        })
    );
    return;
  }

  if (isStaticAsset) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request, { redirect: "follow" }).then((response) => {
          if (!response.ok) return response;
          const clone = response.clone();
          caches.open(CACHE_VERSION).then(async (cache) => {
            const toCache = await cacheableResponse(clone);
            if (toCache) await cache.put(request, toCache);
          });
          return response;
        });
      }),
    );
    return;
  }

  event.respondWith(
    fetch(request, { redirect: "follow" }).catch(() =>
      caches
        .match(request)
        .then((c) => (c ? c : Response.error()))
    ),
  );
});
