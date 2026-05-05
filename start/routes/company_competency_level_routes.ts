import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get('/', '#controllers/company_competency_level_controller.index')
    router.post('/', '#controllers/company_competency_level_controller.store')
    router.get('/:companyCompetencyLevelId', '#controllers/company_competency_level_controller.show')
    router.put('/:companyCompetencyLevelId', '#controllers/company_competency_level_controller.update')
    router.delete('/:companyCompetencyLevelId', '#controllers/company_competency_level_controller.delete')
  })
  .prefix('/api/company-competency-levels')
  .use(middleware.auth())
