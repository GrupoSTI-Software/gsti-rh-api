/* eslint-disable prettier/prettier */
import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get('/get-flat-list', '#controllers/assists_controller.getAssistFlatList')
    router.get('/get-format-payroll', '#controllers/assists_controller.getFormatPayRoll')
    router.get('/get-excel-by-employee', '#controllers/assists_controller.getExcelByEmployee')
    router.get('/get-excel-by-position', '#controllers/assists_controller.getExcelByPosition')
    router.get('/get-excel-by-department', '#controllers/assists_controller.getExcelByDepartment')
    router.get('/get-excel-all', '#controllers/assists_controller.getExcelAll')
    router.get('/get-excel-permissions-dates', '#controllers/assists_controller.getExcelPermissionsByDates')
    router.get('/', '#controllers/assists_controller.index')//.use(middleware.auth({ guards: ['api'] }))
    router.get('/status', '#controllers/assists_controller.getStatusSync')
    router.post('/synchronize', '#controllers/assists_controller.synchronize')
    router.post('/employee-synchronize', '#controllers/assists_controller.employeeSynchronize')
    router.post('/', '#controllers/assists_controller.store')
    router.put('/:assistId/inactivate', '#controllers/assists_controller.inactivate')
  })
  .use(middleware.auth())
  .prefix('/api/v1/assists')
