/* eslint-disable prettier/prettier */
import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import limiter from '@adonisjs/limiter/services/main'

const reportJobCreateLimit = limiter.define('report-job-create', (ctx) => {
  const userId = ctx.auth.user?.userId ?? 'anon'
  return limiter.allowRequests(10).every('10 minutes').usingKey(`report-job:${userId}`)
})

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
    router.get('/websocket-docs', '#controllers/assists_controller.websocketDocs')
    router.get('/verify-attendance-lock/:type', '#controllers/assists_controller.verifyAttendanceLock')

    // ── Jobs de reporte asíncronos (USRH1785766125019) ──────────────────────
    router
      .post('/reports', '#controllers/report_jobs_controller.create')
      .use(reportJobCreateLimit)
    router.get('/reports/:id/status', '#controllers/report_jobs_controller.status')
    router.get('/reports/:id/download', '#controllers/report_jobs_controller.download')
  })
  .use(middleware.auth())
  .use(middleware.businessScope())
  .prefix('/api/v1/assists')
