import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

/**
 * Gafete del trabajador (USRH1784686362321). Espejo `providers.routes.ts`.
 *
 * Sin permiso de módulo propio (decisión de permisos §16 del spec):
 * `GET /api/employees` tampoco monta ningún assert de `RoleService.hasAccess`
 * a nivel de módulo, solo `auth()` + `businessScope()` (verificado contra
 * `employee_controller.ts:654`).
 *
 * `/me` se registra ANTES de `/:employeeId`: Adonis resuelve en orden de
 * registro y de otro modo `/me` matchearía como `employeeId`.
 */
router
  .group(() => {
    router.get('/me', '#modules/employee-badge/badge.controller.me')
    router.get('/:employeeId', '#modules/employee-badge/badge.controller.show')
    router.get('/:employeeId/pdf', '#modules/employee-badge/badge.controller.pdf')
    router.get('/:employeeId/png', '#modules/employee-badge/badge.controller.png')
  })
  .prefix('/api/employee-badges')
  .use(middleware.auth())
  .use(middleware.businessScope())
