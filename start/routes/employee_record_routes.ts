import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.post('/', '#controllers/employee_record_controller.store')
    router.put('/:employeeRecordId', '#controllers/employee_record_controller.update')
    router.delete('/:employeeRecordId', '#controllers/employee_record_controller.delete')
    router.get('/:employeeRecordId', '#controllers/employee_record_controller.show')
  })
  .prefix('/api/employee-records')
  .use(middleware.auth())
  .use(middleware.businessScope())
