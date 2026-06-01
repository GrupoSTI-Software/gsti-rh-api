import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get(
      '/:employeeId/biometric-face-id',
      '#controllers/employee_biometric_face_id_controller.getPhoto'
    )
    router.post(
      '/:employeeId/biometric-face-id',
      '#controllers/employee_biometric_face_id_controller.uploadPhoto'
    )
    router.put(
      '/:employeeId/biometric-face-id',
      '#controllers/employee_biometric_face_id_controller.replacePhoto'
    )
    router.delete(
      '/:employeeId/biometric-face-id',
      '#controllers/employee_biometric_face_id_controller.deletePhoto'
    )
    router.get(
      '/:employeeId/biometric-face-id-with-token/:token',
      '#controllers/employee_biometric_face_id_controller.getPhotoToken'
    )
    router.get(
      '/:employeeId/biometric-face-id-photo',
      '#controllers/employee_biometric_photos_controller.streamPhoto'
    )
  })
  .prefix('/api/employees')
  .use(middleware.auth())

