import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import PlatformDevice from '#models/platform_device'
import PlatformDeviceAssignment from '#models/platform_device_assignment'
import BusinessUnit from '#models/business_unit'
import { PLATFORM_DEVICE_ERROR_CODES } from '../constants/platform_device_error_codes.js'
import { PlatformDeviceServiceError } from '../exceptions/platform_device_service_error.js'

export interface AssignmentRecord {
  assignmentId: number
  deviceId: number
  serialNumber: string
  tenant: { publicId: string; name: string }
  deliveredAt: string
  releasedAt: string | null
  deviceStatus: string
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
}

interface CreateAssignmentInput {
  platformDeviceId: number
  tenantPublicId: string
  deliveredAt: Date
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
 *   4. Verificar status = 'disponible' → 422 con nombre del tenant actual.
 *   5. Cinturón: contar asignaciones abiertas → 422 si > 0.
 *   6. Crear asignación con released_at = null.
 *   7. Cambiar status a 'asignada' y guardar.
 *   Si cualquier paso falla, la transacción hace rollback completo.
 */
export default class PlatformDeviceAssignmentService {
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
          platformDeviceAssignmentCreatedByUserId: input.createdByUserId ?? null,
        },
        { client: trx }
      )

      // Paso 7: cambiar el estado del aparato a 'asignada'
      device.useTransaction(trx)
      device.platformDeviceStockStatus = 'asignada'
      await device.save()

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
      }
    })
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
    }))
  }
}
