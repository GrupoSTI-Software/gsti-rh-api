import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get('/', '#controllers/career_path_candidate_controller.index')
    router.post('/', '#controllers/career_path_candidate_controller.store')
    router.get('/:careerPathCandidateId', '#controllers/career_path_candidate_controller.show')
    router.put('/:careerPathCandidateId', '#controllers/career_path_candidate_controller.updateStatus')
    router.delete('/:careerPathCandidateId', '#controllers/career_path_candidate_controller.delete')
    router.get('/employee/:employeeId', '#controllers/career_path_candidate_controller.getByEmployeeId')
  })
  .prefix('/api/career-path-candidates')
  .use(middleware.auth())


