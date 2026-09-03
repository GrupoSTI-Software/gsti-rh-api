/* eslint-disable prettier/prettier */
import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import limiter from '@adonisjs/limiter/services/main'
import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { ASSIST_ERROR_CODES } from '#constants/assist_error_codes'
import { EMPLOYEES_DOWNLOAD_PERMISSION_DECLARATIONS } from '#constants/employees_download_permission_declarations'
import {
  ASSIST_INGESTION_BATCH_ITEMS_PER_WINDOW,
  ASSIST_INGESTION_BATCH_ITEMS_WINDOW,
} from '#modules/assist-ingestion/assist_ingestion.constants'

const reportJobCreateLimit = limiter.define('report-job-create', (ctx) => {
  const userId = ctx.auth.user?.userId ?? 'anon'
  return limiter.allowRequests(10).every('10 minutes').usingKey(`report-job:${userId}`)
})

const assistStoreLimit = limiter.define('assist-store', (ctx) => {
  const userId = ctx.auth.user?.userId ?? 'anon'
  return limiter.allowRequests(20).every('5 minutes').usingKey(`assist-store:${userId}`)
})

/**
 * Segundo contador de la entrega de varias checadas: cuenta **checadas**, no
 * peticiones (USRH1788135907802).
 *
 * Sin él, permitir entregas de 200 multiplicaría por 200 lo que un equipo puede
 * pedirle al servidor con la misma cuota, y el límite dejaria de contar el hecho de
 * negocio. Se monta DESPUES de `assistStoreLimit`, que no se toca: un 429 del
 * contador de peticiones ni siquiera llega a mirar el cuerpo.
 *
 * Si la entrega no cabe en lo que queda de la ventana, no se procesa nada y no se
 * cobra nada: el equipo reintenta sin descartar su cola.
 */
const assistBatchItemsLimit = async (ctx: HttpContext, next: NextFn) => {
  const rawAssists = ctx.request.input('assists')
  const items = Array.isArray(rawAssists) ? rawAssists.length : 0
  if (items === 0) return next()

  const counter = limiter.use({
    requests: ASSIST_INGESTION_BATCH_ITEMS_PER_WINDOW,
    duration: ASSIST_INGESTION_BATCH_ITEMS_WINDOW,
  })
  const key = `assist-store-items:${ctx.auth.user?.userId ?? 'anon'}`
  const state = await counter.get(key)
  const consumed = state?.consumed ?? 0

  if (consumed + items > ASSIST_INGESTION_BATCH_ITEMS_PER_WINDOW) {
    const detail = ctx.i18n.t(
      'assist_batch_items_rate_limit_message',
      undefined,
      'Se alcanzo el maximo de checadas permitidas en la ventana actual.'
    )
    return ctx.response.status(429).send({
      type: 'warning',
      title: ctx.i18n.t('assist_batch_items_rate_limit_title', undefined, 'Cuota de checadas agotada'),
      message: detail,
      detail,
      key: 'cuota-de-checadas-agotada',
      code: ASSIST_ERROR_CODES.RATE_LIMIT,
    })
  }

  // `increment` en bucle y no `set`: `set` re-fija la duracion de la llave y
  // desplazaria la ventana hacia adelante en cada escritura, castigando al equipo
  // honesto mas tiempo del debido.
  for (let consumedItem = 0; consumedItem < items; consumedItem += 1) {
    await counter.increment(key)
  }

  return next()
}

router
  .group(() => {
    router.get('/get-flat-list', '#controllers/assists_controller.getAssistFlatList')
    router.get('/get-format-payroll', '#controllers/assists_controller.getFormatPayRoll')
      .use(middleware.permissionGate(EMPLOYEES_DOWNLOAD_PERMISSION_DECLARATIONS.getPayrollFormat))
    router.get('/get-excel-by-employee', '#controllers/assists_controller.getExcelByEmployee')
      .use(middleware.permissionGate(EMPLOYEES_DOWNLOAD_PERMISSION_DECLARATIONS.getAttendanceByEmployee))
    router.get('/get-excel-by-position', '#controllers/assists_controller.getExcelByPosition')
      .use(middleware.permissionGate(EMPLOYEES_DOWNLOAD_PERMISSION_DECLARATIONS.getAttendanceByPosition))
    router.get('/get-excel-by-department', '#controllers/assists_controller.getExcelByDepartment')
      .use(middleware.permissionGate(EMPLOYEES_DOWNLOAD_PERMISSION_DECLARATIONS.getAttendanceByDepartment))
    router.get('/get-excel-all', '#controllers/assists_controller.getExcelAll')
      .use(middleware.permissionGate(EMPLOYEES_DOWNLOAD_PERMISSION_DECLARATIONS.getAttendanceAll))
    router.get('/get-excel-permissions-dates', '#controllers/assists_controller.getExcelPermissionsByDates')
      .use(middleware.permissionGate(EMPLOYEES_DOWNLOAD_PERMISSION_DECLARATIONS.getPermissionsByDates))
    router.get('/', '#controllers/assists_controller.index')//.use(middleware.auth({ guards: ['api'] }))
    router.get('/status', '#controllers/assists_controller.getStatusSync')
    router.post('/synchronize', '#controllers/assists_controller.synchronize')
    router.post('/employee-synchronize', '#controllers/assists_controller.employeeSynchronize')
    router.post('/', '#controllers/assists_controller.store')
      .use(assistStoreLimit)
    router.post('/batch', '#modules/assist-ingestion/assist_ingestion.controller.storeBatch')
      .use([assistStoreLimit, assistBatchItemsLimit])
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
