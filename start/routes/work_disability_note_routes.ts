import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { EMPLOYEES_READ_PERMISSION_DECLARATIONS } from '#constants/employees_read_permission_declarations'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'

router
  .group(() => {
    router
      .post('/', '#controllers/work_disability_note_controller.store')
      .use(
        middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createWorkDisabilityNote)
      )
    router
      .get('/:workDisabilityNoteId', '#controllers/work_disability_note_controller.show')
      .use(middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.showWorkDisabilityNote))
    router
      .put('/:workDisabilityNoteId', '#controllers/work_disability_note_controller.update')
      .use(
        middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateWorkDisabilityNote)
      )
    router
      .delete('/:workDisabilityNoteId', '#controllers/work_disability_note_controller.delete')
      .use(
        middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteWorkDisabilityNote)
      )
  })
  .prefix('/api/work-disability-notes')
  .use(middleware.auth())
  .use(middleware.businessScope())
