import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { COMPETENCIES_PERMISSION_DECLARATIONS } from '#constants/competencies_permission_declarations'

router
  .group(() => {
    router
      .post('/', '#controllers/competency_descriptor_controller.store')
      .use(middleware.permissionGate(COMPETENCIES_PERMISSION_DECLARATIONS.storeCompetencyDescriptor))
    router
      .get('/:competencyDescriptorId', '#controllers/competency_descriptor_controller.show')
      .use(middleware.permissionGate(COMPETENCIES_PERMISSION_DECLARATIONS.showCompetencyDescriptor))
    router
      .put('/:competencyDescriptorId', '#controllers/competency_descriptor_controller.update')
      .use(middleware.permissionGate(COMPETENCIES_PERMISSION_DECLARATIONS.updateCompetencyDescriptor))
    router
      .delete('/:competencyDescriptorId', '#controllers/competency_descriptor_controller.delete')
      .use(middleware.permissionGate(COMPETENCIES_PERMISSION_DECLARATIONS.deleteCompetencyDescriptor))
    router
      .get(
        '/by-competency/:competencyId',
        '#controllers/competency_descriptor_controller.getByCompetencyId'
      )
      .use(
        middleware.permissionGate(
          COMPETENCIES_PERMISSION_DECLARATIONS.indexCompetencyDescriptorsByCompetency
        )
      )
  })
  .prefix('/api/competency-descriptors')
  .use(middleware.auth())
