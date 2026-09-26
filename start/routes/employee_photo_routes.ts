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
 *
 * `/me/photo` NO lleva `permissionGate` y no debe llevarlo: es la foto propia
 * del colaborador, exenta por diseño — mismo criterio y mismo grupo de
 * middlewares que `GET /api/employee-badges/me` (`badge.routes.ts:20-29`). No
 * hay identificador que autorizar: el empleado lo resuelve la sesión por
 * `personId` y el candado de empresa lo sigue poniendo `businessScope()`.
 *
 * Se registra ANTES de `/:employeeId/photo`: Adonis resuelve por ORDEN de
 * registro (`@poppinss/matchit`.`match` devuelve el primer token-set que casa;
 * no prioriza el segmento estático sobre el parámetro). Registrada después,
 * `GET /api/employees/me/photo` caería en `show`, donde `Number('me')` es `NaN`
 * y la respuesta sería 400 `empleado-id-invalido` — o 403 antes, si la
 * exigencia del módulo `employees` está encendida.
 */
router
  .group(() => {
    router.get('/me/photo', '#controllers/employee_photo_stream_controller.me')
    router
      .get('/:employeeId/photo', '#controllers/employee_photo_stream_controller.show')
      .use(middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.streamEmployeePhoto))
  })
  .prefix('/api/employees')
  .use(middleware.auth())
  .use(middleware.businessScope())
