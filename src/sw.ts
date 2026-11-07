/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { clientsClaim } from 'workbox-core';

declare const self: ServiceWorkerGlobalScope;

self.skipWaiting();
clientsClaim();

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

const base = new URL(self.registration.scope).pathname;

registerRoute(
  new NavigationRoute(createHandlerBoundToURL(`${base}index.html`), {
    denylist: [/\/share-target$/],
  }),
);

export const SHARED_CACHE = 'pengeoversikt-shared-files';

/**
 * Web Share Target (Android): the OS posts shared CSV files here. They are stored in a cache and
 * the app is opened on the import screen, which picks them up.
 */
self.addEventListener('fetch', (event: FetchEvent) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'POST' || !url.pathname.endsWith('/share-target')) return;
  event.respondWith(
    (async () => {
      try {
        const form = await event.request.formData();
        const files = form.getAll('files').filter((f): f is File => f instanceof File);
        const cache = await caches.open(SHARED_CACHE);
        for (const key of await cache.keys()) await cache.delete(key);
        let i = 0;
        for (const file of files) {
          const key = `${base}__shared__/${i++}`;
          await cache.put(
            new Request(key),
            new Response(file, {
              headers: {
                'Content-Type': file.type || 'text/csv',
                'X-File-Name': encodeURIComponent(file.name || `delt-${i}.csv`),
              },
            }),
          );
        }
        return Response.redirect(`${base}#/import?shared=${files.length}`, 303);
      } catch {
        return Response.redirect(`${base}#/import?shared=0`, 303);
      }
    })(),
  );
});
