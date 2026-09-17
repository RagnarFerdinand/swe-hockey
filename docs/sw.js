// Matcher — tjänstearbetaren tar bara emot notiser. Den cachar ingenting:
// schemat ska alltid hämtas färskt från Swehockey.

self.addEventListener('push', (ev) => {
  let data = {};
  try { data = ev.data ? ev.data.json() : {}; } catch { data = { body: ev.data?.text() ?? '' }; }
  ev.waitUntil(self.registration.showNotification(data.title || 'Matcher', {
    body: data.body || 'En match har flyttats.',
    icon: 'ikon-192.png',
    badge: 'ikon-192.png',
    tag: data.tag || 'matcher',
    data: { url: data.url || './' },
  }));
});

self.addEventListener('notificationclick', (ev) => {
  ev.notification.close();
  const url = ev.notification.data?.url || './';
  ev.waitUntil((async () => {
    const fönster = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const f of fönster) {
      if ('focus' in f) { await f.navigate(url).catch(() => {}); return f.focus(); }
    }
    return self.clients.openWindow(url);
  })());
});
