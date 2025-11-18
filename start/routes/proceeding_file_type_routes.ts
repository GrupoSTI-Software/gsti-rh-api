import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get('/by-area/:areaToUse', '#controllers/proceeding_file_type_controller.indexByArea')
    router.get('/', '#controllers/proceeding_file_type_controller.index')
    router.post('/', '#controllers/proceeding_file_type_controller.store')
    router.post('/create-employee-type', '#controllers/proceeding_file_type_controller.createEmployeeType')
    router.put('/:proceedingFileTypeId', '#controllers/proceeding_file_type_controller.update')
    router.delete('/:proceedingFileTypeId', '#controllers/proceeding_file_type_controller.delete')
    router.get(
      '/:proceedingFileTypeId/get-legacy-emails',
      '#controllers/proceeding_file_type_controller.getLegacyEmails'
    )
    router.get('/:proceedingFileTypeId', '#controllers/proceeding_file_type_controller.show')
  })
  .prefix('/api/proceeding-file-types')
  .use(middleware.auth())
