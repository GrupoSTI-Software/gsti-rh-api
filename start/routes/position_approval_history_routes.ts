import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { ORGANIZATION_CHART_PERMISSION_DECLARATIONS } from '#constants/organization_chart_permission_declarations'

router
  .group(() => {
    router
      .post('/', '#controllers/position_approval_history_controller.store')
      .use(middleware.permissionGate(ORGANIZATION_CHART_PERMISSION_DECLARATIONS.storePositionApprovalHistory))
    router
      .get('/last/:positionId', '#controllers/position_approval_history_controller.getLast')
      .use(
        middleware.permissionGate(ORGANIZATION_CHART_PERMISSION_DECLARATIONS.showLastPositionApprovalHistory)
      )
  })
  .prefix('/api/position-approval-histories')
  .use(middleware.auth())
  .use(middleware.businessScope())
