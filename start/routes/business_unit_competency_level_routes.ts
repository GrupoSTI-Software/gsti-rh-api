import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { COMPETENCIES_PERMISSION_DECLARATIONS } from '#constants/competencies_permission_declarations'

router
  .group(() => {
    // Sin gate: lo leen la Matriz de competencias y las evaluaciones del empleado.
    router.get('/', '#controllers/business_unit_competency_level_controller.index')
    router
      .post('/', '#controllers/business_unit_competency_level_controller.store')
      .use(
        middleware.permissionGate(COMPETENCIES_PERMISSION_DECLARATIONS.storeBusinessUnitCompetencyLevel)
      )
    router
      .get(
        '/:businessUnitCompetencyLevelId',
        '#controllers/business_unit_competency_level_controller.show'
      )
      .use(
        middleware.permissionGate(COMPETENCIES_PERMISSION_DECLARATIONS.showBusinessUnitCompetencyLevel)
      )
    router
      .put(
        '/:businessUnitCompetencyLevelId',
        '#controllers/business_unit_competency_level_controller.update'
      )
      .use(
        middleware.permissionGate(COMPETENCIES_PERMISSION_DECLARATIONS.updateBusinessUnitCompetencyLevel)
      )
    router
      .delete(
        '/:businessUnitCompetencyLevelId',
        '#controllers/business_unit_competency_level_controller.delete'
      )
      .use(
        middleware.permissionGate(COMPETENCIES_PERMISSION_DECLARATIONS.deleteBusinessUnitCompetencyLevel)
      )
  })
  .prefix('/api/business-unit-competency-levels')
  .use(middleware.auth())
  .use(middleware.businessScope())
