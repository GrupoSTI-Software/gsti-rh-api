import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    // Historial de uploads de una certificación específica
    router.get(
      '/:employeeId/certifications/:certificationId/uploads',
      '#controllers/employee_certification_upload_controller.index'
    )

    // Subir nuevo comprobante
    router.post(
      '/:employeeId/certifications/:certificationId/uploads',
      '#controllers/employee_certification_upload_controller.store'
    )

    // URL pre-firmada de descarga (5 min)
    router.get(
      '/:employeeId/certifications/:certificationId/uploads/:employeeCertificationId/download-url',
      '#controllers/employee_certification_upload_controller.downloadUrl'
    )

    // Borrar cumplimiento (solo el más reciente)
    router.delete(
      '/:employeeId/certifications/:certificationId/uploads/:employeeCertificationId',
      '#controllers/employee_certification_upload_controller.destroy'
    )
  })
  .prefix('/api/employees')
  .use(middleware.auth())
  .use(middleware.businessScope())
