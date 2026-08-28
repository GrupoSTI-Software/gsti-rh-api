import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { EMPLOYEES_READ_PERMISSION_DECLARATIONS } from '#constants/employees_read_permission_declarations'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'
import { EMPLOYEES_DOWNLOAD_PERMISSION_DECLARATIONS } from '#constants/employees_download_permission_declarations'

router
  .group(() => {
    router
      .post('/', '#controllers/work_disability_period_controller.store')
      .use(
        middleware.permissionGate(
          EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createWorkDisabilityPeriod
        )
      )
    /* download debe declararse ANTES del GET /:workDisabilityPeriodId; el
       matcher .where(...number()) evita que un segmento literal futuro se
       confunda con el ID (USRH1787434050259). */
    router
      .get(
        '/:workDisabilityPeriodId/download',
        '#controllers/work_disability_period_controller.download'
      )
      .where('workDisabilityPeriodId', router.matchers.number())
      .use(
        middleware.permissionGate(
          EMPLOYEES_DOWNLOAD_PERMISSION_DECLARATIONS.downloadWorkDisabilityFile
        )
      )
    router
      .get('/:workDisabilityPeriodId', '#controllers/work_disability_period_controller.show')
      .use(
        middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.showWorkDisabilityPeriod)
      )
    router
      .put('/:workDisabilityPeriodId', '#controllers/work_disability_period_controller.update')
      .use(
        middleware.permissionGate(
          EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateWorkDisabilityPeriod
        )
      )
    router
      .delete('/:workDisabilityPeriodId', '#controllers/work_disability_period_controller.delete')
      .use(
        middleware.permissionGate(
          EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteWorkDisabilityPeriod
        )
      )
  })
  .prefix('/api/work-disability-periods')
  .use(middleware.auth())
  .use(middleware.businessScope())
