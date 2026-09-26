import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { DateTime } from 'luxon'
import PlatformDevice, {
  type PlatformDeviceRetireReason,
  type PlatformDeviceStockStatus,
} from '#models/platform_device'
import PlatformDeviceAssignment, {
  type PlatformDeviceAssignmentTenureRegime,
} from '#models/platform_device_assignment'
import BusinessUnit from '#models/business_unit'
import { PLATFORM_DEVICE_ERROR_CODES } from '../constants/platform_device_error_codes.js'
import { PlatformDeviceServiceError } from '../exceptions/platform_device_service_error.js'
import type { PlatformDeviceAssignmentReleaseReason } from '../constants/platform_device_assignment.js'
import { toBusinessDateString, toCalendarIsoDate } from '../utils/business_date.js'
import PlatformDeviceAccessPointService, {
  type AccessPointPreloadOutcome,
  type AccessPointDeactivateOutcome,
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

interface UnassignDeviceInput {
  releasedAt: Date
  releaseReason: PlatformDeviceAssignmentReleaseReason
}

/** Forma que devuelve `unassign()` (§11 del spec USRH1787189981881). */
export interface UnassignmentRecord {
  assignment: {
    id: number
    tenantPublicId: string
    deliveredAt: string
    releasedAt: string
    releaseReason: PlatformDeviceAssignmentReleaseReason
    tenureRegime: PlatformDeviceAssignmentTenureRegime
  }
  device: {
    id: number
    serialNumber: string
    stockStatus: PlatformDeviceStockStatus
    retireReason: PlatformDeviceRetireReason | null
  }
  /** Desenlace de la desactivación del punto de acceso del tenant (USRH1787189981883). */
  accessPointOutcome: AccessPointDeactivateOutcome
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
   * Cierra la entrega vigente de un aparato y resuelve su destino
   * (USRH1787189981881 · §10 del spec).
   *
   * Máquina de tres salidas mutuamente excluyentes, en este orden de
   * precedencia (regla explícita del spec cuando concurren 5 y 6):
   *   1. Régimen `venta` → `retirada` con motivo `vendido` (regla 5).
   *   2. Origen `del_cliente` → `retirada` con motivo `del_cliente` (regla 6),
   *      cualquiera que sea el motivo de liberación capturado.
   *   3. Cualquier otro caso → `disponible` (regla 4).
   *
   * Mismo patrón transaccional que `createAssignment`: `forUpdate()` sobre
   * la fila **padre** de `platform_devices` (que siempre existe), nunca
   * sobre el rango de `platform_device_assignments` (gotcha 9 del spec:
   * un rango vacío no bloquea nada).
   *
   * @throws PlatformDeviceServiceError 404 — unidad no encontrada.
   * @throws PlatformDeviceServiceError 422 — sin entrega vigente que cerrar.
   * @throws PlatformDeviceServiceError 422 — fecha de liberación fuera de rango.
   */
  async unassign(
    platformDeviceId: number,
    input: UnassignDeviceInput
  ): Promise<UnassignmentRecord> {
    return db.transaction(async (trx) => {
      // Bloquear la fila del aparato — misma razón que en createAssignment:
      // evita que dos cierres concurrentes pisen el mismo estado.
      const device = await PlatformDevice.query({ client: trx })
        .where('platform_device_id', platformDeviceId)
        .whereNull('platform_device_deleted_at')
        .forUpdate()
        .first()

      if (!device) {
        throw new PlatformDeviceServiceError(
          `Aparato ${platformDeviceId} no encontrado`,
          PLATFORM_DEVICE_ERROR_CODES.DEVICE_NOT_FOUND,
          404,
          PLATFORM_DEVICE_ERROR_CODES.DEVICE_NOT_FOUND,
          'El aparato del inventario no existe o fue dado de baja.'
        )
      }

      // Con la fila padre ya bloqueada, buscar la entrega vigente (regla 8).
      const assignment = await PlatformDeviceAssignment.query({ client: trx })
        .where('platform_device_id', platformDeviceId)
        .whereNull('platform_device_assignment_released_at')
        .whereNull('platform_device_assignment_deleted_at')
        .preload('businessUnit')
        .first()

      if (!assignment) {
        throw new PlatformDeviceServiceError(
          `Aparato ${platformDeviceId} no tiene entrega vigente`,
          PLATFORM_DEVICE_ERROR_CODES.NO_OPEN_ASSIGNMENT,
          422,
          PLATFORM_DEVICE_ERROR_CODES.NO_OPEN_ASSIGNMENT,
          'La unidad no tiene una asignación vigente que cerrar.'
        )
      }

      // Regla 2: releasedAt ∈ [deliveredAt de ESTA asignación, hoy en zona de negocio].
      // A propósito el mismo error de negocio para ambos bordes (CA-6 del spec).
      //
      // `deliveredAt` se releyó de BD (no es el objeto recién creado en memoria):
      // el driver mysql2 decodifica la columna DATE como `Date` de JS, no como
      // string, aunque el tipo declarado en el modelo diga `string` (gotcha
      // documentado en business_date.ts:38-46). Sin normalizar con
      // `toCalendarIsoDate`, la comparación de rango de abajo pasa siempre
      // como verdadera sin lanzar error — verificado manualmente, ver commit.
      const releasedAtStr = DateTime.fromJSDate(input.releasedAt).toISODate()!
      const todayStr = toBusinessDateString()
      const deliveredAtStr = toCalendarIsoDate(assignment.platformDeviceAssignmentDeliveredAt)!

      if (releasedAtStr < deliveredAtStr || releasedAtStr > todayStr) {
        throw new PlatformDeviceServiceError(
          `Fecha de liberación ${releasedAtStr} fuera de rango para la asignación ${assignment.platformDeviceAssignmentId}`,
          PLATFORM_DEVICE_ERROR_CODES.RELEASE_DATE_INVALID,
          422,
          PLATFORM_DEVICE_ERROR_CODES.RELEASE_DATE_INVALID,
          'La fecha de regreso no puede ser anterior a la fecha de entrega ni posterior a hoy.'
        )
      }

      // Cerrar la entrega — nunca se borra ni se sobrescribe (regla 3).
      assignment.useTransaction(trx)
      assignment.platformDeviceAssignmentReleasedAt = releasedAtStr
      assignment.platformDeviceAssignmentReleaseReason = input.releaseReason
      await assignment.save()

      // Resolver el destino de la unidad (reglas 4, 5, 6 — precedencia fijada arriba).
      device.useTransaction(trx)
      if (assignment.platformDeviceAssignmentTenureRegime === 'venta') {
        device.platformDeviceStockStatus = 'retirada'
        device.platformDeviceRetireReason = 'vendido'
        device.platformDeviceRetiredAt = releasedAtStr
      } else if (device.platformDeviceOrigin === 'del_cliente') {
        device.platformDeviceStockStatus = 'retirada'
        device.platformDeviceRetireReason = 'del_cliente'
        device.platformDeviceRetiredAt = releasedAtStr
      } else {
        device.platformDeviceStockStatus = 'disponible'
      }
      await device.save()

      // Punto de extensión declarado (§9 del spec 1881): "Desactivar el punto
      // de acceso del tenant al desasignar la unidad" (USRH1787189981883)
      // engancha aquí, dentro de la misma transacción, después de cerrar la
      // asignación y antes del commit. Si falla, se traduce a un error de
      // dominio 422 dentro de esta MISMA transacción para que Lucid revierta
      // el cierre completo (RN5 del spec 1883, CA-7): un punto de acceso
      // encendido que nadie detecta es peor que reintentar la desasignación.
      let accessPointOutcome: AccessPointDeactivateOutcome
      try {
        accessPointOutcome = await this.onAssignmentClosed(assignment, trx)
      } catch (error) {
        if (error instanceof PlatformDeviceServiceError) {
          throw error
        }
        throw new PlatformDeviceServiceError(
          `Falló la desactivación del punto de acceso al cerrar la asignación ${assignment.platformDeviceAssignmentId}`,
          PLATFORM_DEVICE_ERROR_CODES.AP_DEACTIVATE_FAILED,
          422,
          PLATFORM_DEVICE_ERROR_CODES.AP_DEACTIVATE_FAILED,
          'No fue posible desactivar el punto de acceso del cliente. La desasignación se revirtió por completo.'
        )
      }

      return {
        assignment: {
          id: assignment.platformDeviceAssignmentId,
          tenantPublicId: assignment.businessUnit.businessUnitPublicId,
          deliveredAt: deliveredAtStr,
          releasedAt: assignment.platformDeviceAssignmentReleasedAt!,
          releaseReason: assignment.platformDeviceAssignmentReleaseReason!,
          tenureRegime: assignment.platformDeviceAssignmentTenureRegime,
        },
        device: {
          id: device.platformDeviceId,
          serialNumber: device.platformDeviceSerialNumber,
          stockStatus: device.platformDeviceStockStatus,
          retireReason: device.platformDeviceRetireReason,
        },
        accessPointOutcome,
      }
    })
  }

  /**
   * Desactiva el punto de acceso del tenant ligado a la unidad al cerrar su
   * entrega (USRH1787189981883 · §9 del spec 1881, §10 del spec 1883).
   *
   * Delega en `PlatformDeviceAccessPointService.deactivateForDevice`, que
   * corre bajo `TenantContext.runUnscoped` (el panel de plataforma no tiene
   * `businessScope` propio) y decide `'desactivado'` vs `'ausente'` por una
   * lectura previa, nunca por las filas afectadas del `UPDATE` — ver
   * docblock de ese método para el detalle de las reglas RN1, RN4-RN6, RN9.
   *
   * No se envuelve en try/catch aquí: cualquier excepción se propaga a
   * `unassign()`, que es quien decide cómo traducirla a un error de dominio
   * y quien controla el `db.transaction` que debe revertirse completo.
   */
  private async onAssignmentClosed(
    assignment: PlatformDeviceAssignment,
    trx: TransactionClientContract
  ): Promise<AccessPointDeactivateOutcome> {
    return this.accessPointService.deactivateForDevice(
      assignment.platformDeviceId,
      assignment.businessUnitId,
      trx
    )
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
