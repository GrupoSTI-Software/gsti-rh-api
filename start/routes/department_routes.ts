/* eslint-disable prettier/prettier */
import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router.group(() => {
  router.get('/', '#controllers/department_controller.getAll')
  router.get('/get-only-with-employees/', '#controllers/department_controller.getOnlyWithEmployees')
  router.get('/organization', '#controllers/department_controller.getOrganization')
  router.get('/search', '#controllers/department_controller.getSearch')
  router.get('/:departmentId/get-rotation-index', '#controllers/department_controller.getRotationIndex')
  router.get('/:departmentId', '#controllers/department_controller.show')
  router.get('/:departmentId/positions', '#controllers/department_controller.getPositions')
  router.post('/', '#controllers/department_controller.store')
  router.post('/sync-positions', '#controllers/department_controller.syncPositions')
  router.put('/:departmentId', '#controllers/department_controller.update')
  router.delete('/:departmentId', '#controllers/department_controller.delete')
  router.delete('/:departmentId/force-delete', '#controllers/department_controller.forceDelete')
})
 .prefix('/api/departments')//.use(middleware.auth())

router
  .group(() => {
    router.patch('/:departmentId/move', '#controllers/department_controller.move')
  })
  .prefix('/api/departments')
  .use(middleware.auth())

router.group(() => {
  router.post('/assign-shift/:departmentId', '#controllers/department_controller.assignShift')
})
.prefix('/api/department')
.use(middleware.auth())
