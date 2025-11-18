import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.post('/employee-supplies', '#controllers/employee_supplies_controller.store')
    router.get('/employee-supplies', '#controllers/employee_supplies_controller.index')
    router.get('/employee-supplies/:id', '#controllers/employee_supplies_controller.show')
    router.put('/employee-supplies/:id', '#controllers/employee_supplies_controller.update')
    router.delete('/employee-supplies/:id', '#controllers/employee_supplies_controller.destroy')
    router.post('/employee-supplies/:id/retire', '#controllers/employee_supplies_controller.retire')
    router.get('/employee-supplies/:id/with-relations', '#controllers/employee_supplies_controller.getWithRelations')
    router.get('/employee-supplies/by-employee/:employeeId', '#controllers/employee_supplies_controller.getByEmployee')
    router.get('/employee-supplies/active-by-employee/:employeeId', '#controllers/employee_supplies_controller.getActiveByEmployee')
  })
  .prefix('/api')
  .use(middleware.auth())
