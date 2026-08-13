import router from '@adonisjs/core/services/router'
import { EMPLOYEES_READ_PERMISSION_DECLARATIONS } from '#constants/employees_read_permission_declarations'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get('/employee-generate-excel', '#controllers/employee_controller.getExcel')
    router.get('/shift-assignment-template', '#controllers/employee_controller.getShiftAssignmentTemplate')
    router.get('/attendance-report', '#controllers/employee_controller.getAttendanceReport')
    router.post('/attendance-report', '#controllers/employee_controller.getAttendanceReport')
    router.post('/import-shift-assignments', '#controllers/employee_controller.importShiftAssignments')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.importShiftAssignmentsExcel))
    router.get('/template-excel', '#controllers/employee_controller.getTemplateExcel')
    router
      .get('/get-biometrics', '#controllers/employee_controller.getBiometrics')
      .use(middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.getBiometricsList))
    router
      .get('/get-days-work-disability-all', '#controllers/employee_controller.getDaysWorkDisabilityAll')
      .use(middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.getDaysWorkDisabilityAll))
    router.get('/get-birthday', '#controllers/employee_controller.getBirthday')
    router.get('/get-anniversary', '#controllers/employee_controller.getAnniversary')
    router
      .get('/get-vacations', '#controllers/employee_controller.getVacations')
      .use(middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.getVacations))
    router
      .get('/get-all-vacations-by-period', '#controllers/employee_controller.getAllVacationsByPeriod')
      .use(
        middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.getAllVacationsByPeriod)
      )
    router.get('/get-work-schedules', '#controllers/employee_controller.getWorkSchedules')
    router.get('/termination-catalog', '#controllers/employee_controller.getTerminationCatalog')
    router.get('/without-user', '#controllers/employee_controller.indexWithOutUser')
    router.get('/', '#controllers/employee_controller.index')
    router.get('/to-assigned', '#controllers/employee_controller.indexToAssigned')
    router
      .post('/', '#controllers/employee_controller.store')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployee))
    router
      .put('/:employeeId', '#controllers/employee_controller.update')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployee))
    router
      .delete('/:employeeId', '#controllers/employee_controller.delete')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.terminateEmployee))
    router.get('/get-by-id/:employeeId', '#controllers/employee_controller.getById')
    router.get('/:employeeId', '#controllers/employee_controller.show').where('employeeId', router.matchers.number())
    router
      .put('/:employeeId/photo', '#controllers/employee_controller.uploadPhoto')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.uploadEmployeePhoto))
    router
      .delete('/:employeeId/photo', '#controllers/employee_controller.deletePhoto')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeePhoto))
    router
      .put('/:employeeId/reactivate', '#controllers/employee_controller.reactivate')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.reactivateEmployee))
    router
      .get('/:employeeId/proceeding-files', '#controllers/employee_controller.getProceedingFiles')
      .use(middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.getEmployeeProceedingFiles))

    router
      .post('/:employeeId/branch-office', '#controllers/employee_branch_office_controller.assign')
      .use(
        middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.assignEmployeeBranchOffice)
      )
    router
      .delete('/:employeeId/branch-office', '#controllers/employee_branch_office_controller.unassign')
      .use(
        middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.unassignEmployeeBranchOffice)
      )
    router
      .get(
        '/:employeeId/branch-offices/history',
        '#controllers/employee_branch_office_controller.history'
      )
      .use(middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.getBranchOfficeHistory))

    router
      .post(
        '/:employeeId/temporary-assignments',
        '#controllers/employee_temporary_assignment_controller.store'
      )
      .use(
        middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createTemporaryAssignment)
      )
    router
      .get(
        '/:employeeId/temporary-assignments',
        '#controllers/employee_temporary_assignment_controller.index'
      )
      .use(middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.indexTemporaryAssignments))
    router
      .put(
        '/:employeeId/temporary-assignments/:id',
        '#controllers/employee_temporary_assignment_controller.update'
      )
      .use(
        middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateTemporaryAssignment)
      )
    router
      .post(
        '/:employeeId/temporary-assignments/:id/cancel',
        '#controllers/employee_temporary_assignment_controller.cancel'
      )
      .use(
        middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.cancelTemporaryAssignment)
      )
    router
      .delete(
        '/:employeeId/temporary-assignments/:id',
        '#controllers/employee_temporary_assignment_controller.destroy'
      )
      .use(
        middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteTemporaryAssignment)
      )
    router
      .get(
        '/:employeeId/temporary-assignments/active',
        '#controllers/employee_temporary_assignment_controller.showActive'
      )
      .use(middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.showActiveTemporaryAssignment))

    router
      .get('/:employeeId/salary-history', '#controllers/employee_controller.salaryHistory')
      .use(middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.getSalaryHistory))
    router
      .get('/:employeeId/contracts', '#controllers/employee_controller.getContracts')
      .use(middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.getEmployeeContracts))
    router
      .get('/:employeeId/banks', '#controllers/employee_controller.getBanks')
      .use(middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.getEmployeeBanks))
    router
      .get('/:employeeId/zones', '#controllers/employee_controller.getZones')
      .use(middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.getEmployeeZones))
    router
      .get('/:employeeId/get-days-work-disability', '#controllers/employee_controller.getDaysWorkDisability')
      .use(middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.getDaysWorkDisability))
    router
      .get('/:employeeId/user-responsible', '#controllers/employee_controller.getUserResponsible')
      .use(middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.getUserResponsible))
    router
      .get(
        '/:employeeId/user-responsible/:userId?',
        '#controllers/employee_controller.getUserResponsible'
      )
      .use(middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.getUserResponsible))
    router
      .get('/:employeeId/get-vacations-used', '#controllers/employee_controller.getVacationsUsed')
      .use(middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.getVacationsUsed))
    router
      .get(
        '/:employeeId/get-vacations-corresponding',
        '#controllers/employee_controller.getVacationsCorresponding'
      )
      .use(middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.getVacationsCorresponding))
    router
      .get('/:employeeId/get-years-worked', '#controllers/employee_controller.getYearsWorked')
      .use(middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.getYearsWorked))
    router
      .get(
        '/:employeeId/get-vacations-by-period',
        '#controllers/employee_controller.getVacationsByPeriod'
      )
      .use(middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.getVacationsByPeriod))
    router.get(
      '/:employeeId/export-excel',
      '#controllers/employee_controller.exportShiftExceptionsToExcel'
    )
    router.post('/import-excel', '#controllers/employee_controller.importFromExcel')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.importEmployeesExcel))
    router.post('/inverse-synchronization/:employeeId', '#controllers/employee_controller.inverseSync')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.inverseSyncEmployee))
    router
      .post(
        '/:employeeId/vacation-deductions',
        '#controllers/employee_controller.applyVacationDeduction'
      )
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.applyVacationDeduction))
    router
      .get('/:employeeId/vacation-deductions', '#controllers/employee_controller.getVacationDeductions')
      .use(middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.getVacationDeductions))
    router
      .delete(
        '/:employeeId/vacation-deductions/:vacationDeductionId',
        '#controllers/employee_controller.deleteVacationDeduction'
      )
      .where('employeeId', router.matchers.number())
      .where('vacationDeductionId', router.matchers.number())
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteVacationDeduction))

  })
  .prefix('/api/employees')
  .use(middleware.auth())
  .use(middleware.businessScope())

// Ruta pública para servir imágenes de forma segura (sin autenticación)
router.get('/api/proxy-image', '#controllers/employee_controller.proxyImage')

// router.get('/odoo/employees', '#controllers/employee_controller.getOdooEmployees')
// router.get('/odoo/employees/groups', '#controllers/employee_controller.getOdooGroups')
// router.get('/odoo/employees/create', '#controllers/employee_controller.createNewOdooEmployee')
