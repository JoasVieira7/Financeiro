// Service Worker do Fluxo Financeiro (Web Push e Notificações em Segundo Plano)
// ETAPA 34.1 — Compatível com Chrome, Edge, Firefox, Android e iOS 16.4+ (PWA)

self.addEventListener('install', event => {
  // Ativação imediata da nova versão do Service Worker
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  // Assume o controle de todas as abas abertas imediatamente
  event.waitUntil(self.clients.claim());
});

// Escuta o evento PUSH enviado pelo servidor (mesmo com o app fechado)
self.addEventListener('push', event => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'Fluxo Financeiro', body: event.data.text() };
    }
  }

  const title = data.title || 'Lembrete de Vencimento 💳';
  const options = {
    body: data.body || 'Você possui um compromisso financeiro próximo do vencimento.',
    icon: data.icon || '/pwa-192x192.png',
    badge: data.badge || '/favicon-32x32.png',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/',
      dateOfArrival: Date.now(),
      primaryKey: data.primaryKey || '1',
    },
    actions: [
      { action: 'open', title: 'Ver Detalhes' },
      { action: 'close', title: 'Fechar' },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Trata o clique do usuário na notificação com tratamento resiliente de Promise
self.addEventListener('notificationclick', event => {
  event.notification.close();

  if (event.action === 'close') {
    return;
  }

  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async windowClients => {
      // 1. Se já houver uma aba aberta com o aplicativo, tenta navegar e foca nela
      for (let client of windowClients) {
        if ('focus' in client) {
          if ('navigate' in client) {
            try {
              await client.navigate(targetUrl);
            } catch (navErr) {
              // A rejeição em navigate() não deve interromper o foco da janela
              console.warn('Navegação de cliente existente ignorada com segurança:', navErr);
            }
          }
          try {
            return await client.focus();
          } catch (focusErr) {
            console.warn('Falha ao focar janela existente:', focusErr);
          }
        }
      }

      // 2. Se o app estava fechado, abre uma nova janela/aba na URL desejada
      if (self.clients.openWindow) {
        try {
          return await self.clients.openWindow(targetUrl);
        } catch (openErr) {
          console.warn('Falha ao abrir nova janela:', openErr);
        }
      }
    })
  );
});

