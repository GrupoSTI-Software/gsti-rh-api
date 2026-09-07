import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import PlatformDevice from '#models/platform_device'
import PlatformDeviceAssignment, {
  type PlatformDeviceAssignmentTenureRegime,
} from '#models/platform_device_assignment'
import BusinessUnit from '#models/business_unit'
import { PLATFORM_DEVICE_ERROR_CODES } from '../constants/platform_device_error_codes.js'
import { PlatformDeviceServiceError } from '../exceptions/platform_device_service_error.js'
import PlatformDeviceAccessPointService, {
  type AccessPointPreloadOutcome,
  type PreloadedAccessPoint,
} from './platform_device_access_point_service.js'

export interface AssignmentRecord {
  assignmentId: number
  deviceId: number
  serialNumber: string
  tenant: { publicId: string; name: string }
  deliveredAt: string
  releasedAt: string | null
  deviceStatus: string
  /** Resultado de la precarga del punto de acceso del tenant (USRH1787189981879). */
  accessPointOutcome: AccessPointPreloadOutcome
  accessPoint: PreloadedAccessPoint
  /** Figura de tenencia bajo la que queda el equipo (USRH1787189981880). */
  tenureRegime: PlatformDeviceAssignmentTenureRegime
  salePriceCents: number | null
  saleCurrency: string
}

export interface AssignmentListItem {
  assignmentId: number
  deviceId: number
  serialNumber: string
  model: {
    id: number
    name: string
    slug: string
  }
  deliveredAt: string
  /** Figura de tenencia de esta entrega (USRH1787189981880). */
  tenureRegime: PlatformDeviceAssignmentTenureRegime
  salePriceCents: number | null
  saleCurrency: string
}

interface CreateAssignmentInput {
  platformDeviceId: number
  tenantPublicId: string
  deliveredAt: Date
  tenureRegime: PlatformDeviceAssignmentTenureRegime
  salePriceCents?: number
  createdByUserId?: number
}

interface ListAssignmentsInput {
  tenantPublicId: string
  status?: 'open' | 'all'
}

/**
 * Servicio de asignaciones de aparatos a empresas cliente.
 * Ref: USRH1787189981876 · §10 del spec.
 *
 * Invariante crítico: un aparato solo puede tener una entrega abierta a la vez
 * (released_at IS NULL). Se garantiza mediante bloqueo pesimista (forUpdate)
 * sobre la fila de `platform_devices` — que siempre existe — dentro de una
 * transacción. NUNCA se hace forUpdate sobre `platform_device_assignments`
 * porque sobre un conjunto vacío no bloquea nada y deja pasar dos peticiones
 * concurrentes.
 *
 * Secuencia de `createAssignment` (§10 del spec):
 *   1. Resolver tenant por publicId → 404 si no existe.
 *   2. Verificar bandera de biométricos → 422 si apagada.
 *   3. forUpdate sobre platform_devices → 404 si no existe la unidad.
 *   3.5. Reglas cruzadas régimen↔precio↔origen → 422 (USRH1787189981880).
 *   4. Verificar status = 'disponible' → 422 con nombre del tenant actual.
 *   5. Cinturón: contar asignaciones abiertas → 422 si > 0.
 *   6. Crear asignación con released_at = null.
 *   7. Cambiar status a 'asignada' y guardar.
 *   8. Precargar (crear o adoptar) el access_point del tenant, amarrado por
 *      platformDeviceId (USRH1787189981879 · §10 del spec).
 *   Si cualquier paso falla, la transacción hace rollback completo.
 */
export default class PlatformDeviceAssignmentService {
  private readonly accessPointService = new PlatformDeviceAccessPointService()

  /**
   * Registra la entrega de un aparato disponible a un tenant.
   * Operación atómica: asignación + cambio de estado en una sola transacción.
   *
   * @throws PlatformDeviceServiceError 404 — tenant no encontrado.
   * @throws PlatformDeviceServiceError 422 — tenant sin habilitación de biométricos.
   * @throws PlatformDeviceServiceError 404 — unidad no encontrada.
   * @throws PlatformDeviceServiceError 422 — unidad no disponible (ya asignada/retirada).
   */
  async createAssignment(input: CreateAssignmentInput): Promise<AssignmentRecord> {
    return db.transaction(async (trx) => {
      // Paso 1: resolver el tenant por su identificador público
      const tenant = await BusinessUnit.query({ client: trx })
        .where('business_unit_public_id', input.tenantPublicId)
        .whereNull('business_unit_deleted_at')
        .first()

      if (!tenant) {
        throw new PlatformDeviceServiceError(
          `Tenant ${input.tenantPublicId} no encontrado`,
          PLATFORM_DEVICE_ERROR_CODES.TENANT_NOT_FOUND,
          404,
          PLATFORM_DEVICE_ERROR_CODES.TENANT_NOT_FOUND,
          'La empresa no existe en el sistema.'
        )
      }

      // Paso 2: verificar la bandera de biométricos en sitio (RN7)
      // La verificación es de servidor — ocultar la sección en pantalla no protege.
      if (!tenant.businessUnitHasBiometrics) {
        throw new PlatformDeviceServiceError(
          `Tenant ${tenant.businessUnitName} no tiene biométricos habilitados`,
          PLATFORM_DEVICE_ERROR_CODES.ASSIGN_TENANT_NOT_ENABLED,
          422,
          PLATFORM_DEVICE_ERROR_CODES.ASSIGN_TENANT_NOT_ENABLED,
          'Esta empresa no tiene habilitada la función de biométricos en sitio.'
        )
      }

      // Paso 3: bloquear la fila del aparato (forUpdate sobre fila que SIEMPRE existe).
      // Esto es lo que evita dos asignaciones simultáneas — la segunda petición
      // queda bloqueada aquí hasta que la primera haga commit.
      const device = await PlatformDevice.query({ client: trx })
        .where('platform_device_id', input.platformDeviceId)
        .whereNull('platform_device_deleted_at')
        .preload('deviceModel')
        .forUpdate()
        .first()

      if (!device) {
        throw new PlatformDeviceServiceError(
          `Aparato ${input.platformDeviceId} no encontrado`,
          PLATFORM_DEVICE_ERROR_CODES.DEVICE_NOT_FOUND,
          404,
          PLATFORM_DEVICE_ERROR_CODES.DEVICE_NOT_FOUND,
          'El aparato del inventario no existe o fue dado de baja.'
        )
      }

      // Paso 3.5: reglas cruzadas régimen↔precio↔origen (USRH1787189981880).
      // Van antes de la verificación de disponibilidad: son errores de forma
      // sobre el input, independientes de si el aparato está libre o no.
      this.validateTenureRegime(input.tenureRegime, input.salePriceCents, device.platformDeviceOrigin)

      // Paso 4: verificar que el aparato esté disponible (con el lock ya tomado)
      if (device.platformDeviceStockStatus !== 'disponible') {
        // Leer la asignación abierta para informar al operador quién tiene el aparato
        const openAssignment = await PlatformDeviceAssignment.query({ client: trx })
          .where('platform_device_id', input.platformDeviceId)
          .whereNull('platform_device_assignment_released_at')
          .whereNull('platform_device_assignment_deleted_at')
          .preload('businessUnit')
          .first()

        const tenantName = openAssignment?.businessUnit?.businessUnitName ?? 'otro tenant'
        const since = openAssignment?.platformDeviceAssignmentDeliveredAt ?? 'fecha desconocida'

        throw new PlatformDeviceServiceError(
          `Aparato ${input.platformDeviceId} no disponible`,
          PLATFORM_DEVICE_ERROR_CODES.ASSIGN_NOT_AVAILABLE,
          422,
          PLATFORM_DEVICE_ERROR_CODES.ASSIGN_NOT_AVAILABLE,
          `La unidad ya está asignada a «${tenantName}» desde el ${since}. Debe desasignarse antes de volver a colocarla.`
        )
      }

      // Paso 5: cinturón — contar asignaciones abiertas (doble verificación)
      const openCount = await PlatformDeviceAssignment.query({ client: trx })
        .where('platform_device_id', input.platformDeviceId)
        .whereNull('platform_device_assignment_released_at')
        .whereNull('platform_device_assignment_deleted_at')
        .count('* as total')
        .then((rows) => Number(rows[0].$extras.total))

      if (openCount > 0) {
        throw new PlatformDeviceServiceError(
          `Aparato ${input.platformDeviceId} ya tiene una entrega abierta`,
          PLATFORM_DEVICE_ERROR_CODES.ASSIGN_NOT_AVAILABLE,
          422,
          PLATFORM_DEVICE_ERROR_CODES.ASSIGN_NOT_AVAILABLE,
          'La unidad ya está asignada. Debe desasignarse antes de volver a colocarla.'
        )
      }

      // Paso 6: crear la asignación (entrega abierta: releasedAt = null)
      const deliveredAtStr = DateTime.fromJSDate(input.deliveredAt).toISODate()!

      const assignment = await PlatformDeviceAssignment.create(
        {
          platformDeviceId: input.platformDeviceId,
          businessUnitId: tenant.businessUnitId,
          platformDeviceAssignmentDeliveredAt: deliveredAtStr,
          platformDeviceAssignmentReleasedAt: null,
          platformDeviceAssignmentTenureRegime: input.tenureRegime,
          platformDeviceAssignmentSalePriceCents: input.salePriceCents ?? null,
          // Explícita, aunque la columna tenga defaultTo('MXN'): así el
          // registro devuelto en la misma respuesta no depende de refrescar
          // el modelo desde BD para reflejar el default.
          platformDeviceAssignmentSaleCurrency: 'MXN',
          platformDeviceAssignmentCreatedByUserId: input.createdByUserId ?? null,
        },
        { client: trx }
      )

      // Paso 7: cambiar el estado del aparato a 'asignada'
      device.useTransaction(trx)
      device.platformDeviceStockStatus = 'asignada'
      await device.save()

      // Paso 8: precargar (crear o adoptar) el access_point del tenant.
      // Dentro de la misma transacción, después del lock: si falla, revierte
      // asignación + cambio de status completos (USRH1787189981879 · CA-4).
      const preload = await this.accessPointService.preload({
        businessUnitId: tenant.businessUnitId,
        platformDeviceId: device.platformDeviceId,
        serialNumber: device.platformDeviceSerialNumber,
        modelName: device.deviceModel.platformDeviceModelName,
        trx,
      })

      return {
        assignmentId: assignment.platformDeviceAssignmentId,
        deviceId: device.platformDeviceId,
        serialNumber: device.platformDeviceSerialNumber,
        tenant: {
          publicId: tenant.businessUnitPublicId,
          name: tenant.businessUnitName,
        },
        deliveredAt: deliveredAtStr,
        releasedAt: null,
        deviceStatus: 'asignada',
        accessPointOutcome: preload.outcome,
        accessPoint: preload.accessPoint,
        tenureRegime: assignment.platformDeviceAssignmentTenureRegime,
        salePriceCents: assignment.platformDeviceAssignmentSalePriceCents,
        saleCurrency: assignment.platformDeviceAssignmentSaleCurrency,
      }
    })
  }

  /**
   * Reglas cruzadas régimen↔precio↔origen (USRH1787189981880 · reglas 2-5).
   * Vine solo valida forma (enum, entero positivo); la coherencia de negocio
   * vive aquí, antes de persistir nada.
   *
   * @throws PlatformDeviceServiceError 422 SALE_PRICE_REQUIRED — venta sin precio.
   * @throws PlatformDeviceServiceError 422 SALE_PRICE_NOT_ALLOWED — precio con régimen que no lo admite.
   * @throws PlatformDeviceServiceError 422 TENURE_REGIME_NOT_ALLOWED_FOR_ORIGIN — régimen incompatible con el origen.
   */
  private validateTenureRegime(
    tenureRegime: PlatformDeviceAssignmentTenureRegime,
    salePriceCents: number | undefined,
    origin: PlatformDevice['platformDeviceOrigin']
  ): void {
    // Regla 2: precio obligatorio si régimen = venta.
    if (tenureRegime === 'venta' && (salePriceCents === undefined || salePriceCents === null)) {
      throw new PlatformDeviceServiceError(
        'Falta el precio de venta para régimen "venta"',
        PLATFORM_DEVICE_ERROR_CODES.SALE_PRICE_REQUIRED,
        422,
        PLATFORM_DEVICE_ERROR_CODES.SALE_PRICE_REQUIRED,
        'El precio de venta es obligatorio cuando el régimen de tenencia es venta.'
      )
    }

    // Regla 3: precio NO aceptado si régimen ≠ venta. Es error, no se ignora.
    if (tenureRegime !== 'venta' && salePriceCents !== undefined && salePriceCents !== null) {
      throw new PlatformDeviceServiceError(
        `Se envió precio de venta con régimen "${tenureRegime}"`,
        PLATFORM_DEVICE_ERROR_CODES.SALE_PRICE_NOT_ALLOWED,
        422,
        PLATFORM_DEVICE_ERROR_CODES.SALE_PRICE_NOT_ALLOWED,
        'El precio de venta solo se admite cuando el régimen de tenencia es venta.'
      )
    }

    // Reglas 4 y 5: el origen de la unidad restringe qué régimen es admisible.
    if (origin === 'del_cliente' && tenureRegime !== 'propiedad_cliente') {
      throw new PlatformDeviceServiceError(
        `Régimen "${tenureRegime}" no admitido para unidad de origen del_cliente`,
        PLATFORM_DEVICE_ERROR_CODES.TENURE_REGIME_NOT_ALLOWED_FOR_ORIGIN,
        422,
        PLATFORM_DEVICE_ERROR_CODES.TENURE_REGIME_NOT_ALLOWED_FOR_ORIGIN,
        'Una unidad cuyo origen es del cliente solo admite el régimen "propiedad del cliente".'
      )
    }

    if (origin === 'propia' && tenureRegime === 'propiedad_cliente') {
      throw new PlatformDeviceServiceError(
        'Régimen "propiedad_cliente" no admitido para unidad de origen propia',
        PLATFORM_DEVICE_ERROR_CODES.TENURE_REGIME_NOT_ALLOWED_FOR_ORIGIN,
        422,
        PLATFORM_DEVICE_ERROR_CODES.TENURE_REGIME_NOT_ALLOWED_FOR_ORIGIN,
        'Una unidad propia de GSTI no admite el régimen "propiedad del cliente"; solo comodato o venta.'
      )
    }
  }

  /**
   * Lista las asignaciones de un tenant.
   * Por defecto solo las abiertas (`status=open`). `status=all` incluye
   * el historial completo (para futuras pantallas de historial).
   *
   * Sin paginación: un tenant tiene unidades, no cientos (§11 del spec).
   */
  async listByTenant(input: ListAssignmentsInput): Promise<AssignmentListItem[]> {
    const tenant = await BusinessUnit.query()
      .where('business_unit_public_id', input.tenantPublicId)
      .whereNull('business_unit_deleted_at')
      .first()

    if (!tenant) {
      throw new PlatformDeviceServiceError(
        `Tenant ${input.tenantPublicId} no encontrado`,
        PLATFORM_DEVICE_ERROR_CODES.TENANT_NOT_FOUND,
        404,
        PLATFORM_DEVICE_ERROR_CODES.TENANT_NOT_FOUND,
        'La empresa no existe en el sistema.'
      )
    }

    // Verificar bandera de biométricos también en el listado (CA-8)
    if (!tenant.businessUnitHasBiometrics) {
      throw new PlatformDeviceServiceError(
        `Tenant ${tenant.businessUnitName} no tiene biométricos habilitados`,
        PLATFORM_DEVICE_ERROR_CODES.ASSIGN_TENANT_NOT_ENABLED,
        422,
        PLATFORM_DEVICE_ERROR_CODES.ASSIGN_TENANT_NOT_ENABLED,
        'Esta empresa no tiene habilitada la función de biométricos en sitio.'
      )
    }

    const query = PlatformDeviceAssignment.query()
      .where('business_unit_id', tenant.businessUnitId)
      .whereNull('platform_device_assignment_deleted_at')
      .preload('device', (q) => q.preload('deviceModel'))
      .orderBy('platform_device_assignment_delivered_at', 'desc')

    if (!input.status || input.status === 'open') {
      query.whereNull('platform_device_assignment_released_at')
    }

    const assignments = await query

    return assignments.map((a) => ({
      assignmentId: a.platformDeviceAssignmentId,
      deviceId: a.platformDeviceId,
      serialNumber: a.device.platformDeviceSerialNumber,
      model: {
        id: a.device.deviceModel.platformDeviceModelId,
        name: a.device.deviceModel.platformDeviceModelName,
        slug: a.device.deviceModel.platformDeviceModelSlug,
      },
      deliveredAt: a.platformDeviceAssignmentDeliveredAt,
      tenureRegime: a.platformDeviceAssignmentTenureRegime,
      salePriceCents: a.platformDeviceAssignmentSalePriceCents,
      saleCurrency: a.platformDeviceAssignmentSaleCurrency,
    }))
  }
}
