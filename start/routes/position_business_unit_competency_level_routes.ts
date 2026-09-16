import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { ORGANIZATION_CHART_PERMISSION_DECLARATIONS } from '#constants/organization_chart_permission_declarations'

router
  .group(() => {
    router
      .post('/', '#controllers/position_business_unit_competency_level_controller.store')
      .use(middleware.permissionGate(ORGANIZATION_CHART_PERMISSION_DECLARATIONS.storePositionCompetencyLevel))
    router
      .put(
        '/:positionBusinessUnitCompetencyLevelId',
        '#controllers/position_business_unit_competency_level_controller.update'
      )
      .use(middleware.permissionGate(ORGANIZATION_CHART_PERMISSION_DECLARATIONS.updatePositionCompetencyLevel))
    router
      .delete(
        '/:positionBusinessUnitCompetencyLevelId',
        '#controllers/position_business_unit_competency_level_controller.delete'
      )
      .use(middleware.permissionGate(ORGANIZATION_CHART_PERMISSION_DECLARATIONS.deletePositionCompetencyLevel))
    // Sin gate: Evaluaciones y la Matriz de habilidades leen los niveles de
    // competencia del puesto. Pedir organization-chart:read los rompería.
    router.get(
      '/by-position/:positionId',
      '#controllers/position_business_unit_competency_level_controller.getByPosition'
    )
  })
  .prefix('/api/position-business-unit-competency-levels')
  .use(middleware.auth())
  .use(middleware.businessScope())
