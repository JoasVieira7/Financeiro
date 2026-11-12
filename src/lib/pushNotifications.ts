/**
 * Utilitário completo para Notificações Web Push, Service Worker e Permissões do Navegador
 * ETAPA 34.2 — Fluxo Financeiro (Hardening de Segurança & Proteção SSRF)
 *
 * Características de Segurança:
 * - SEC-04: Validação rigorosa de endpoints com allowlist contra SSRF.
 * - SEC-02: Suporte a dispositivos compartilhados com desassociação imediata de contas anteriores.
 * - Registra e controla o Service Worker (/sw.js).
 * - Suporta Inscrição Real Web Push (VAPID) para recebimento mesmo com app fechado.
 * - Sincroniza endpoints com a tabela public.push_subscriptions no Supabase.
 */

import { supabase, isSupabaseConfigured } from './supabase';

export type PushPermissionStatus = 'granted' | 'denied' | 'default' | 'unsupported';

export const isWebPushSupported = (): boolean => {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  );
};

export const getNotificationPermission = (): PushPermissionStatus => {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission as PushPermissionStatus;
};

export const requestPushPermission = async (): Promise<PushPermissionStatus> => {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';

  try {
    const permission = await Notification.requestPermission();
    return permission as PushPermissionStatus;
  } catch (err) {
    console.warn('Erro ao solicitar permissão de notificação no navegador:', err);
    return getNotificationPermission();
  }
};

/**
 * Converte chave pública VAPID (base64 URL Safe) para Uint8Array exigido pelo PushManager.
 */
export function urlB64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * SEC-04: Validação rigorosa de endpoint Web Push contra SSRF e URLs arbitrárias.
 * Aceita somente HTTPS, portas padrão e domínios legítimos de provedores Web Push.
 */
export function isValidWebPushEndpoint(endpointStr: string): boolean {
  if (!endpointStr || typeof endpointStr !== 'string') return false;

  let url: URL;
  try {
    url = new URL(endpointStr);
  } catch {
    return false;
  }

  // 1. Apenas protocolo seguro HTTPS
  if (url.protocol !== 'https:') return false;

  // 2. Não permite credenciais embutidas (ex: https://user:pass@host)
  if (url.username || url.password) return false;

  // 3. Não permite portas não-padrão (deve ser vazia ou 443)
  if (url.port && url.port !== '443') return false;

  const hostname = url.hostname.toLowerCase();

  // 4. Rejeita localhost, IPs (v4 ou v6) e nomes de rede local
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) || // IPv4
    /^\[?[0-9a-f:]+\]?$/i.test(hostname) // IPv6
  ) {
    return false;
  }

  // 5. Allowlist restrita e explícita dos provedores oficiais de Web Push:
  // - Google FCM / Android / Chrome
  // - Apple Push Notification Service (APNs) / Safari / iOS PWA
  // - Mozilla Push Service / Firefox
  // - Microsoft Windows Push Notification Services (WNS) / Edge
  const isGoogle = hostname === 'fcm.googleapis.com' || hostname.endsWith('.push.googleapis.com');
  const isApple = hostname.endsWith('.push.apple.com');
  const isMozilla =
    hostname === 'updates.push.services.mozilla.com' ||
    hostname.endsWith('.push.services.mozilla.com');
  const isMicrosoft =
    hostname.endsWith('.notify.windows.com') || hostname.endsWith('.wns.windows.com');

  return isGoogle || isApple || isMozilla || isMicrosoft;
}

/**
 * Registra o Service Worker do aplicativo caso suportado.
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });
    return registration;
  } catch (err) {
    console.warn('Falha ao registrar Service Worker do Fluxo Financeiro:', err);
    return null;
  }
}

/**
 * Obtém a inscrição push ativa do dispositivo atual, se houver.
 */
export async function getExistingPushSubscription(): Promise<PushSubscription | null> {
  if (!isWebPushSupported()) return null;

  try {
    const reg = await navigator.serviceWorker.ready;
    return await reg.pushManager.getSubscription();
  } catch (err) {
    console.warn('Erro ao obter inscrição push existente:', err);
    return null;
  }
}

/**
 * Inscreve o dispositivo atual no serviço de Web Push (VAPID) e vincula ao auth.uid() no Supabase.
 */
export async function subscribeUserToPush(
  userId: string
): Promise<{ success: boolean; subscription?: PushSubscription; error?: string }> {
  if (!isWebPushSupported()) {
    return { success: false, error: 'Web Push não é suportado neste navegador ou dispositivo.' };
  }

  const permission = await requestPushPermission();
  if (permission !== 'granted') {
    return { success: false, error: 'Permissão para notificações foi negada pelo usuário.' };
  }

  const reg = await registerServiceWorker();
  if (!reg) {
    return { success: false, error: 'Não foi possível registrar o Service Worker.' };
  }

  const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey || vapidPublicKey.includes('sua-chave')) {
    // VAPID ainda não configurado no ambiente de produção
    return {
      success: false,
      error:
        'VAPID Public Key não configurada (VITE_VAPID_PUBLIC_KEY). As notificações locais continuarão funcionando em primeiro plano.',
    };
  }

  try {
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const convertedVapidKey = urlB64ToUint8Array(vapidPublicKey);
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedVapidKey as any,
      });
    }

    // Extrai chaves p256dh e auth da inscrição
    const subJson = sub.toJSON();
    const endpoint = sub.endpoint;
    const p256dh = subJson.keys?.p256dh || '';
    const auth = subJson.keys?.auth || '';

    // SEC-04: Validação de segurança do endpoint antes de persistir no banco
    if (!isValidWebPushEndpoint(endpoint)) {
      console.warn('Aviso de Segurança: Endpoint de Web Push rejeitado pela allowlist.');
      return { success: false, error: 'Endpoint de notificação não pertence a um provedor confiável.' };
    }

    // SEC-02: Salva ou atualiza a inscrição no Supabase via RPC segura
    if (isSupabaseConfigured && userId) {
      const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
      
      // Tenta via RPC controlada register_push_subscription
      const { error: rpcError } = await supabase.rpc('register_push_subscription', {
        p_endpoint: endpoint,
        p_p256dh: p256dh,
        p_auth: auth,
        p_user_agent: userAgent,
      });

      if (rpcError) {
        // Fallback: se a RPC não existir ainda, usa upsert direto com constraint de endpoint
        const { error: dbError } = await supabase.from('push_subscriptions').upsert(
          {
            user_id: userId,
            endpoint,
            p256dh,
            auth,
            user_agent: userAgent,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'endpoint' }
        );

        if (dbError) {
          console.warn('Aviso: Falha ao persistir inscrição no Supabase:', dbError.message);
        }
      }
    }

    return { success: true, subscription: sub };
  } catch (err: any) {
    console.error('Erro ao inscrever dispositivo em Web Push:', err);
    return { success: false, error: err.message || 'Falha ao registrar Web Push.' };
  }
}

/**
 * Remove a inscrição Web Push do dispositivo e do banco de dados (SEC-02: Usado no logout).
 */
export async function unsubscribeUserFromPush(userId: string): Promise<boolean> {
  try {
    const sub = await getExistingPushSubscription();
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe();

      if (isSupabaseConfigured && userId) {
        await supabase
          .from('push_subscriptions')
          .delete()
          .eq('user_id', userId)
          .eq('endpoint', endpoint);
      }
    }
    return true;
  } catch (err) {
    console.warn('Erro ao desinscrever de Web Push:', err);
    return false;
  }
}

/**
 * Dispara notificação local no sistema operacional (via Service Worker ou Notification API).
 */
export const dispatchSystemPushNotification = (
  title: string,
  options?: NotificationOptions
): boolean => {
  if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') {
    return false;
  }

  // Tenta exibir via Service Worker Registration (melhor para PWA/Mobile)
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.ready
      .then(reg => {
        reg.showNotification(title, {
          icon: '/icon.svg',
          badge: '/icon.svg',
          ...options,
        });
      })
      .catch(() => {
        // Fallback para new Notification direto
        try {
          new Notification(title, { icon: '/icon.svg', badge: '/icon.svg', ...options });
        } catch {}
      });
    return true;
  }

  // Fallback direto
  try {
    const notification = new Notification(title, {
      icon: '/icon.svg',
      badge: '/icon.svg',
      silent: false,
      ...options,
    });

    notification.onclick = () => {
      window.focus();
      notification.close();
    };

    return true;
  } catch (err) {
    console.warn('Falha ao disparar notificação local no navegador:', err);
    return false;
  }
};
