/**
 * Utilitário seguro para Notificações Web Push e Permissões do Navegador
 * Em conformidade com os requisitos da Etapa 15:
 * - Não solicita permissão automaticamente ao abrir a aplicação.
 * - Fornece métodos controlados para ativação/desativação no perfil.
 * - Integração graciosa com Service Worker ou API Notification padrão.
 */

export type PushPermissionStatus = 'granted' | 'denied' | 'default' | 'unsupported';

export const isWebPushSupported = (): boolean => {
  return typeof window !== 'undefined' && 'Notification' in window;
};

export const getNotificationPermission = (): PushPermissionStatus => {
  if (!isWebPushSupported()) return 'unsupported';
  return Notification.permission as PushPermissionStatus;
};

export const requestPushPermission = async (): Promise<PushPermissionStatus> => {
  if (!isWebPushSupported()) return 'unsupported';

  try {
    const permission = await Notification.requestPermission();
    return permission as PushPermissionStatus;
  } catch (err) {
    console.warn('Erro ao solicitar permissão de notificação no navegador:', err);
    return getNotificationPermission();
  }
};

export const dispatchSystemPushNotification = (
  title: string,
  options?: NotificationOptions
): boolean => {
  if (!isWebPushSupported() || Notification.permission !== 'granted') {
    return false;
  }

  try {
    const notification = new Notification(title, {
      icon: '/vite.svg',
      badge: '/vite.svg',
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

