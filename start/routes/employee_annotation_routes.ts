import router from '@adonisjs/core/services/router'
import EmployeeAnnotationController from '#controllers/employee_annotation_controller'
import { middleware } from '../kernel.js'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'
import { EMPLOYEES_READ_PERMISSION_DECLARATIONS } from '#constants/employees_read_permission_declarations'

const employeeAnnotationController = new EmployeeAnnotationController()

router
  .group(() => {
    router
      .get('/', employeeAnnotationController.index)
      .use(
        middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.indexEmployeeAnnotations)
      )
    router
      .post('/', employeeAnnotationController.store)
      .use(
        middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeAnnotation)
      )
    router
      .get('/employee/:employeeId', employeeAnnotationController.getByEmployee)
      .use(
        middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.getAnnotationsByEmployee)
      )
    router
      .get('/:employeeAnnotationId', employeeAnnotationController.show)
      .use(
        middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.showEmployeeAnnotation)
      )
    router
      .put('/:employeeAnnotationId', employeeAnnotationController.update)
      .use(
        middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeAnnotation)
      )
    router
      .delete('/:employeeAnnotationId', employeeAnnotationController.delete)
      .use(
        middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeAnnotation)
      )
  })
  .use(middleware.auth())
  .use(middleware.businessScope())
  .prefix('/api/employee-annotations')
