import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { BRANCH_OFFICE_SHIFT_QUOTAS_PERMISSION_DECLARATIONS } from '#constants/branch_office_shift_quotas_permission_declarations'

router
  .group(() => {
    /**
     * La lectura la consumen dos pantallas de módulos distintos —REPSE y el
     * préstamo temporal del colaborador—, y un gate de ruta declara un solo
     * módulo: la decide el controller aceptando cualquiera de los dos. El
     * porqué está en `branch_office_shift_quotas_permission_declarations.ts`.
     */
    router.get(
      '/branch-offices/:branchOfficeId/shift-quotas',
      '#controllers/branch_office_shift_quotas_controller.index'
    )
    router
      .put(
        '/branch-offices/:branchOfficeId/shift-quotas',
        '#controllers/branch_office_shift_quotas_controller.replace'
      )
      .use(
        middleware.permissionGate(
          BRANCH_OFFICE_SHIFT_QUOTAS_PERMISSION_DECLARATIONS.replaceBranchOfficeShiftQuotas
        )
      )
  })
  .prefix('/api')
  .use(middleware.auth())
  .use(middleware.businessScope())
