import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get('/', '#controllers/employee_assist_calendar_controller.index')
  })
  .prefix('/api/v1/employee-assist-calendars')
  .use(middleware.auth())
  .use(middleware.businessScope())
