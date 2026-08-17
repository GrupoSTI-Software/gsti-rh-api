import router from '@adonisjs/core/services/router'
import limiter from '@adonisjs/limiter/services/main'
import { middleware } from '#start/kernel'
import { EMPLOYEES_READ_PERMISSION_DECLARATIONS } from '#constants/employees_read_permission_declarations'
import { USERS_PERMISSION_DECLARATIONS } from '#constants/users_permission_declarations'

/** Reenvío de acceso: 3 / hora por usuario objetivo (USRH1786736057522). */
const resendAccessUserRateLimit = limiter.define('user-resend-access-user', (ctx) => {
  const userId = String(ctx.params.userId ?? 'unknown')
  return limiter.allowRequests(3).every('1 hour').usingKey(`user-resend:${userId}`)
})

/** Reenvío de acceso: 20 / hora por empresa (`x-business-unit-id`). */
const resendAccessBusinessUnitRateLimit = limiter.define('user-resend-access-bu', (ctx) => {
  const businessUnitId = String(ctx.request.header('x-business-unit-id') ?? 'unknown')
  return limiter.allowRequests(20).every('1 hour').usingKey(`bu-resend:${businessUnitId}`)
})

router
  .group(() => { 
    router.get(
      '/has-access-department/:userId/:departmentId',
      '#controllers/user_controller.hasAccessDepartment'
    )
    router
      .get(
        '/:userId/employees-assigned/:employeeId?',
        '#controllers/user_controller.getEmployeesAssigned'
      )
      .use(
        middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.getEmployeesAssigned)
      )
    router.get('/', '#controllers/user_controller.index')
    router.post('/', '#controllers/user_controller.store').use(middleware.permissionGate(USERS_PERMISSION_DECLARATIONS.store))
    router
      .post('/:userId/resend-access', '#controllers/user_controller.resendAccess')
      .use(middleware.permissionGate(USERS_PERMISSION_DECLARATIONS.update))
      .use(resendAccessUserRateLimit)
      .use(resendAccessBusinessUnitRateLimit)
    router.put('/:userId', '#controllers/user_controller.update').use(middleware.permissionGate(USERS_PERMISSION_DECLARATIONS.update))
    router.delete('/:userId', '#controllers/user_controller.delete').use(middleware.permissionGate(USERS_PERMISSION_DECLARATIONS.delete))
    router.get('/:userId', '#controllers/user_controller.show').use(middleware.permissionGate(USERS_PERMISSION_DECLARATIONS.show))
  })
  .prefix('/api/users')
  .use(middleware.auth())
  .use(middleware.businessScope())
