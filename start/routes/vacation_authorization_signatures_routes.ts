import router from '@adonisjs/core/services/router'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router
      .post('/authorize', '#controllers/vacation_authorization_signatures_controller.authorize')
      .use(
        middleware.permissionGate(
          EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.authorizeVacationWithSignature
        )
      )
    router
      .post(
        '/sign-shift-exceptions',
        '#controllers/vacation_authorization_signatures_controller.signShiftExceptions'
      )
      .use(
        middleware.permissionGate(
          EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.signVacationShiftExceptions
        )
      )
    router.get('/pending', '#controllers/vacation_authorization_signatures_controller.getPendingVacationRequests')
    router.get('/authorized', '#controllers/vacation_authorization_signatures_controller.getAuthorizedVacationRequests')
    router.get('/shift-exceptions', '#controllers/vacation_authorization_signatures_controller.getVacationShiftExceptions')
  })
  .prefix('/api/vacation-authorizations')
  .use(middleware.auth())
