import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.post('/', '#controllers/employee_emergency_contact_controller.store')
    router.put(
      '/:employeeEmergencyContactId',
      '#controllers/employee_emergency_contact_controller.update'
    )
    router.delete(
      '/:employeeEmergencyContactId',
      '#controllers/employee_emergency_contact_controller.delete'
    )
    router.get(
      '/:employeeEmergencyContactId',
      '#controllers/employee_emergency_contact_controller.show'
    )
    router.get(
      '/employee/:employeeId',
      '#controllers/employee_emergency_contact_controller.getByEmployeeId'
    )
  })
  .prefix('/api/employee-emergency-contacts')
  .use(middleware.auth())
