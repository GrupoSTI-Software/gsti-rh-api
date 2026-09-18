import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { COMPETENCIES_PERMISSION_DECLARATIONS } from '#constants/competencies_permission_declarations'

router
  .group(() => {
    router
      .post('/', '#controllers/competency_bracket_controller.store')
      .use(middleware.permissionGate(COMPETENCIES_PERMISSION_DECLARATIONS.storeCompetencyBracket))
    router
      .get('/:competencyBracketId', '#controllers/competency_bracket_controller.show')
      .use(middleware.permissionGate(COMPETENCIES_PERMISSION_DECLARATIONS.showCompetencyBracket))
    router
      .put('/:competencyBracketId', '#controllers/competency_bracket_controller.update')
      .use(middleware.permissionGate(COMPETENCIES_PERMISSION_DECLARATIONS.updateCompetencyBracket))
    router
      .delete('/:competencyBracketId', '#controllers/competency_bracket_controller.delete')
      .use(middleware.permissionGate(COMPETENCIES_PERMISSION_DECLARATIONS.deleteCompetencyBracket))
    // Sin gate: lo consume la evaluación de competencias del empleado.
    router.get(
      '/by-descriptor/:competencyDescriptorId',
      '#controllers/competency_bracket_controller.getByCompetencyDescriptorId'
    )
  })
  .prefix('/api/competency-brackets')
  .use(middleware.auth())
