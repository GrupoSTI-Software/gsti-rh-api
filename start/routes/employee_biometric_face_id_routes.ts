import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

/**
 * USRH1783821206584: todo el grupo es administración desde el Backoffice con
 * sesión de usuario (bearerAuth) — incluidas `getPhotoToken`/`streamPhoto`,
 * que son un proxy server-side para servir la foto ya autenticada (no un
 * checador de dispositivo sin unidad activa como `POST /api/verify-face`,
 * que vive en `face_routes.ts` y se deja explícitamente sin `businessScope`).
 */
router
  .group(() => {
    router.get(
      '/:employeeId/biometric-face-id',
      '#controllers/employee_biometric_face_id_controller.getPhoto'
    )
    router.post(
      '/:employeeId/biometric-face-id',
      '#controllers/employee_biometric_face_id_controller.uploadPhoto'
    )
    router.put(
      '/:employeeId/biometric-face-id',
      '#controllers/employee_biometric_face_id_controller.replacePhoto'
    )
    router.delete(
      '/:employeeId/biometric-face-id',
      '#controllers/employee_biometric_face_id_controller.deletePhoto'
    )
    router.get(
      '/:employeeId/biometric-face-id-with-token/:token',
      '#controllers/employee_biometric_face_id_controller.getPhotoToken'
    )
    router.get(
      '/:employeeId/biometric-face-id-photo',
      '#controllers/employee_biometric_photos_controller.streamPhoto'
    )
  })
  .prefix('/api/employees')
  .use(middleware.auth())
  .use(middleware.businessScope())

