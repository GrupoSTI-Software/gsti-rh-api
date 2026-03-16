import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.post('/', '#controllers/employee_vacation_archive_controller.store')
    router.get('/', '#controllers/employee_vacation_archive_controller.index')
    router.get('/:employeeVacationArchiveId', '#controllers/employee_vacation_archive_controller.show')
    router.delete('/:employeeVacationArchiveId', '#controllers/employee_vacation_archive_controller.destroy')

    router.post(
      '/:employeeVacationArchiveId/contents',
      '#controllers/employee_vacation_archive_content_controller.store'
    )
    router.get(
      '/:employeeVacationArchiveId/contents',
      '#controllers/employee_vacation_archive_content_controller.index'
    )
    router.get(
      '/:employeeVacationArchiveId/contents/:employeeVacationArchiveContentId',
      '#controllers/employee_vacation_archive_content_controller.show'
    )
    router.post(
      '/:employeeVacationArchiveId/contents/:employeeVacationArchiveContentId',
      '#controllers/employee_vacation_archive_content_controller.update'
    )
    router.delete(
      '/:employeeVacationArchiveId/contents/:employeeVacationArchiveContentId',
      '#controllers/employee_vacation_archive_content_controller.destroy'
    )
  })
  .use(middleware.auth())
  .prefix('/api/employee-vacation-archives')
