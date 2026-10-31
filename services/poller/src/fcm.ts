/**
 * Firebase Cloud Messaging Integration via Firebase Admin SDK (v14 Modular API)
 */
let appModule: any = null;
let messagingModule: any = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  appModule = require('firebase-admin/app');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  messagingModule = require('firebase-admin/messaging');
} catch (_err) {
  // Graceful fallback when firebase-admin is not packaged in Lambda layer
}

let isInitialized = false;

export function isFirebaseConfigured(): boolean {
  return isInitialized && !!appModule && !!messagingModule;
}

export function resetFirebaseForTesting(): void {
  isInitialized = false;
}

export function initializeFirebase(serviceAccountJsonString: string): boolean {
  if (isInitialized) {
    return true;
  }
  if (!appModule || !messagingModule) {
    console.warn('firebase-admin modules not available in runtime environment. Push notifications disabled.');
    return false;
  }
  try {
    const serviceAccount = JSON.parse(serviceAccountJsonString);
    if (appModule.getApps && appModule.getApps().length === 0) {
      appModule.initializeApp({
        credential: appModule.cert(serviceAccount),
      });
    }
    isInitialized = true;
    console.log('Firebase Admin initialized successfully.');
    return true;
  } catch (error) {
    console.error('Failed to initialize Firebase Admin SDK:', error);
    return false;
  }
}

export async function sendSchoolAlertPushNotification(params: {
  schoolId: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}): Promise<boolean> {
  if (!messagingModule || !isInitialized) {
    console.warn('Firebase not initialized. Skipping FCM push notification.');
    return false;
  }

  try {
    const message = {
      topic: `school-${params.schoolId}`,
      notification: {
        title: params.title,
        body: params.body,
      },
      data: params.data || {},
      android: {
        priority: 'high' as const,
        notification: {
          channelId: 'airsafe_alerts',
          sound: 'default',
        },
      },
    };

    const messaging = messagingModule.getMessaging();
    const response = await messaging.send(message);
    console.log(`FCM alert sent successfully to topic school-${params.schoolId}:`, response);
    return true;
  } catch (error) {
    console.error(`Failed to send FCM message for school ${params.schoolId}:`, error);
    return false;
  }
}
