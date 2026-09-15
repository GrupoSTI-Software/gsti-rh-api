import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { EMPLOYEES_READ_PERMISSION_DECLARATIONS } from '#constants/employees_read_permission_declarations'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'
import { HR_CAREER_PATH_PERMISSION_DECLARATIONS } from '#constants/hr_career_path_permission_declarations'

/**
 * Listar, ver el detalle y cambiar estatus son de la Bandeja de rutas de
 * carrera (`hr-career-path`). Proponer, borrar y leer por empleado son de la
 * pestaña Ruta de carrera del expediente (`employees`).
 */
router
  .group(() => {
    router
      .get('/', '#controllers/career_path_candidate_controller.index')
      .use(
        middleware.permissionGate(HR_CAREER_PATH_PERMISSION_DECLARATIONS.indexCareerPathCandidates)
      )
    router
      .post('/', '#controllers/career_path_candidate_controller.store')
      .use(
        middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createCareerPathCandidate)
      )
    router
      .get('/:careerPathCandidateId', '#controllers/career_path_candidate_controller.show')
      .use(
        middleware.permissionGate(HR_CAREER_PATH_PERMISSION_DECLARATIONS.showCareerPathCandidate)
      )
    router
      .put('/:careerPathCandidateId', '#controllers/career_path_candidate_controller.updateStatus')
      .use(
        middleware.permissionGate(
          HR_CAREER_PATH_PERMISSION_DECLARATIONS.updateCareerPathCandidateStatus
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
