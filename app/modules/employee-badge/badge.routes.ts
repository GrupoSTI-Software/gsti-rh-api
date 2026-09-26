import router from '@adonisjs/core/services/router'
import limiter from '@adonisjs/limiter/services/main'
import { middleware } from '#start/kernel'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'

const employeeBadgeBulkRateLimit = limiter.define('employee-badge-bulk', (ctx) => {
  return limiter.allowRequests(3).every('1 minute').usingKey(`user:${ctx.auth.user!.userId}`)
})

/**
 * Gafete del trabajador (USRH1784686362321). Espejo `providers.routes.ts`.
 *
 * Las cuatro vías del backoffice —consultar, PDF, PNG y lote— las gobierna
 * `generate-badges` (USRH1787433076993): la casilla que el backoffice ya
 * usaba para mostrar u ocultar el botón decide ahora también en el servidor.
 * Antes las tres individuales colgaban de `tab-foto-read`, que es el permiso
 * de ver la fotografía y no el de generar un documento con foto, nombre y
 * número de empleado; y `/bulk` no comprobaba nada más allá del rate-limit.
 *
 * `/me` NO lleva gate y no debe llevarlo: es el gafete propio del
 * colaborador, exento por diseño (`collaborator-own-badge`,
 * `employees_permission_catalog.ts`). Añadírselo rompería la app del empleado.
 *
 * `/me` y `/bulk` se registran ANTES de `/:employeeId`: Adonis resuelve en
 * orden de registro y de otro modo `/me` matchearía como `employeeId`.
 */
router
  .group(() => {
    router.get('/me', '#modules/employee-badge/badge.controller.me')
    router
      .post('/bulk', '#modules/employee-badge/badge.controller.bulk')
      .use(employeeBadgeBulkRateLimit)
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.bulkEmployeeBadges))
    router
      .get('/:employeeId', '#modules/employee-badge/badge.controller.show')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.showEmployeeBadge))
    router
      .get('/:employeeId/pdf', '#modules/employee-badge/badge.controller.pdf')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.getEmployeeBadgePdf))
    router
      .get('/:employeeId/png', '#modules/employee-badge/badge.controller.png')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.getEmployeeBadgePng))
  })
  .prefix('/api/employee-badges')
  .use(middleware.auth())
  .use(middleware.businessScope())
