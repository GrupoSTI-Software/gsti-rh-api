import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get('/:employeeId/biometrics', '#controllers/employee_biometric_controller.show')
    router.get('/:employeeId/biometrics/fingers', '#controllers/employee_biometric_controller.getFingers')
    router.get('/:employeeId/biometrics/face', '#controllers/employee_biometric_controller.getFaceStatus')
    router.post('/:employeeId/biometrics', '#controllers/employee_biometric_controller.store')
    router.put('/:employeeId/biometrics', '#controllers/employee_biometric_controller.update')
    router.put('/:employeeId/biometrics/fingers', '#controllers/employee_biometric_controller.updateFingers')
    router.put('/:employeeId/biometrics/face', '#controllers/employee_biometric_controller.updateFaceStatus')
  })
  .prefix('/api/employees')
  .use(middleware.auth())
