import type { HttpContext } from '@adonisjs/core/http'
import { resolveEmployeeBadgeApiError } from '#helpers/employee_badge_api_error'
import { StandardResponseFormatter } from '#helpers/standard_response_formatter'
import BadgeService from './badge.service.js'
import BadgePdfService from './badge_pdf.service.js'
import BadgeRenderService from './badge_render.service.js'
import BadgeBulkService from './badge_bulk.service.js'
import { bulkBadgesValidator } from './validators/bulk_badges.validator.js'
import { parseEmployeeIdParam } from './validators/get_badge.validator.js'

/**
 * Controlador REST del gafete del trabajador (USRH1784686362321).
 *
 * Expone E1 (`show`, datos del gafete), E2 (`pdf`, descarga CR80), E5
 * (`png`, imagen @300 dpi), E6 (`bulk`, descarga masiva) y E3 (`me`, gafete
 * Espejo de
 * `providers.controller.ts`: `respondError` privado + `StandardResponseFormatter`.
 *
 * Sin permiso de módulo propio (decisión de permisos §16 del spec): E1/E2
 * solo requieren `auth()` + `businessScope()` — igual que la mayoría de
 * endpoints de empleados (`GET /api/employees` no monta ningún assert de
 * `RoleService.hasAccess` a nivel de módulo).
 */
export default class BadgeController {
  /**
   * @swagger
   * /api/employee-badges/{employeeId}:
   *   get:
   *     summary: Datos del gafete del trabajador (foto, empresa, QR, folio si aplica)
   *     description: |
   *       Gafete universal (R7): se genera para cualquier trabajador activo de la
   *       empresa del usuario, tenga o no registro REPSE. El folio y su vigencia
   *       viajan en `null` cuando la empresa no tiene registro (regla 12).
   *
   *       Genera el código de verificación del trabajador de forma perezosa si
   *       aún no existe (regla 6).
   *     tags: [EmployeeBadge]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: header
   *         name: Authorization
   *         required: true
   *         schema: { type: string }
   *         description: "Bearer access token."
   *       - in: header
   *         name: X-Business-Unit-Id
   *         required: true
   *         schema: { type: string }
   *         description: "Unidad de negocio seleccionada (scope del tenant)."
   *       - in: header
   *         name: Accept-Language
   *         required: false
   *         schema: { type: string, enum: [es, en] }
   *         description: "Traduce title/message; no altera la clave data.gafete."
   *       - in: path
   *         name: employeeId
   *         required: true
   *         schema: { type: integer, minimum: 1 }
   *     responses:
   *       '200':
   *         description: Gafete obtenido (con o sin folio REPSE, según registro de la empresa).
   *         content:
   *           application/json:
   *             examples:
   *               conFolio:
   *                 summary: Empresa con registro REPSE
   *                 value:
   *                   type: success
   *                   title: Gafete del empleado
   *                   message: Gafete obtenido correctamente
   *                   data:
   *                     gafete:
   *                       empleadoId: 123
   *                       nombreCompleto: "Juan Pérez García"
   *                       fotoUrl: "https://cdn.example.com/employees/123.jpg"
   *                       fotoFaltante: false
   *                       empresa: "Seguridad Integral SA de CV"
   *                       folioRepse: "REPSE-12345-2024"
   *                       folioVigente: true
   *                       folioVigenteHasta: "2031-03-31"
   *                       vinculoVigente: true
   *                       urlVerificacion: "https://bo.example.com/badge-verification/abc123"
   *                       qrDataUrl: "data:image/png;base64,iVBORw0KGgo…"
   *               sinFolio:
   *                 summary: Empresa sin registro REPSE (R7 — no es error)
   *                 value:
   *                   type: success
   *                   title: Gafete del empleado
   *                   message: Gafete obtenido correctamente
   *                   data:
   *                     gafete:
   *                       empleadoId: 456
   *                       nombreCompleto: "Carlos Méndez Ruiz"
   *                       fotoUrl: null
   *                       fotoFaltante: true
   *                       empresa: "Distribuidora El Roble S. de R.L."
   *                       folioRepse: null
   *                       folioVigente: null
   *                       folioVigenteHasta: null
   *                       vinculoVigente: true
   *                       urlVerificacion: "https://bo.example.com/badge-verification/def456"
   *                       qrDataUrl: "data:image/png;base64,iVBORw0KGgo…"
   *       '422':
   *         description: "`employeeId` no es un entero positivo (key `entrada-invalida`)."
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Error
   *               message: El identificador del empleado es inválido.
   *               detail: El identificador del empleado es inválido.
   *               key: entrada-invalida
   *               errorCode: BDG.VAL.001
   *               data: null
   *       '401':
   *         description: Sin autenticación.
   *       '404':
   *         description: Trabajador inexistente, de otro tenant, eliminado o inactivo (indistinguibles).
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Gafete no encontrado
   *               message: El gafete no existe o el trabajador no pertenece al tenant actual.
   *               detail: El gafete no existe o el trabajador no pertenece al tenant actual.
   *               key: gafete-no-encontrado
   *               errorCode: BDG.NF.001
   *               data: null
   *       '500':
   *         description: Error no controlado.
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Error
   *               message: Error inesperado
   *               errorCode: BDG.SYS.001
   *               data: null
   */
  async show(ctx: HttpContext) {
    const { params, response, i18n, businessUnitScope } = ctx
    try {
      const employeeId = parseEmployeeIdParam(params.employeeId)
      const service = new BadgeService()
      const gafete = await service.getBadgeForEmployeeInTenant(employeeId, businessUnitScope)

      return StandardResponseFormatter.success(
        response,
        gafete,
        i18n.t('employee_badge_title', undefined, 'Gafete del empleado'),
        i18n.t('employee_badge_found_successfully', undefined, 'Gafete obtenido correctamente'),
        200,
        'gafete'
      )
    } catch (error) {
      return this.respondError(error, response, 500, i18n)
    }
  }

  /**
   * @swagger
   * /api/employee-badges/{employeeId}/pdf:
   *   get:
   *     summary: Descarga el gafete en PDF tamaño credencial CR80
   *     description: |
   *       PDF CR80 (85.6 × 53.98 mm) listo para imprimir. Sin registro REPSE
   *       el bloque de folio se omite y el layout se compacta (regla 12); sin
   *       foto se usa un marcador de posición (regla 10). Nunca se persiste.
   *     tags: [EmployeeBadge]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: header
   *         name: Authorization
   *         required: true
   *         schema: { type: string }
   *       - in: header
   *         name: X-Business-Unit-Id
   *         required: true
   *         schema: { type: string }
   *       - in: path
   *         name: employeeId
   *         required: true
   *         schema: { type: integer, minimum: 1 }
   *     responses:
   *       '200':
   *         description: "Stream del PDF (`Content-Type: application/pdf`, `Content-Disposition: attachment`)."
   *         content:
   *           application/pdf:
   *             schema: { type: string, format: binary }
   *       '422':
   *         description: "`employeeId` no es un entero positivo (key `entrada-invalida`)."
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Error
   *               message: El identificador del empleado es inválido.
   *               detail: El identificador del empleado es inválido.
   *               key: entrada-invalida
   *               errorCode: BDG.VAL.001
   *               data: null
   *       '401':
   *         description: Sin autenticación.
   *       '404':
   *         description: Trabajador inexistente, de otro tenant, eliminado o inactivo.
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Gafete no encontrado
   *               message: El gafete no existe o el trabajador no pertenece al tenant actual.
   *               detail: El gafete no existe o el trabajador no pertenece al tenant actual.
   *               key: gafete-no-encontrado
   *               errorCode: BDG.NF.001
   *               data: null
   *       '500':
   *         description: Error no controlado.
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Error
   *               message: Error inesperado
   *               errorCode: BDG.SYS.001
   *               data: null
   */
  async pdf(ctx: HttpContext) {
    const { params, response, i18n, businessUnitScope } = ctx
    try {
      const employeeId = parseEmployeeIdParam(params.employeeId)
      const service = new BadgeService()
      const { dto } = await service.getBadgeContextForPdf(employeeId, businessUnitScope)

      const pdfService = new BadgePdfService()
      const buffer = await pdfService.buildBadgePdf({
        employeeId: dto.empleadoId,
        nombreCompleto: dto.nombreCompleto,
        fotoUrl: dto.fotoUrl,
        empresa: dto.empresa,
        puesto: dto.puesto,
        folioRepse: dto.folioRepse,
        folioVigente: dto.folioVigente,
        urlVerificacion: dto.urlVerificacion,
      })

      const safeName = `gafete-empleado-${employeeId}`.replace(/[^\w.\- ]/g, '_')
      response.header('Content-Type', 'application/pdf')
      response.header('Content-Disposition', `attachment; filename="${safeName}.pdf"`)
      response.header('Cache-Control', 'private, no-store')
      response.header('Content-Length', String(buffer.length))
      response.status(200)
      return response.send(buffer)
    } catch (error) {
      return this.respondError(error, response, 500, i18n)
    }
  }

  /**
   * @swagger
   * /api/employee-badges/{employeeId}/png:
   *   get:
   *     summary: Descarga el gafete en PNG @300 dpi (1011×638 px)
   *     description: |
   *       Imagen nítida del mismo gafete que el PDF CR80, generada desde el
   *       PNG master en canvas. Sin registro REPSE el bloque de folio se omite
   *       y el layout se compacta (regla 12); sin foto se usa un marcador de
   *       posición (regla 10). Nunca se persiste.
   *     tags: [EmployeeBadge]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: header
   *         name: Authorization
   *         required: true
   *         schema: { type: string }
   *       - in: header
   *         name: X-Business-Unit-Id
   *         required: true
   *         schema: { type: string }
   *       - in: path
   *         name: employeeId
   *         required: true
   *         schema: { type: integer, minimum: 1 }
   *     responses:
   *       '200':
   *         description: "Stream del PNG (`Content-Type: image/png`, `Content-Disposition: attachment`)."
   *         content:
   *           image/png:
   *             schema: { type: string, format: binary }
   *       '422':
   *         description: "`employeeId` no es un entero positivo (key `entrada-invalida`)."
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Error
   *               message: El identificador del empleado es inválido.
   *               detail: El identificador del empleado es inválido.
   *               key: entrada-invalida
   *               errorCode: BDG.VAL.001
   *               data: null
   *       '401':
   *         description: Sin autenticación.
   *       '404':
   *         description: Trabajador inexistente, de otro tenant, eliminado o inactivo.
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Gafete no encontrado
   *               message: El gafete no existe o el trabajador no pertenece al tenant actual.
   *               detail: El gafete no existe o el trabajador no pertenece al tenant actual.
   *               key: gafete-no-encontrado
   *               errorCode: BDG.NF.001
   *               data: null
   *       '500':
   *         description: Error no controlado.
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Error
   *               message: Error inesperado
   *               errorCode: BDG.SYS.001
   *               data: null
   */
  async png(ctx: HttpContext) {
    const { params, response, i18n, businessUnitScope } = ctx
    try {
      const employeeId = parseEmployeeIdParam(params.employeeId)
      const service = new BadgeService()
      const { dto } = await service.getBadgeContextForPdf(employeeId, businessUnitScope)

      const renderService = new BadgeRenderService()
      const buffer = await renderService.renderBadgePng({
        employeeId: dto.empleadoId,
        nombreCompleto: dto.nombreCompleto,
        fotoUrl: dto.fotoUrl,
        empresa: dto.empresa,
        puesto: dto.puesto,
        folioRepse: dto.folioRepse,
        folioVigente: dto.folioVigente,
        urlVerificacion: dto.urlVerificacion,
      })

      const safeName = `gafete-empleado-${employeeId}`.replace(/[^\w.\- ]/g, '_')
      response.header('Content-Type', 'image/png')
      response.header('Content-Disposition', `attachment; filename="${safeName}.png"`)
      response.header('Cache-Control', 'private, no-store')
      response.header('Content-Length', String(buffer.length))
      response.status(200)
      return response.send(buffer)
    } catch (error) {
      return this.respondError(error, response, 500, i18n)
    }
  }

  /**
   * @swagger
   * /api/employee-badges/bulk:
   *   post:
   *     summary: Descarga masiva de gafetes (PDF carta 2×4 o ZIP de PNGs)
   *     description: |
   *       Genera un lote de gafetes para los trabajadores activos resueltos
   *       dentro del tenant. Ids inexistentes, de otro tenant o dados de baja
   *       se omiten en silencio (RC1). Si ningún id resuelve, responde 404.
   *
   *       **PDF:** documento LETTER con cuadrícula 2×4 (8 gafetes/hoja) y
   *       líneas de corte. **PNG:** ZIP con una imagen por trabajador
   *       (`{employeeId}-{nombre}.png`). Streaming chunked — sin persistencia.
   *     tags: [EmployeeBadge]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: header
   *         name: Authorization
   *         required: true
   *         schema: { type: string }
   *       - in: header
   *         name: X-Business-Unit-Id
   *         required: true
   *         schema: { type: string }
   *       - in: header
   *         name: Accept-Language
   *         required: false
   *         schema: { type: string, enum: [es, en] }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [empleadoIds]
   *             properties:
   *               empleadoIds:
   *                 type: array
   *                 minItems: 1
   *                 items: { type: integer, minimum: 1 }
   *               formato:
   *                 type: string
   *                 enum: [pdf, png]
   *                 default: pdf
   *           example:
   *             empleadoIds: [123, 456, 789]
   *             formato: pdf
   *     responses:
   *       '200':
   *         description: |
   *           Stream del lote (`application/pdf` o `application/zip` según
   *           `formato`; `Content-Disposition: attachment`, chunked).
   *         content:
   *           application/pdf:
   *             schema: { type: string, format: binary }
   *           application/zip:
   *             schema: { type: string, format: binary }
   *       '400':
   *         description: Payload inválido (array vacío, ids no enteros o formato inválido).
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Datos inválidos
   *               message: Error de validación
   *               errorCode: BDG.VAL.001
   *               data: null
   *       '401':
   *         description: Sin autenticación.
   *       '403':
   *         description: |
   *           Sin el permiso `generate-badges` del módulo Empleados, con la
   *           exigencia del módulo encendida en la empresa.
   *         content:
   *           application/json:
   *             example:
   *               title: Sin permiso
   *               detail: No tienes permiso para realizar esta operación.
   *               key: PERM.DENIED
   *       '404':
   *         description: Ningún trabajador del payload resolvió en el tenant (indistinguible).
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Gafete no encontrado
   *               message: El gafete no existe o el trabajador no pertenece al tenant actual.
   *               detail: El gafete no existe o el trabajador no pertenece al tenant actual.
   *               key: gafete-no-encontrado
   *               errorCode: BDG.NF.001
   *               data: null
   *       '429':
   *         description: Más de 3 descargas masivas por minuto del mismo usuario.
   *       '500':
   *         description: Error antes del primer byte del stream.
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Error
   *               message: Error inesperado
   *               errorCode: BDG.SYS.001
   *               data: null
   */
  async bulk(ctx: HttpContext) {
    const { request, response, i18n, businessUnitScope } = ctx
    try {
      const body = await request.validateUsing(bulkBadgesValidator)
      const formato = body.formato ?? 'pdf'
      const bulkService = new BadgeBulkService()

      await bulkService.streamBulk({
        empleadoIds: body.empleadoIds,
        formato,
        businessUnitIds: businessUnitScope,
        response,
      })
    } catch (error) {
      return this.respondError(error, response, 500, i18n)
    }
  }

  /**
   * @swagger
   * /api/employee-badges/me:
   *   get:
   *     summary: Gafete propio del usuario autenticado (contrato para la app del empleado)
   *     description: |
   *       Resuelve el empleado por `personId` del usuario autenticado; jamás
   *       acepta un `employeeId` del cliente. Se registra ANTES de
   *       `/:employeeId` en el router.
   *     tags: [EmployeeBadge]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: header
   *         name: Authorization
   *         required: true
   *         schema: { type: string }
   *       - in: header
   *         name: X-Business-Unit-Id
   *         required: true
   *         schema: { type: string }
   *     responses:
   *       '200':
   *         description: Gafete propio obtenido.
   *         content:
   *           application/json:
   *             example:
   *               type: success
   *               title: Gafete del empleado
   *               message: Gafete obtenido correctamente
   *               data:
   *                 gafete:
   *                   empleadoId: 123
   *                   nombreCompleto: "Juan Pérez García"
   *                   fotoUrl: "https://cdn.example.com/employees/123.jpg"
   *                   fotoFaltante: false
   *                   empresa: "Seguridad Integral SA de CV"
   *                   folioRepse: "REPSE-12345-2024"
   *                   folioVigente: true
   *                   folioVigenteHasta: "2031-03-31"
   *                   vinculoVigente: true
   *                   urlVerificacion: "https://bo.example.com/badge-verification/abc123"
   *                   qrDataUrl: "data:image/png;base64,iVBORw0KGgo…"
   *       '401':
   *         description: Sin autenticación.
   *       '422':
   *         description: Usuario autenticado sin empleado activo asociado.
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Error
   *               message: El usuario autenticado no tiene un empleado activo asociado.
   *               detail: El usuario autenticado no tiene un empleado activo asociado.
   *               key: sin-empleado-asociado
   *               errorCode: BDG.NF.EMP.001
   *               data: null
   *       '500':
   *         description: Error no controlado.
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Error
   *               message: Error inesperado
   *               errorCode: BDG.SYS.001
   *               data: null
   */
  async me(ctx: HttpContext) {
    const { auth, response, i18n, businessUnitScope } = ctx
    try {
      const personId = auth.user!.personId
      const service = new BadgeService()
      const gafete = await service.getBadgeForSelf(personId, businessUnitScope)

      return StandardResponseFormatter.success(
        response,
        gafete,
        i18n.t('employee_badge_title', undefined, 'Gafete del empleado'),
        i18n.t('employee_badge_found_successfully', undefined, 'Gafete obtenido correctamente'),
        200,
        'gafete'
      )
    } catch (error) {
      return this.respondError(error, response, 500, i18n)
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private respondError(
    error: unknown,
    response: HttpContext['response'],
    fallback: number,
    i18n: HttpContext['i18n']
  ) {
    const resolved = resolveEmployeeBadgeApiError(error, fallback, i18n)
    const body: Record<string, unknown> = {
      type: 'error',
      title: resolved.title,
      message: resolved.message,
      errorCode: resolved.errorCode,
      data: null,
    }
    if (resolved.key) {
      body.key = resolved.key
      body.detail = resolved.message
    }
    return response.status(resolved.status).json(body)
  }
}
