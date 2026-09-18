import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { ORGANIZATION_CHART_PERMISSION_DECLARATIONS } from '#constants/organization_chart_permission_declarations'

router
  .group(() => {
    router
      .get(
        '/:positionId/certification-requirements',
        '#controllers/position_certification_requirement_controller.index'
      )
      .use(
        middleware.permissionGate(
          ORGANIZATION_CHART_PERMISSION_DECLARATIONS.indexPositionCertificationRequirements
        )
      )
    router
      .post(
        '/:positionId/certification-requirements',
        '#controllers/position_certification_requirement_controller.store'
      )
      .use(
        middleware.permissionGate(
          ORGANIZATION_CHART_PERMISSION_DECLARATIONS.storePositionCertificationRequirements
        )
      )
    router
      .delete(
        '/:positionId/certification-requirements/:certificationId',
        '#controllers/position_certification_requirement_controller.destroy'
      )
      .use(
        middleware.permissionGate(
          ORGANIZATION_CHART_PERMISSION_DECLARATIONS.destroyPositionCertificationRequirement
        )
      )
  })
  .prefix('/api/positions')
  .use(middleware.auth())
  .use(middleware.businessScope())
