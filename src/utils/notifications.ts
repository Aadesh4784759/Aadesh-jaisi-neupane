import firebaseConfig from '../../firebase-applet-config.json';

export interface NotificationReadinessSnapshot {
  browserNotificationSupported: boolean;
  serviceWorkerSupported: boolean;
  pushManagerSupported: boolean;
  permission: NotificationPermission | 'unsupported';
  vapidKeyConfigured: boolean;
  fcmWebConfigReady: boolean;
  statusLabel: string;
  guidance: string;
}

export function getNotificationReadinessSnapshot(): NotificationReadinessSnapshot {
  const browserNotificationSupported =
    typeof window !== 'undefined' && 'Notification' in window;
  const serviceWorkerSupported =
    typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
  const pushManagerSupported =
    typeof window !== 'undefined' && 'PushManager' in window;
  const permission: NotificationPermission | 'unsupported' =
    browserNotificationSupported ? Notification.permission : 'unsupported';

  const vapidKey =
    typeof import.meta !== 'undefined' &&
    typeof (import.meta as any).env?.VITE_FIREBASE_VAPID_KEY === 'string'
      ? (import.meta as any).env.VITE_FIREBASE_VAPID_KEY.trim()
      : '';
  const vapidKeyConfigured = vapidKey.length > 0;
  const fcmWebConfigReady = Boolean(
    firebaseConfig?.messagingSenderId && firebaseConfig?.appId
  );

  let statusLabel = 'Local Notifications Ready';
  let guidance =
    'Daily streak alerts use browser Notifications when permitted. Remote background FCM push requires setting VITE_FIREBASE_VAPID_KEY (Web Push certificate) and firebase-messaging-sw.js, plus google-services.json / APNs in future native React Native builds.';

  if (!browserNotificationSupported) {
    statusLabel = 'Browser Notifications Unsupported';
  } else if (permission === 'denied') {
    statusLabel = 'Permission Blocked by Browser';
  } else if (vapidKeyConfigured && pushManagerSupported && serviceWorkerSupported && permission === 'granted') {
    statusLabel = 'Web Push & Local Alerts Ready';
  }

  return {
    browserNotificationSupported,
    serviceWorkerSupported,
    pushManagerSupported,
    permission,
    vapidKeyConfigured,
    fcmWebConfigReady,
    statusLabel,
    guidance,
  };
}
