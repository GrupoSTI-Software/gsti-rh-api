import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { CAREER_PATH_TEMPLATES_PERMISSION_DECLARATIONS } from '#constants/career_path_templates_permission_declarations'

router
  .group(() => {
    // Sin gate: la pestaña Ruta de carrera del expediente la lee para proponer ruta.
    router.get('/', '#controllers/career_path_template_controller.index')
    router
      .post('/', '#controllers/career_path_template_controller.store')
      .use(
        middleware.permissionGate(
          CAREER_PATH_TEMPLATES_PERMISSION_DECLARATIONS.storeCareerPathTemplate
        )
      )
    router
      .get('/:careerPathTemplateId', '#controllers/career_path_template_controller.show')
      .use(
        middleware.permissionGate(CAREER_PATH_TEMPLATES_PERMISSION_DECLARATIONS.showCareerPathTemplate)
      )
    router
      .put('/:careerPathTemplateId', '#controllers/career_path_template_controller.update')
      .use(
        middleware.permissionGate(
          CAREER_PATH_TEMPLATES_PERMISSION_DECLARATIONS.updateCareerPathTemplate
        )
      )
    router
      .delete('/:careerPathTemplateId', '#controllers/career_path_template_controller.delete')
      .use(
        middleware.permissionGate(
          CAREER_PATH_TEMPLATES_PERMISSION_DECLARATIONS.deleteCareerPathTemplate
        )
      )
  })
  .prefix('/api/career-path-templates')
  .use(middleware.auth())
  .use(middleware.businessScope())
