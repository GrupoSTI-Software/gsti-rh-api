import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { EMPLOYEES_READ_PERMISSION_DECLARATIONS } from '#constants/employees_read_permission_declarations'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'

router
  .group(() => {
    router
      .get('/', '#controllers/work_disability_controller.index')
      .use(middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.indexWorkDisabilities))
    router
      .post('/', '#controllers/work_disability_controller.store')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createWorkDisability))
    router
      .delete('/:workDisabilityId', '#controllers/work_disability_controller.delete')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteWorkDisability))
    router
      .put('/:workDisabilityId', '#controllers/work_disability_controller.update')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateWorkDisability))
    router
      .get('/:workDisabilityId', '#controllers/work_disability_controller.show')
      .use(middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.showWorkDisability))
    router.get('/employee/:employeeId', '#controllers/work_disability_controller.getByEmployee')
  })
  .prefix('/api/work-disabilities')
  .use(middleware.auth())
  .use(middleware.businessScope())
