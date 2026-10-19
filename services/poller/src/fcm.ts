/**
 * Firebase Cloud Messaging Integration via Firebase Admin SDK
 */
import * as admin from 'firebase-admin';

let isInitialized = false;

export function initializeFirebase(serviceAccountJsonString: string): boolean {
  if (isInitialized) {
    return true;
  }
  try {
    const serviceAccount = JSON.parse(serviceAccountJsonString);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
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
  if (!isInitialized) {
    console.warn('Firebase not initialized. Skipping FCM push notification.');
    return false;
  }

  try {
    const message: admin.messaging.Message = {
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

    const response = await admin.messaging().send(message);
    console.log(`FCM alert sent successfully to topic school-${params.schoolId}:`, response);
    return true;
  } catch (error) {
    console.error(`Failed to send FCM message for school ${params.schoolId}:`, error);
    return false;
  }
}
