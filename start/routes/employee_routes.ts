import router from '@adonisjs/core/services/router'
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
    router.get('/get-biometrics', '#controllers/employee_controller.getBiometrics')
    router.get('/get-days-work-disability-all', '#controllers/employee_controller.getDaysWorkDisabilityAll')
    router.get('/get-birthday', '#controllers/employee_controller.getBirthday')
    router.get('/get-anniversary', '#controllers/employee_controller.getAnniversary')
    router.get('/get-vacations', '#controllers/employee_controller.getVacations')
    router.get('/get-all-vacations-by-period', '#controllers/employee_controller.getAllVacationsByPeriod')
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
    router.get(
      '/:employeeId/proceeding-files',
      '#controllers/employee_controller.getProceedingFiles'
    )

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
    router.get(
      '/:employeeId/branch-offices/history',
      '#controllers/employee_branch_office_controller.history'
    )

    router
      .post(
        '/:employeeId/temporary-assignments',
        '#controllers/employee_temporary_assignment_controller.store'
      )
      .use(
        middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createTemporaryAssignment)
      )
    router.get(
      '/:employeeId/temporary-assignments',
      '#controllers/employee_temporary_assignment_controller.index'
    )
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
    router.get(
      '/:employeeId/temporary-assignments/active',
      '#controllers/employee_temporary_assignment_controller.showActive'
    )

    router.get('/:employeeId/salary-history', '#controllers/employee_controller.salaryHistory')
    router.get('/:employeeId/contracts', '#controllers/employee_controller.getContracts')
    router.get('/:employeeId/banks', '#controllers/employee_controller.getBanks')
    router.get('/:employeeId/zones', '#controllers/employee_controller.getZones')
    router.get('/:employeeId/get-days-work-disability', '#controllers/employee_controller.getDaysWorkDisability')
    router.get('/:employeeId/user-responsible', '#controllers/employee_controller.getUserResponsible')
    router.get('/:employeeId/user-responsible/:userId?', '#controllers/employee_controller.getUserResponsible')
    router.get(
      '/:employeeId/get-vacations-used',
      '#controllers/employee_controller.getVacationsUsed'
    )
    router.get(
      '/:employeeId/get-vacations-corresponding',
      '#controllers/employee_controller.getVacationsCorresponding'
    )
    router.get('/:employeeId/get-years-worked', '#controllers/employee_controller.getYearsWorked')
    router.get(
      '/:employeeId/get-vacations-by-period',
      '#controllers/employee_controller.getVacationsByPeriod'
    )
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
    router.get(
      '/:employeeId/vacation-deductions',
      '#controllers/employee_controller.getVacationDeductions'
    )
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
