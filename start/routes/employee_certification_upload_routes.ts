import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { EMPLOYEES_READ_PERMISSION_DECLARATIONS } from '#constants/employees_read_permission_declarations'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'

router
  .group(() => {
    router
      .get(
        '/:employeeId/certifications/:certificationId/uploads',
        '#controllers/employee_certification_upload_controller.index'
      )
      .use(
        middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.indexCertificationUploads)
      )
    router
      .post(
        '/:employeeId/certifications/:certificationId/uploads',
        '#controllers/employee_certification_upload_controller.store'
      )
      .use(
        middleware.permissionGate(
          EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeCertificationUpload
        )
      )
    router.get(
      '/:employeeId/certifications/:certificationId/uploads/:employeeCertificationId/download-url',
      '#controllers/employee_certification_upload_controller.downloadUrl'
    )
    router
      .delete(
        '/:employeeId/certifications/:certificationId/uploads/:employeeCertificationId',
        '#controllers/employee_certification_upload_controller.destroy'
      )
      .use(
        middleware.permissionGate(
          EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeCertificationUpload
        )
      )
  })
  .prefix('/api/employees')
  .use(middleware.auth())
  .use(middleware.businessScope())
