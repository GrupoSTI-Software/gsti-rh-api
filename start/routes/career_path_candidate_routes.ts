import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { EMPLOYEES_READ_PERMISSION_DECLARATIONS } from '#constants/employees_read_permission_declarations'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'

router
  .group(() => {
    router
      .get('/', '#controllers/career_path_candidate_controller.index')
      .use(
        middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.indexCareerPathCandidates)
      )
    router
      .post('/', '#controllers/career_path_candidate_controller.store')
      .use(
        middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createCareerPathCandidate)
      )
    router
      .get('/:careerPathCandidateId', '#controllers/career_path_candidate_controller.show')
      .use(
        middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.showCareerPathCandidate)
      )
    router
      .put('/:careerPathCandidateId', '#controllers/career_path_candidate_controller.updateStatus')
      .use(
        middleware.permissionGate(
          EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateCareerPathCandidateStatus
        )
      )
    router
      .delete('/:careerPathCandidateId', '#controllers/career_path_candidate_controller.delete')
      .use(
        middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteCareerPathCandidate)
      )
    router
      .get('/employee/:employeeId', '#controllers/career_path_candidate_controller.getByEmployeeId')
      .use(
        middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.getCareerPathByEmployee)
      )
  })
  .prefix('/api/career-path-candidates')
  .use(middleware.auth())
  .use(middleware.businessScope())
