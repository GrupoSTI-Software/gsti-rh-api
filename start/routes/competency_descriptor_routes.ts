import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.post('/', '#controllers/competency_descriptor_controller.store')
    router.get('/:competencyDescriptorId', '#controllers/competency_descriptor_controller.show')
    router.put('/:competencyDescriptorId', '#controllers/competency_descriptor_controller.update')
    router.delete('/:competencyDescriptorId', '#controllers/competency_descriptor_controller.delete')
    router.get('/by-competency/:competencyId', '#controllers/competency_descriptor_controller.getByCompetencyId')
  })
  .prefix('/api/competency-descriptors')
  .use(middleware.auth())


