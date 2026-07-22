import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.post('/', '#controllers/work_disability_note_controller.store')
    router.get('/:workDisabilityNoteId', '#controllers/work_disability_note_controller.show')
    router.put('/:workDisabilityNoteId', '#controllers/work_disability_note_controller.update')
    router.delete('/:workDisabilityNoteId', '#controllers/work_disability_note_controller.delete')
  })
  .prefix('/api/work-disability-notes')
  .use(middleware.auth())
  .use(middleware.businessScope())
