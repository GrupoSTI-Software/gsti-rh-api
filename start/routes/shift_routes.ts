/* eslint-disable prettier/prettier */
import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.post('/shift', '#controllers/shifts_controller.store')
    router.get('/shift', '#controllers/shifts_controller.index')
    router.get('/shift-department-position', '#controllers/shifts_controller.searchPositionDepartment')
    router.get('/shift/:id', '#controllers/shifts_controller.show')
    router.put('/shift/:id', '#controllers/shifts_controller.update')
    router.delete('/shift/:id', '#controllers/shifts_controller.destroy')
  })
  .prefix('/api')
  .use(middleware.auth())
  .use(middleware.businessScope())
