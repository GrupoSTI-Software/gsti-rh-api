import router from '@adonisjs/core/services/router'
import EmployeeAnnotationController from '#controllers/employee_annotation_controller'
import { middleware } from '../kernel.js'

const employeeAnnotationController = new EmployeeAnnotationController()

router
  .group(() => {
    router.get('/', employeeAnnotationController.index)
    router.post('/', employeeAnnotationController.store)
    router.get('/employee/:employeeId', employeeAnnotationController.getByEmployee)
    router.get('/:employeeAnnotationId', employeeAnnotationController.show)
    router.put('/:employeeAnnotationId', employeeAnnotationController.update)
    router.delete('/:employeeAnnotationId', employeeAnnotationController.delete)
  })
  .use(middleware.auth())
  .prefix('/api/employee-annotations')
