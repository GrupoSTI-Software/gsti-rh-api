import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'

router
  .group(() => {
    router
      .post(
        '/employee-supply-assignation-photos/:employeeSupplyId/assignation',
        '#controllers/employee_supplie_assignation_photos_controller.uploadAssignation'
      )
      .use(
        middleware.permissionGate(
          EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.uploadEmployeeSupplyAssignationPhoto
        )
      )
    router
      .post(
        '/employee-supply-assignation-photos/:employeeSupplyId/return',
        '#controllers/employee_supplie_assignation_photos_controller.uploadReturn'
      )
      .use(
        middleware.permissionGate(
          EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.uploadEmployeeSupplyReturnPhoto
        )
      )
    router.get(
      '/employee-supply-assignation-photos/:employeeSupplyId/assignation',
      '#controllers/employee_supplie_assignation_photos_controller.getAssignation'
    )
    router.get(
      '/employee-supply-assignation-photos/:employeeSupplyId/return',
      '#controllers/employee_supplie_assignation_photos_controller.getReturn'
    )
    router
      .delete(
        '/employee-supply-assignation-photos/:photoId',
        '#controllers/employee_supplie_assignation_photos_controller.delete'
      )
      .use(
        middleware.permissionGate(
          EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeSupplyAssignationPhoto
        )
      )
  })
  .prefix('/api')
  .use(middleware.auth())
  .use(middleware.businessScope())

