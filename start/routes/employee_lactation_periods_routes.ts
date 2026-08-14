import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'

router
  .group(() => {
    router.get(
      '/employee-lactation-periods',
      '#controllers/employee_lactation_periods_controller.index'
    )
    // prettier-ignore
    router
      .post(
        '/employee-lactation-periods',
        '#controllers/employee_lactation_periods_controller.store'
      )
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeLactationPeriod))
    // Reporte de cumplimiento (JSON + export PDF).
    // OJO: estas rutas deben declararse ANTES de `/:id` para que
    // `compliance-report` no se confunda con un identificador numérico.
    router.get(
      '/employee-lactation-periods/compliance-report',
      '#controllers/employee_lactation_periods_controller.complianceReport'
    )
    router.get(
      '/employee-lactation-periods/compliance-report/export',
      '#controllers/employee_lactation_periods_controller.complianceReportExport'
    )
    // Disparo manual / reproceso del aviso de vencimiento. La misma
    // consideración de orden aplica: va ANTES de `/:id` para que el
    // segmento literal `notifications` no colisione con un identificador
    // numérico.
    // prettier-ignore
    router
      .post(
        '/employee-lactation-periods/notifications/run-expiring-check',
        '#controllers/employee_lactation_periods_controller.runExpiringCheck'
      )
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.runLactationExpiringCheck))
    // Listado GLOBAL de conflictos a nivel empresa (vista de RH).
    // OJO: va ANTES de `/:id` para que `conflicts` no se interprete
    // como identificador numérico de un periodo.
    router.get(
      '/employee-lactation-periods/conflicts',
      '#controllers/employee_lactation_periods_controller.listAllConflicts'
    )
    // prettier-ignore
    router
      .put(
        '/employee-lactation-periods/:id',
        '#controllers/employee_lactation_periods_controller.update'
      )
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeLactationPeriod))
    // prettier-ignore
    router
      .delete(
        '/employee-lactation-periods/:id',
        '#controllers/employee_lactation_periods_controller.destroy'
      )
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeLactationPeriod))
    // prettier-ignore
    router
      .post(
        '/employee-lactation-periods/:id/regenerate-shift-exceptions',
        '#controllers/employee_lactation_periods_controller.regenerateShiftExceptions'
      )
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.regenerateLactationShiftExceptions))

    // Gestión de conflictos del periodo (revocar / reasignar día de lactancia
    // que choca con vacación, incapacidad, maternidad, permiso o festivo).
    // El orden es relevante: la ruta literal `/conflicts` vive bajo `/:id/`
    // y no compite con `/:id/regenerate-shift-exceptions`. Las rutas de
    // gestión por `shiftExceptionId` quedan declaradas después de la lista
    // por consistencia visual, no por requisito de routing.
    router.get(
      '/employee-lactation-periods/:id/conflicts',
      '#controllers/employee_lactation_periods_controller.listConflicts'
    )
    // Reasignación BULK del periodo. OJO: va ANTES de
    // `/:id/conflicts/:shiftExceptionId` para que el segmento literal
    // `reassign-bulk` no se interprete como un `shiftExceptionId`.
    // prettier-ignore
    router
      .post(
        '/employee-lactation-periods/:id/conflicts/reassign-bulk',
        '#controllers/employee_lactation_periods_controller.reassignConflictsBulk'
      )
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.reassignLactationConflictsBulk))
    // prettier-ignore
    router
      .delete(
        '/employee-lactation-periods/:id/conflicts/:shiftExceptionId',
        '#controllers/employee_lactation_periods_controller.revokeConflict'
      )
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.revokeLactationConflict))
    // prettier-ignore
    router
      .post(
        '/employee-lactation-periods/:id/conflicts/:shiftExceptionId/reassign',
        '#controllers/employee_lactation_periods_controller.reassignConflict'
      )
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.reassignLactationConflict))

    // Evidencias documentales del periodo (PDFs)
    router.get(
      '/employee-lactation-periods/:periodId/evidences',
      '#controllers/employee_lactation_period_evidences_controller.index'
    )
    // prettier-ignore
    router
      .post(
        '/employee-lactation-periods/:periodId/evidences',
        '#controllers/employee_lactation_period_evidences_controller.store'
      )
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createLactationEvidence))
    router.get(
      '/employee-lactation-periods/:periodId/evidences/:evidenceId/download-url',
      '#controllers/employee_lactation_period_evidences_controller.downloadUrl'
    )
    // prettier-ignore
    router
      .delete(
        '/employee-lactation-periods/:periodId/evidences/:evidenceId',
        '#controllers/employee_lactation_period_evidences_controller.destroy'
      )
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteLactationEvidence))
  })
  .prefix('/api')
  .use(middleware.auth())
  .use(middleware.businessScope())
