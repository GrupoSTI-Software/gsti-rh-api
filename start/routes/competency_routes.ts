import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { COMPETENCIES_PERMISSION_DECLARATIONS } from '#constants/competencies_permission_declarations'

router
  .group(() => {
    // Sin gate: catálogo del perfil del puesto en el Organigrama.
    router.get('/', '#controllers/competency_controller.index')
    router
      .post('/', '#controllers/competency_controller.store')
      .use(middleware.permissionGate(COMPETENCIES_PERMISSION_DECLARATIONS.storeCompetency))
    router
      .get('/:competencyId', '#controllers/competency_controller.show')
      .use(middleware.permissionGate(COMPETENCIES_PERMISSION_DECLARATIONS.showCompetency))
    router
      .put('/:competencyId', '#controllers/competency_controller.update')
      .use(middleware.permissionGate(COMPETENCIES_PERMISSION_DECLARATIONS.updateCompetency))
    router
      .delete('/:competencyId', '#controllers/competency_controller.delete')
      .use(middleware.permissionGate(COMPETENCIES_PERMISSION_DECLARATIONS.deleteCompetency))
  })
  .prefix('/api/competencies')
  .use(middleware.auth())
