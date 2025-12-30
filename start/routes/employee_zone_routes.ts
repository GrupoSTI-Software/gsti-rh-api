import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.post('/', '#controllers/employee_zone_controller.store')
    router.put('/:employeeZoneId', '#controllers/employee_zone_controller.update')
    router.delete('/:employeeZoneId', '#controllers/employee_zone_controller.delete')
    router.get('/:employeeZoneId', '#controllers/employee_zone_controller.show')
  })
  .prefix('/api/employee-zones')
  .use(middleware.auth())
