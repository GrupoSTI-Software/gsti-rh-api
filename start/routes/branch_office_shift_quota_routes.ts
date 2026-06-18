import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get(
      '/branch-offices/:branchOfficeId/shift-quotas',
      '#controllers/branch_office_shift_quotas_controller.index'
    )
    router.put(
      '/branch-offices/:branchOfficeId/shift-quotas',
      '#controllers/branch_office_shift_quotas_controller.replace'
    )
  })
  .prefix('/api')
  .use(middleware.auth())
  .use(middleware.businessScope())
