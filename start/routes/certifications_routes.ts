import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'

router
  .group(() => {
    router.get('/certification-categories', '#controllers/certifications_controller.indexCategories')
    router.get('/certifications', '#controllers/certifications_controller.index')
    router
      .post('/certifications', '#controllers/certifications_controller.store')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createCertification))
    router
      .put('/certifications/:id', '#controllers/certifications_controller.update')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateCertification))
    router
      .delete('/certifications/:id', '#controllers/certifications_controller.destroy')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteCertification))
  })
  .prefix('/api')
  .use(middleware.auth())
