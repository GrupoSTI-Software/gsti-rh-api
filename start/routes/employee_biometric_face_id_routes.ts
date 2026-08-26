import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'
import { EMPLOYEES_READ_PERMISSION_DECLARATIONS } from '#constants/employees_read_permission_declarations'

/**
 * USRH1783821206584: todo el grupo es administración desde el Backoffice con
 * sesión de usuario (bearerAuth) — incluidas `getPhotoToken`/`streamPhoto`,
 * que son un proxy server-side para servir la foto ya autenticada (no un
 * checador de dispositivo sin unidad activa como `POST /api/verify-face`,
 * que vive en `face_routes.ts` y se deja explícitamente sin `businessScope`).
 */
router
  .group(() => {
    router
      .get(
        '/:employeeId/biometric-face-id',
        '#controllers/employee_biometric_face_id_controller.getPhoto'
      )
      .use(middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.getBiometricFaceId))
    router
      .post(
        '/:employeeId/biometric-face-id',
        '#controllers/employee_biometric_face_id_controller.uploadPhoto'
      )
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.uploadEmployeeFaceId))
    router
      .put(
        '/:employeeId/biometric-face-id',
        '#controllers/employee_biometric_face_id_controller.replacePhoto'
      )
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.replaceEmployeeFaceId))
    router
      .delete(
        '/:employeeId/biometric-face-id',
        '#controllers/employee_biometric_face_id_controller.deletePhoto'
      )
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeFaceId))
    router
      .get(
        '/:employeeId/biometric-face-id-with-token/:token',
        '#controllers/employee_biometric_face_id_controller.getPhotoToken'
      )
      .use(
        middleware.permissionGate(
          EMPLOYEES_READ_PERMISSION_DECLARATIONS.getBiometricFaceIdWithToken
        )
      )
    router
      .get(
        '/:employeeId/biometric-face-id-photo',
        '#controllers/employee_biometric_photos_controller.streamPhoto'
      )
      .use(
        middleware.permissionGate(
          EMPLOYEES_READ_PERMISSION_DECLARATIONS.streamBiometricFacePhoto
        )
      )
  })
  .prefix('/api/employees')
  .use(middleware.auth())
  .use(middleware.businessScope())
  .use(middleware.sensitiveMaskEcho())
