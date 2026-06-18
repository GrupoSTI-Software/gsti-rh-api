import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get('/overview', '#modules/attendance-stats/attendance-stats.controller.overview')
    router.get('/by-department', '#modules/attendance-stats/attendance-stats.controller.byDepartment')
    router.get('/by-employee', '#modules/attendance-stats/attendance-stats.controller.byEmployee')
    router.get('/coverage', '#modules/attendance-stats/attendance-stats.controller.coverage')
  })
  .prefix('/api/v1/attendance-stats')
  .use(middleware.auth())
  .use(middleware.businessScope())
