/**
 * Firebase Cloud Messaging Integration via Firebase Admin SDK
 */
let adminModule: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  adminModule = require('firebase-admin');
} catch (_err) {
  // Graceful fallback when firebase-admin is not packaged in Lambda layer
}

let isInitialized = false;

export function initializeFirebase(serviceAccountJsonString: string): boolean {
  if (isInitialized) {
    return true;
  }
  if (!adminModule) {
    console.warn('firebase-admin module not available in runtime environment. Push notifications disabled.');
    return false;
  }
  try {
    const serviceAccount = JSON.parse(serviceAccountJsonString);
    adminModule.initializeApp({
      credential: adminModule.credential.cert(serviceAccount),
    });
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
  if (!adminModule || !isInitialized) {
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
        priority: 'high',
        notification: {
          channelId: 'airsafe_alerts',
          sound: 'default',
        },
      },
    };

    const response = await adminModule.messaging().send(message);
    console.log(`FCM alert sent successfully to topic school-${params.schoolId}:`, response);
    return true;
  } catch (error) {
    console.error(`Failed to send FCM message for school ${params.schoolId}:`, error);
    return false;
  }
}
