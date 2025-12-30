import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.post(
      '/employee-supply-assignation-photos/:employeeSupplyId/assignation',
      '#controllers/employee_supplie_assignation_photos_controller.uploadAssignation'
    )
    router.post(
      '/employee-supply-assignation-photos/:employeeSupplyId/return',
      '#controllers/employee_supplie_assignation_photos_controller.uploadReturn'
    )
    router.get(
      '/employee-supply-assignation-photos/:employeeSupplyId/assignation',
      '#controllers/employee_supplie_assignation_photos_controller.getAssignation'
    )
    router.get(
      '/employee-supply-assignation-photos/:employeeSupplyId/return',
      '#controllers/employee_supplie_assignation_photos_controller.getReturn'
    )
    router.delete(
      '/employee-supply-assignation-photos/:photoId',
      '#controllers/employee_supplie_assignation_photos_controller.delete'
    )
  })
  .prefix('/api')
  .use(middleware.auth())

