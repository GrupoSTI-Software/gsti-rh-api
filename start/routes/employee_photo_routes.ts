import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { EMPLOYEES_READ_PERMISSION_DECLARATIONS } from '#constants/employees_read_permission_declarations'

/**
 * Salida de la foto de perfil del empleado.
 *
 * Sustituye a `GET /api/proxy-image`, que estaba fuera del grupo autenticado y
 * recibía la URL del archivo por query param. Aquí el cliente pide un empleado
 * y el servidor resuelve la clave del objeto desde el registro, dentro del
 * grupo con `auth()`, `businessScope()` y su `permissionGate`.
 */
router
  .group(() => {
    router
      .get('/:employeeId/photo', '#controllers/employee_photo_stream_controller.show')
      .use(middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.streamEmployeePhoto))
  })
  .prefix('/api/employees')
  .use(middleware.auth())
  .use(middleware.businessScope())
