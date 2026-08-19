import router from '@adonisjs/core/services/router'
import limiter from '@adonisjs/limiter/services/main'
import { middleware } from '#start/kernel'
import { EMPLOYEES_READ_PERMISSION_DECLARATIONS } from '#constants/employees_read_permission_declarations'

const employeeBadgeBulkRateLimit = limiter.define('employee-badge-bulk', (ctx) => {
  return limiter.allowRequests(3).every('1 minute').usingKey(`user:${ctx.auth.user!.userId}`)
})

/**
 * Gafete del trabajador (USRH1784686362321). Espejo `providers.routes.ts`.
 *
 * Sin permiso de módulo propio (decisión de permisos §16 del spec):
 * `GET /api/employees` tampoco monta ningún assert de `RoleService.hasAccess`
 * a nivel de módulo, solo `auth()` + `businessScope()` (verificado contra
 * `employee_controller.ts:654`).
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
    router
      .get('/:employeeId', '#modules/employee-badge/badge.controller.show')
      .use(middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.showEmployeeBadge))
    router
      .get('/:employeeId/pdf', '#modules/employee-badge/badge.controller.pdf')
      .use(middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.getEmployeeBadgePdf))
    router
      .get('/:employeeId/png', '#modules/employee-badge/badge.controller.png')
      .use(middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.getEmployeeBadgePng))
  })
  .prefix('/api/employee-badges')
  .use(middleware.auth())
  .use(middleware.businessScope())
