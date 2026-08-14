/* eslint-disable prettier/prettier */
import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'

router
  .group(() => {
    router.get('/', '#controllers/shift_exception_evidence_controller.index')
    router
      .post('/', '#controllers/shift_exception_evidence_controller.store')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createShiftExceptionEvidence))
    router
      .put('/:shiftExceptionEvidenceId', '#controllers/shift_exception_evidence_controller.update')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateShiftExceptionEvidence))
    router
      .delete('/:shiftExceptionEvidenceId', '#controllers/shift_exception_evidence_controller.delete')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteShiftExceptionEvidence))
    router.get('/:shiftExceptionEvidenceId', '#controllers/shift_exception_evidence_controller.show')
  })
  .use(middleware.auth())
  .prefix('/api/shift-exception-evidences')
