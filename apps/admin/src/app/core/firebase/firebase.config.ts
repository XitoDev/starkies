/**
 * Firebase Web SDK configuration.
 *
 * Fill these values from Firebase Console → Project settings → General
 * → Your apps → SDK setup and configuration.
 *
 * These web-app values are not server credentials. Never put service-account
 * JSON, private keys, or Admin SDK credentials in this file.
 */
export const firebaseWebConfig = {
  apiKey: 'REPLACE_WITH_FIREBASE_WEB_API_KEY',
  authDomain: 'REPLACE_WITH_FIREBASE_AUTH_DOMAIN',
  projectId: 'starkies',
  appId: 'REPLACE_WITH_FIREBASE_WEB_APP_ID',
  // Optional; fill from the same Firebase web-app configuration if Storage is enabled.
  storageBucket: '',
  messagingSenderId: '',
};
