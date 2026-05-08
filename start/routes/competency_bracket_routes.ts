import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.post('/', '#controllers/competency_bracket_controller.store')
    router.get('/:competencyBracketId', '#controllers/competency_bracket_controller.show')
    router.put('/:competencyBracketId', '#controllers/competency_bracket_controller.update')
    router.delete('/:competencyBracketId', '#controllers/competency_bracket_controller.delete')
    router.get('/by-descriptor/:competencyDescriptorId', '#controllers/competency_bracket_controller.getByCompetencyDescriptorId')
  })
  .prefix('/api/competency-brackets')
  .use(middleware.auth())


