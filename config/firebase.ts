import env from '#start/env';
import admin from 'firebase-admin';

const serviceAccount = JSON.parse(
  env.get('FIREBASE_SERVICE_ACCOUNT') || ''
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

export default admin;
