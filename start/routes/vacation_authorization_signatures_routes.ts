import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.post('/authorize', '#controllers/vacation_authorization_signatures_controller.authorize')
    router.post('/sign-shift-exceptions', '#controllers/vacation_authorization_signatures_controller.signShiftExceptions')
    router.get('/pending', '#controllers/vacation_authorization_signatures_controller.getPendingVacationRequests')
    router.get('/authorized', '#controllers/vacation_authorization_signatures_controller.getAuthorizedVacationRequests')
    router.get('/shift-exceptions', '#controllers/vacation_authorization_signatures_controller.getVacationShiftExceptions')
  })
  .prefix('/api/vacation-authorizations')
  .use(middleware.auth())


