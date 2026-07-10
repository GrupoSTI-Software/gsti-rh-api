import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get('/', '#controllers/employee_device_controller.index')
    router.get(
      '/employee/:employeeId',
      '#controllers/employee_device_controller.getByEmployee'
    )
    router.put(
      '/:employeeDeviceId/status',
      '#controllers/employee_device_controller.updateStatus'
    )
    router.delete(
      '/:employeeDeviceId',
      '#controllers/employee_device_controller.delete'
    )
  })
  .prefix('/api/employee-devices')
  .use(middleware.auth())
  .use(middleware.businessScope())

