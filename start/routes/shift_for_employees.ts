import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { SHIFTS_PERMISSION_DECLARATIONS } from '#constants/shifts_permission_declarations'

router
  .group(() => {
    router
      .post('/shift-for-employees', '#controllers/shift_for_employees_controller.index')
      .use(middleware.permissionGate(SHIFTS_PERMISSION_DECLARATIONS.indexShiftsForEmployees))
  })
  .prefix('/api')
  .use(middleware.auth())
