import env from '#start/env';
import admin from 'firebase-admin';

// Firebase aún no se usa en producción.
// Solo se inicializa la app si hay credenciales configuradas; de lo contrario
// se omite la inicialización para no romper los servicios que importan este módulo.
const serviceAccountRaw = env.get('FIREBASE_SERVICE_ACCOUNT');

if (serviceAccountRaw) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(serviceAccountRaw))
  });
}

export default admin;
