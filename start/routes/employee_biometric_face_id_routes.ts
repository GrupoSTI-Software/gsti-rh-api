import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'

/**
 * USRH1783821206584: el grupo se sirve con sesión de usuario (bearerAuth). Las
 * escrituras son administración desde el Backoffice y llevan su gate aquí; las
 * tres lecturas NO lo llevan porque las comparte la app del colaborador, que
 * pide su propia foto para checar: su permiso se evalúa en el controlador, que
 * exime al dueño y exige el permiso a cualquier otra sesión. No confundir con
 * `POST /api/verify-face` (`face_routes.ts`), checador de dispositivo sin unidad
 * activa, que se deja explícitamente sin `businessScope`.
 */
router
  .group(() => {
    router
      // Sin permissionGate en el router a propósito: el permiso se evalúa en el
      // controlador, que antes exime al dueño de la foto. Con el gate aquí, la
      // app del empleado quedaría fuera de su propia foto.
      .get(
        '/:employeeId/biometric-face-id',
        '#controllers/employee_biometric_face_id_controller.getPhoto'
      )
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
    // Copia del rostro biometrico a la foto de perfil. El gate del router cubre
    // solo la escritura de la foto; el controlador exige ademas la lectura
    // biometrica y lo hace con `evaluateEnforced`, porque este `permissionGate`
    // concede mientras la exigencia del modulo `employees` siga apagada.
    router
      .post(
        '/:employeeId/biometric-face-id/use-as-photo',
        '#controllers/employee_biometric_face_id_controller.useAsEmployeePhoto'
      )
      .use(
        middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.useEmployeeFaceIdAsPhoto)
      )
    router
      .get(
        '/:employeeId/biometric-face-id-with-token/:token',
        '#controllers/employee_biometric_face_id_controller.getPhotoToken'
      )
    router
      .get(
        '/:employeeId/biometric-face-id-photo',
        '#controllers/employee_biometric_photos_controller.streamPhoto'
      )
  })
  .prefix('/api/employees')
  .use(middleware.auth())
  .use(middleware.businessScope())
  .use(middleware.sensitiveMaskEcho())
