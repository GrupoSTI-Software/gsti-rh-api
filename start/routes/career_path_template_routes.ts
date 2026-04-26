import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get('/', '#controllers/career_path_template_controller.index')
    router.post('/', '#controllers/career_path_template_controller.store')
    router.get('/:careerPathTemplateId', '#controllers/career_path_template_controller.show')
    router.put('/:careerPathTemplateId', '#controllers/career_path_template_controller.update')
    router.delete('/:careerPathTemplateId', '#controllers/career_path_template_controller.delete')
  })
  .prefix('/api/career-path-templates')
  .use(middleware.auth())


