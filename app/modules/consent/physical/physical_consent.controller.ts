import type { HttpContext } from '@adonisjs/core/http'
import RoleService from '#services/role_service'
import ConsentError from '#exceptions/consent_error'
import type { ConsentErrorKey } from '#exceptions/consent_error'
import { CONSENT_ERROR_CODES } from '#constants/consent_error_codes'
import { CONSENT_ERROR_STATUS } from '#modules/consent/consent.constants'
import PhysicalConsentService from './physical_consent.service.js'
import { registerPhysicalConsentValidator } from './validators/register_physical_consent.validator.js'

/** Módulo bajo el que vive el permiso nuevo (regla 2 — sin módulo aparte). */
const PARENT_MODULE_SLUG = 'employees'
/** Permiso NUEVO y específico (decisión Wilvardo 2026-07-15) — ver seeder 0051. */
const PHYSICAL_CONSENT_PERMISSION_SLUG = 'register-physical-consent'

/**
 * Controller del slice `consent/physical` (USRH1784146205513): asentar el
 * consentimiento biométrico firmado en papel desde la ficha del empleado, consultar
 * su estado y descargar el escaneo. Vive FUERA del group global `/api/consent`
 * (H8): grupo propio con `auth + businessScope`, anidado bajo el recurso empleado.
 *
 * Seguridad (S1+S2): cada acción valida el permiso server-side (`register-physical-consent`
 * para asentar/descargar de ficha, `employees:read` para el estado) y el scope de tenant
 * del empleado ANTES de cualquier efecto — el flag del BO solo oculta el botón, nunca
 * sustituye este check (anti-patrón face-id, no replicado).
 */
export default class PhysicalConsentController {
  /**
   * @swagger
   * /api/employees/{employeeId}/consents/physical:
   *   post:
   *     summary: Asienta el consentimiento biométrico firmado en físico
   *     description: |
   *       Registra, para UN empleado, el consentimiento biométrico firmado en papel
   *       contra la versión VIGENTE publicada. El escaneo es obligatorio (PDF/JPG/PNG,
   *       máx 10 MB) y se sube a S3 con permiso `private`; nunca se expone la Key.
   *       El asiento entra al mismo registro `user_consents` de las aceptaciones
   *       digitales, marcado con canal `physical`. `registeredBy` siempre es el usuario
   *       autenticado (nunca un valor del body). Write-once: no existe update ni delete.
   *     security:
   *       - bearerAuth: []
   *     tags: [ConsentPhysical]
   *     parameters:
   *       - in: header
   *         name: Authorization
   *         required: true
   *         schema: { type: string }
   *         description: "Bearer access token."
   *       - in: header
   *         name: X-Business-Unit-Id
   *         required: true
   *         schema: { type: string, format: uuid }
   *         description: "Código público de la unidad de negocio activa."
   *       - in: header
   *         name: Accept-Language
   *         required: false
   *         schema: { type: string, enum: [es, en] }
   *         description: "Idioma de los mensajes traducidos. Default `es`."
   *       - in: path
   *         name: employeeId
   *         required: true
   *         schema: { type: integer }
   *     requestBody:
   *       required: true
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             required: [type, documentVersion, file]
   *             properties:
   *               type:
   *                 type: string
   *                 enum: [biometric_consent]
   *               documentVersion:
   *                 type: string
   *                 example: "2.0"
   *               signedAt:
   *                 type: string
   *                 format: date
   *                 example: "2026-07-10"
   *                 description: "Opcional, ≤ hoy. Sin él, se usa la fecha del asiento."
   *               file:
   *                 type: string
   *                 format: binary
   *                 description: PDF, JPG o PNG de hasta 10 MB.
   *     responses:
   *       201:
   *         description: Consentimiento físico registrado
   *         content:
   *           application/json:
   *             example:
   *               type: success
   *               title: Consentimiento biométrico
   *               message: Consentimiento físico registrado correctamente
   *               data:
   *                 userConsentId: 123
   *                 employeeId: 45
   *                 userId: null
   *                 channel: physical
   *                 legalDocumentId: 7
   *                 documentType: biometric_consent
   *                 version: "2.0"
   *                 signedAt: "2026-07-10"
   *                 acceptedAt: "2026-07-15T13:00:00.000-06:00"
   *                 registeredBy: { userId: 3, name: "Nombre Apellido" }
   *                 evidence: { originalName: "consentimiento-firmado.pdf" }
   *       400:
   *         description: Header X-Business-Unit-Id ausente
   *         content:
   *           application/json:
   *             example:
   *               title: Header requerido
   *               detail: El header x-business-unit-id es obligatorio.
   *               key: BU.VAL.000
   *       403:
   *         description: Sin el permiso register-physical-consent
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Consentimiento biométrico
   *               message: No tienes permiso para asentar consentimientos físicos.
   *               detail: No tienes permiso para asentar consentimientos físicos.
   *               key: sin-permiso-consentimiento
   *               code: CSNT.FORB.001
   *               data: null
   *       404:
   *         description: Empleado inexistente, de baja o fuera de scope (404 opaco)
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Consentimiento biométrico
   *               message: El empleado no existe, está dado de baja o no pertenece a la empresa actual.
   *               detail: El empleado no existe, está dado de baja o no pertenece a la empresa actual.
   *               key: empleado-no-encontrado
   *               code: CSNT.NF.001
   *               data: null
   *       409:
   *         description: El empleado ya tiene aceptada la versión vigente (cualquier canal)
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Consentimiento biométrico
   *               message: El empleado ya tiene aceptada la versión vigente de este documento.
   *               detail: El empleado ya tiene aceptada la versión vigente de este documento.
   *               key: consentimiento-ya-registrado
   *               code: CSNT.DUP.001
   *               data: null
   *       422:
   *         description: Sin versión vigente, versión no coincidente, o archivo faltante/inválido/demasiado grande
   *         content:
   *           application/json:
   *             examples:
   *               sinVigente:
   *                 summary: No hay versión vigente publicada del biométrico
   *                 value:
   *                   type: error
   *                   title: Consentimiento biométrico
   *                   message: No hay una versión vigente publicada del consentimiento biométrico.
   *                   detail: No hay una versión vigente publicada del consentimiento biométrico.
   *                   key: sin-version-vigente-biometrico
   *                   code: CSNT.VAL.003
   *                   data: null
   *               archivoRequerido:
   *                 summary: Falta el archivo
   *                 value:
   *                   type: error
   *                   title: Consentimiento biométrico
   *                   message: No se recibió el escaneo del documento firmado.
   *                   detail: No se recibió el escaneo del documento firmado.
   *                   key: archivo-de-evidencia-requerido
   *                   code: CSNT.VAL.004
   *                   data: null
   *       500:
   *         description: Fallo de almacenamiento al subir el escaneo a S3
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Consentimiento biométrico
   *               message: Error al subir el escaneo del documento a S3.
   *               detail: Error al subir el escaneo del documento a S3.
   *               key: error-de-almacenamiento-de-evidencia
   *               code: CSNT.SRV.001
   *               data: null
   */
  async store(ctx: HttpContext, service: PhysicalConsentService = new PhysicalConsentService()) {
    const { request, response, auth, i18n } = ctx
    try {
      await this.assertHasPermission(ctx, PHYSICAL_CONSENT_PERMISSION_SLUG)
      const employeeId = this.parseEmployeeId(ctx.params.employeeId)

      let payload
      try {
        payload = await request.validateUsing(registerPhysicalConsentValidator)
      } catch (error) {
        return this.validationError(ctx, error)
      }

      const data = await service.register({
        employeeId,
        allowedBusinessUnitIds: ctx.businessUnitScope,
        documentVersion: payload.documentVersion,
        signedAt: payload.signedAt ?? null,
        file: request.file('file'),
        registeredByUserId: auth.user!.userId,
        ip: request.ip(),
        userAgent: request.header('user-agent') ?? null,
      })

      return response.status(201).json({
        type: 'success',
        title: i18n.formatMessage('consent.title'),
        message: i18n.formatMessage('consent.physical_register_success'),
        data,
      })
    } catch (error) {
      return this.domainError(ctx, error)
    }
  }

  /**
   * @swagger
   * /api/employees/{employeeId}/consents/status:
   *   get:
   *     summary: Estado del consentimiento biométrico del empleado (para la ficha)
   *     description: |
   *       Resuelve el asiento del documento vigente por AMBAS anclas (empleado directo,
   *       o usuario de su persona). Requiere solo el permiso de lectura de la ficha
   *       (`employees:read`): el chip de estado debe verse aunque el usuario no pueda
   *       asentar. `data` es `null` si el empleado no tiene asiento del documento vigente.
   *     security:
   *       - bearerAuth: []
   *     tags: [ConsentPhysical]
   *     parameters:
   *       - in: header
   *         name: Authorization
   *         required: true
   *         schema: { type: string }
   *       - in: header
   *         name: X-Business-Unit-Id
   *         required: true
   *         schema: { type: string, format: uuid }
   *       - in: path
   *         name: employeeId
   *         required: true
   *         schema: { type: integer }
   *       - in: query
   *         name: type
   *         required: false
   *         schema: { type: string, enum: [biometric_consent], default: biometric_consent }
   *     responses:
   *       200:
   *         description: Estado del consentimiento (o `null` si no hay asiento)
   *         content:
   *           application/json:
   *             examples:
   *               conAsiento:
   *                 value:
   *                   type: success
   *                   title: Consentimiento biométrico
   *                   message: Estado de consentimiento obtenido correctamente.
   *                   data:
   *                     userConsentId: 123
   *                     version: "2.0"
   *                     channel: physical
   *                     signedAt: "2026-07-10"
   *                     acceptedAt: "2026-07-15T13:00:00.000-06:00"
   *                     registeredByName: "Nombre Apellido"
   *                     hasAttachment: true
   *               sinAsiento:
   *                 value:
   *                   type: success
   *                   title: Consentimiento biométrico
   *                   message: Estado de consentimiento obtenido correctamente.
   *                   data: null
   *       404:
   *         description: Empleado inexistente, de baja o fuera de scope (404 opaco)
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Consentimiento biométrico
   *               message: El empleado no existe, está dado de baja o no pertenece a la empresa actual.
   *               detail: El empleado no existe, está dado de baja o no pertenece a la empresa actual.
   *               key: empleado-no-encontrado
   *               code: CSNT.NF.001
   *               data: null
   */
  async status(ctx: HttpContext, service: PhysicalConsentService = new PhysicalConsentService()) {
    const { response, i18n } = ctx
    try {
      await this.assertHasPermission(ctx, 'read')
      const employeeId = this.parseEmployeeId(ctx.params.employeeId)

      const data = await service.getStatus(employeeId, ctx.businessUnitScope)

      return response.status(200).json({
        type: 'success',
        title: i18n.formatMessage('consent.title'),
        message: i18n.formatMessage('consent.status_success'),
        data,
      })
    } catch (error) {
      return this.domainError(ctx, error)
    }
  }

  /**
   * @swagger
   * /api/employees/{employeeId}/consents/{userConsentId}/evidence-download-url:
   *   get:
   *     summary: URL firmada temporal para descargar el escaneo, desde la ficha
   *     description: |
   *       Devuelve un enlace pre-firmado a S3 con vigencia de 5 minutos. Gatea con el
   *       MISMO permiso que asentar (`register-physical-consent`): asentar y evidenciar
   *       son la misma capacidad (S2). Registra el acceso en la bitácora PII ANTES de
   *       firmar la URL (S9).
   *     security:
   *       - bearerAuth: []
   *     tags: [ConsentPhysical]
   *     parameters:
   *       - in: header
   *         name: Authorization
   *         required: true
   *         schema: { type: string }
   *       - in: header
   *         name: X-Business-Unit-Id
   *         required: true
   *         schema: { type: string, format: uuid }
   *       - in: path
   *         name: employeeId
   *         required: true
   *         schema: { type: integer }
   *       - in: path
   *         name: userConsentId
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       200:
   *         description: URL firmada generada
   *         content:
   *           application/json:
   *             example:
   *               type: success
   *               title: Consentimiento biométrico
   *               message: URL de descarga generada correctamente.
   *               data: { downloadUrl: "https://...", expiresInSeconds: 300 }
   *       404:
   *         description: Asiento inexistente, de otro empleado, o empleado fuera de scope (404 opaco)
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Consentimiento biométrico
   *               message: El asiento indicado no existe o no pertenece a este empleado.
   *               detail: El asiento indicado no existe o no pertenece a este empleado.
   *               key: empleado-no-encontrado
   *               code: CSNT.NF.001
   *               data: null
   *       500:
   *         description: Fallo al firmar la URL de descarga
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Consentimiento biométrico
   *               message: No se pudo generar el enlace de descarga del escaneo.
   *               detail: No se pudo generar el enlace de descarga del escaneo.
   *               key: error-de-almacenamiento-de-evidencia
   *               code: CSNT.SRV.001
   *               data: null
   */
  async downloadUrl(
    ctx: HttpContext,
    service: PhysicalConsentService = new PhysicalConsentService()
  ) {
    const { request, response, auth, i18n } = ctx
    try {
      await this.assertHasPermission(ctx, PHYSICAL_CONSENT_PERMISSION_SLUG)
      const employeeId = this.parseEmployeeId(ctx.params.employeeId)
      const userConsentId = this.parseId(ctx.params.userConsentId, 'empleado-no-encontrado')

      const data = await service.getDownloadUrl(employeeId, userConsentId, ctx.businessUnitScope, {
        accessorUserId: auth.user!.userId,
        accessorIp: request.ip(),
        accessorUserAgent: request.header('user-agent') ?? null,
        requestId: null,
      })

      return response.status(200).json({
        type: 'success',
        title: i18n.formatMessage('consent.title'),
        message: i18n.formatMessage('consent.download_url_success'),
        data,
      })
    } catch (error) {
      return this.domainError(ctx, error)
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers privados
  // ---------------------------------------------------------------------------

  /**
   * `root` pasa por el atajo estándar de `RoleService.hasAccess`; el resto necesita
   * la fila real en `role_system_permissions` para el slug indicado. Server-side
   * SIEMPRE (S2): el BO solo oculta el botón, esto es lo que de verdad protege.
   */
  private async assertHasPermission(ctx: HttpContext, action: string): Promise<void> {
    const user = ctx.auth.user!
    if (!user.role) {
      await user.load('role')
    }
    const isRoot = user.role?.roleSlug === 'root'
    if (isRoot) return

    const roleService = new RoleService()
    const allowed = await roleService.hasAccess(user.roleId, PARENT_MODULE_SLUG, action)
    if (!allowed) {
      throw new ConsentError(
        'sin-permiso-consentimiento',
        'No tienes permiso para asentar consentimientos físicos.',
        CONSENT_ERROR_CODES.FORBIDDEN_PHYSICAL_CONSENT
      )
    }
  }

  private parseEmployeeId(raw: unknown): number {
    return this.parseId(raw, 'empleado-no-encontrado')
  }

  private parseId(raw: unknown, key: ConsentErrorKey): number {
    const id = Number(raw)
    if (!Number.isFinite(id) || id <= 0) {
      throw new ConsentError(
        key,
        'El identificador indicado es inválido.',
        CONSENT_ERROR_CODES.EMPLOYEE_NOT_FOUND
      )
    }
    return id
  }

  /**
   * Todo error de validación de Vine (body malformado, `type` fuera del enum,
   * `documentVersion`/`signedAt` con formato inválido) cae en el bucket genérico
   * `tipo-de-documento-invalido` / `CSNT.VAL.002` — mismo criterio que
   * `AcceptanceController` (el error de dominio específico solo lo lanza el service).
   */
  private validationError(ctx: HttpContext, error: unknown) {
    const { i18n } = ctx
    const vineMessages =
      error && typeof error === 'object' && (error as { code?: string }).code === 'E_VALIDATION_ERROR'
        ? (error as { messages?: Array<{ field: string; message: string; rule: string }> }).messages
        : undefined

    return ctx.response.status(422).json({
      type: 'error',
      title: i18n.formatMessage('consent.title'),
      message: i18n.formatMessage('consent.errors.tipo-de-documento-invalido.title'),
      detail:
        vineMessages?.[0]?.message ??
        (error instanceof Error
          ? error.message
          : i18n.formatMessage('consent.errors.tipo-de-documento-invalido.detail')),
      key: 'tipo-de-documento-invalido',
      code: CONSENT_ERROR_CODES.INVALID_TYPE,
      data: vineMessages ? { errors: vineMessages } : null,
    })
  }

  private domainError(ctx: HttpContext, error: unknown) {
    if (error instanceof ConsentError) {
      const { i18n } = ctx
      const status = CONSENT_ERROR_STATUS[error.key as ConsentErrorKey] ?? 500
      return ctx.response.status(status).json({
        type: 'error',
        title: i18n.formatMessage('consent.title'),
        message: i18n.formatMessage(`consent.errors.${error.key}.title`),
        detail: i18n.formatMessage(`consent.errors.${error.key}.detail`),
        key: error.key,
        code: error.code,
        data: null,
      })
    }
    throw error
  }
}
