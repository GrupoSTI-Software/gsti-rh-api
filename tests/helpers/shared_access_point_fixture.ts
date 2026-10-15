import { DateTime } from 'luxon'
import type { ApiClient } from '@japa/api-client'
import db from '@adonisjs/lucid/services/db'
import AccessPoint from '#models/access_point'
import AccessPointEmployee from '#models/access_point_employee'
import AccessPointProfile from '#models/access_point_profile'
import AccessPointShare from '#models/access_point_share'
import AdmsUnmappedPin from '#models/adms_unmapped_pin'
import ApiToken from '#models/api_token'
import BusinessUnit from '#models/business_unit'
import DeviceCommand from '#models/device_command'
import Employee from '#models/employee'
import PlatformDevice from '#models/platform_device'
import PlatformDeviceAssignment from '#models/platform_device_assignment'
import PlatformDeviceModel from '#models/platform_device_model'
import PlatformTenantGroup from '#models/platform_tenant_group'
import PlatformTenantGroupMember from '#models/platform_tenant_group_member'
import Person from '#models/person'
import Role from '#models/role'
import User from '#models/user'
import { TENANT_UNSCOPED_REASON } from '#constants/tenant_unscoped_reason'
import { TenantContext } from '#utils/tenant_context'
import {
  RELEASE_REASONS,
  type PlatformDeviceAssignmentReleaseReason,
} from '#constants/platform_device_assignment'
import DeviceCommandRepositoryMysql from '#modules/device-commands/device_command.repository.mysql'
import {
  DEVICE_COMMAND_KIND,
  type DeviceCommandKind,
  type DeviceCommandStatus,
} from '#modules/device-commands/device_command.constants'

export interface SharedFixture {
  ownerBu: number
  guestBu: number
  outsiderBu: number
  groupId: number
  accessPoint: AccessPoint
  share: AccessPointShare
  ownerEmployee: Employee
  guestEmployee: Employee
  ownerPin: '1'
  guestPin: '2'
  /** Unidad del inventario con la serie del checador (Tarea 10). */
  platformDeviceId: number
  /** Entrega abierta de la unidad a la responsable. */
  platformDeviceAssignmentId: number
  releaseReason: PlatformDeviceAssignmentReleaseReason
  zone: string
  ownerPublicId: string
  guestPublicId: string
  outsiderPublicId: string
  cleanup(): Promise<void>
}

interface PriorMembership {
  groupId: number
  businessUnitId: number
}

/**
 * Checador de una empresa compartido con otra del mismo grupo y una tercera
 * ajena (VLRH-P0065). Las membresias de grupo previas de las empresas se
 * restauran en `cleanup`.
 */
export async function createSharedAccessPointFixture(): Promise<SharedFixture> {
  const stamp = Date.now()
  const serial = `TEST-SHARE-${stamp}`
  const reason = TENANT_UNSCOPED_REASON.ACCESS_POINT_SHARING

  return TenantContext.runUnscoped(async () => {
    const rows = (await Employee.query()
      .whereNull('employee_deleted_at')
      .whereNotNull('business_unit_id')
      .orderBy('business_unit_id', 'asc')
      .orderBy('employee_id', 'asc')
      .select('employee_id', 'business_unit_id')) as Employee[]
    const firstByBu = new Map<number, number>()
    for (const row of rows) {
      if (!firstByBu.has(row.businessUnitId as number)) {
        firstByBu.set(row.businessUnitId as number, row.employeeId)
      }
    }
    const buIds = [...firstByBu.keys()].slice(0, 3)
    if (buIds.length < 3) {
      throw new Error('La fixture necesita tres empresas con al menos un empleado vivo')
    }
    const [ownerBu, guestBu, outsiderBu] = buIds
    const ownerEmployee = await Employee.findOrFail(firstByBu.get(ownerBu) as number)
    const guestEmployee = await Employee.findOrFail(firstByBu.get(guestBu) as number)

    // Una empresa solo puede estar en un grupo: se guarda y se libera.
    const prior = (await PlatformTenantGroupMember.query().whereIn('business_unit_id', [
      ownerBu,
      guestBu,
    ])) as PlatformTenantGroupMember[]
    const priorMemberships: PriorMembership[] = prior.map((member) => ({
      groupId: member.platformTenantGroupId,
      businessUnitId: member.businessUnitId,
    }))
    const restoreMemberships = async (): Promise<void> => {
      for (const membership of priorMemberships) {
        await PlatformTenantGroupMember.create({
          platformTenantGroupId: membership.groupId,
          businessUnitId: membership.businessUnitId,
        })
      }
    }
    if (prior.length > 0) {
      await PlatformTenantGroupMember.query()
        .whereIn('business_unit_id', [ownerBu, guestBu])
        .delete()
    }

    let groupId: number | null = null
    let accessPointId: number | null = null
    let platformDeviceId: number | null = null
    let createdModelId: number | null = null
    const deleteCreated = async (): Promise<void> => {
      const errors: unknown[] = []
      const step = async (fn: () => Promise<unknown>): Promise<void> => {
        try {
          await fn()
        } catch (error) {
          errors.push(error)
        }
      }
      if (accessPointId !== null) {
        const apId = accessPointId
        // Las checadas se identifican por la serie del checador (assist_terminal_sn).
        await step(() => db.from('assists').where('assist_terminal_sn', serial).delete())
        await step(() => db.from('adms_held_punches').where('access_point_id', apId).delete())
        await step(() => db.from('adms_unmapped_pins').where('access_point_id', apId).delete())
        await step(() => db.from('device_commands').where('access_point_id', apId).delete())
        await step(() => db.from('adms_incidents').where('access_point_id', apId).delete())
        await step(() => db.from('access_point_stamps').where('access_point_id', apId).delete())
        await step(() =>
          db.from('adms_raw_messages').where('adms_raw_message_serial', serial).delete()
        )
        await step(() => db.from('access_point_employees').where('access_point_id', apId).delete())
        await step(() => db.from('access_point_shares').where('access_point_id', apId).delete())
        await step(() => db.from('access_point_profiles').where('access_point_id', apId).delete())
        await step(() => db.from('access_points').where('access_point_id', apId).delete())
      }
      if (platformDeviceId !== null) {
        const deviceId = platformDeviceId
        await step(() =>
          db.from('platform_device_assignments').where('platform_device_id', deviceId).delete()
        )
        await step(() => db.from('platform_devices').where('platform_device_id', deviceId).delete())
      }
      if (createdModelId !== null) {
        const modelId = createdModelId
        await step(() =>
          db.from('platform_device_models').where('platform_device_model_id', modelId).delete()
        )
      }
      if (groupId !== null) {
        const gId = groupId
        await step(() =>
          db.from('platform_tenant_group_members').where('platform_tenant_group_id', gId).delete()
        )
        await step(() =>
          db.from('platform_tenant_groups').where('platform_tenant_group_id', gId).delete()
        )
      }
      await step(restoreMemberships)
      if (errors.length > 0) throw errors[0]
    }

    try {
      const group = new PlatformTenantGroup()
      group.platformTenantGroupName = serial
      group.platformTenantGroupActive = 1
      await group.save()
      groupId = group.platformTenantGroupId
      await PlatformTenantGroupMember.createMany([
        { platformTenantGroupId: group.platformTenantGroupId, businessUnitId: ownerBu },
        { platformTenantGroupId: group.platformTenantGroupId, businessUnitId: guestBu },
      ])

      // Unidad del inventario con la serie del checador y entrega abierta a la
      // responsable: sin ella el landlord no puede otorgar (VLRH-P0065, 3.2).
      let deviceModel = await PlatformDeviceModel.query().orderBy('platform_device_model_id').first()
      if (!deviceModel) {
        deviceModel = await PlatformDeviceModel.create({
          platformDeviceModelBrand: 'TestShare',
          platformDeviceModelName: `TestShare ${stamp}`,
          platformDeviceModelSlug: `test-share-${stamp}`,
          platformDeviceModelStatus: 'vigente',
          platformDeviceModelActive: 1,
        })
        createdModelId = deviceModel.platformDeviceModelId
      }
      const device = await PlatformDevice.create({
        platformDeviceModelId: deviceModel.platformDeviceModelId,
        platformDeviceSerialNumber: serial,
        platformDeviceOrigin: 'propia',
        platformDeviceStockStatus: 'asignada',
        platformDeviceAcquisitionCostCents: null,
        platformDeviceAcquisitionDate: null,
        platformDeviceActive: 1,
      })
      platformDeviceId = device.platformDeviceId
      const assignment = await PlatformDeviceAssignment.create({
        platformDeviceId: device.platformDeviceId,
        businessUnitId: ownerBu,
        platformDeviceAssignmentDeliveredAt: DateTime.now().minus({ days: 30 }).toISODate() as string,
        platformDeviceAssignmentReleasedAt: null,
        platformDeviceAssignmentTenureRegime: 'comodato',
        platformDeviceAssignmentSalePriceCents: null,
        platformDeviceAssignmentSaleCurrency: 'MXN',
        platformDeviceAssignmentCreatedByUserId: null,
      })

      const accessPoint = new AccessPoint()
      accessPoint.accessPointName = `Checador compartido ${stamp}`
      accessPoint.businessUnitId = ownerBu
      accessPoint.accessPointActive = 1
      accessPoint.accessPointSerialNumber = serial
      accessPoint.accessPointStatus = 0
      accessPoint.platformDeviceId = device.platformDeviceId
      await accessPoint.save() // el secreto de canal lo asigna el hook beforeCreate
      accessPointId = accessPoint.accessPointId

      const profile = new AccessPointProfile()
      profile.accessPointId = accessPoint.accessPointId
      profile.businessUnitId = ownerBu
      profile.accessPointProfileDialect = 'ta'
      profile.accessPointProfileLayoutKnown = 1
      profile.accessPointProfilePlatform = 'ZAM180_TFT'
      await profile.save()

      const share = new AccessPointShare()
      share.accessPointId = accessPoint.accessPointId
      share.businessUnitId = guestBu
      share.platformTenantGroupId = group.platformTenantGroupId
      share.accessPointShareGrantedAt = DateTime.utc()
      await share.save()

      const pivotFor = async (employee: Employee, pin: string, businessUnitId: number) => {
        const pivot = new AccessPointEmployee()
        pivot.accessPointId = accessPoint.accessPointId
        pivot.employeeId = employee.employeeId
        pivot.businessUnitId = businessUnitId
        pivot.accessPointEmployeePin = pin
        pivot.accessPointEmployeeSyncStatus = 'confirmed'
        await pivot.save()
      }
      await pivotFor(ownerEmployee, '1', ownerBu)
      await pivotFor(guestEmployee, '2', guestBu)

      const units = await BusinessUnit.query().whereIn('business_unit_id', [
        ownerBu,
        guestBu,
        outsiderBu,
      ])
      const publicIdOf = (id: number): string => {
        const unit = units.find((row) => row.businessUnitId === id)
        if (!unit) throw new Error(`La empresa ${id} no tiene id publico`)
        return String(unit.businessUnitPublicId)
      }

      return {
        ownerBu,
        guestBu,
        outsiderBu,
        groupId: group.platformTenantGroupId,
        accessPoint,
        share,
        ownerEmployee,
        guestEmployee,
        ownerPin: '1' as const,
        guestPin: '2' as const,
        platformDeviceId: device.platformDeviceId,
        platformDeviceAssignmentId: assignment.platformDeviceAssignmentId,
        releaseReason: RELEASE_REASONS[0],
        zone: accessPoint.accessPointTimezone ?? 'America/Mexico_City',
        ownerPublicId: publicIdOf(ownerBu),
        guestPublicId: publicIdOf(guestBu),
        outsiderPublicId: publicIdOf(outsiderBu),
        cleanup: () => TenantContext.runUnscoped(deleteCreated, reason),
      }
    } catch (error) {
      try {
        await deleteCreated()
      } catch {
        // se relanza el error original de la creacion
      }
      throw error
    }
  }, reason)
}

/**
 * Otro empleado vivo de la empresa, distinto de los dados (VLRH-P0065, Tarea 7).
 *
 * Se prefiere uno sin biometricos resguardados ni foto biometrica: el alta en el
 * checador copia lo que tenga, y una prueba de autorizacion no debe dejar
 * lecturas de boveda ni comandos de copia como rastro.
 */
export async function anotherLiveEmployee(
  businessUnitId: number,
  excludeIds: number[]
): Promise<Employee> {
  return TenantContext.runUnscoped(async () => {
    const base = () => {
      const query = Employee.query()
        .whereNull('employee_deleted_at')
        .where('business_unit_id', businessUnitId)
      if (excludeIds.length > 0) query.whereNotIn('employee_id', excludeIds)
      return query
    }
    const clean = await base()
      .whereNotExists((sub) =>
        sub
          .from('biometric_templates')
          .whereColumn('biometric_templates.employee_id', 'employees.employee_id')
      )
      .whereNotExists((sub) =>
        sub
          .from('employee_biometric_face_ids')
          .whereColumn('employee_biometric_face_ids.employee_id', 'employees.employee_id')
      )
      .orderBy('employee_id', 'asc')
      .first()
    const employee = clean ?? (await base().orderBy('employee_id', 'asc').first())
    if (!employee) {
      throw new Error(`La empresa ${businessUnitId} no tiene otro empleado vivo para la prueba`)
    }
    return employee
  }, TENANT_UNSCOPED_REASON.ACCESS_POINT_SHARING)
}

/**
 * PIN no mapeado pendiente del checador de la fixture, a nombre de la
 * responsable (VLRH-P0066, Tarea 8). Lo borra el cleanup de la fixture
 * (cuelga de su `access_point_id`).
 */
export async function seedUnmappedPin(fx: SharedFixture, pin: string): Promise<AdmsUnmappedPin> {
  return TenantContext.runUnscoped(async () => {
    const row = new AdmsUnmappedPin()
    row.accessPointId = fx.accessPoint.accessPointId
    row.businessUnitId = fx.ownerBu
    row.admsUnmappedPinPin = pin
    row.admsUnmappedPinName = null
    row.admsUnmappedPinFirstSeenAt = DateTime.utc().minus({ days: 1 })
    row.admsUnmappedPinLastSeenAt = DateTime.utc()
    row.admsUnmappedPinPunchCount = 1
    row.admsUnmappedPinBioTypesSeen = null
    row.admsUnmappedPinStatus = 'pending'
    await row.save()
    return row
  }, TENANT_UNSCOPED_REASON.ACCESS_POINT_SHARING)
}

/** Ruta de invitaciones de la entrega de la fixture en el landlord (Tarea 10). */
export function sharesUrl(fx: SharedFixture): string {
  return `/api/platform/device-assignments/${fx.platformDeviceAssignmentId}/shares`
}

/** Comandos del checador de la fixture por tipo y, si se pide, por estado. */
export async function commandsOf(
  fx: SharedFixture,
  kind: DeviceCommandKind,
  status?: DeviceCommandStatus
): Promise<DeviceCommand[]> {
  return TenantContext.runUnscoped(async () => {
    const query = DeviceCommand.query()
      .where('access_point_id', fx.accessPoint.accessPointId)
      .where('device_command_kind', kind)
      .orderBy('device_command_id', 'asc')
    if (status !== undefined) query.where('device_command_status', status)
    return await query.exec()
  }, TENANT_UNSCOPED_REASON.ACCESS_POINT_SHARING)
}

/** Templates resguardados del colaborador en la boveda. */
export async function countTemplates(employeeId: number): Promise<number> {
  const row = (await db
    .from('biometric_templates')
    .where('employee_id', employeeId)
    .count('* as total')
    .first()) as { total: number | string } | null
  return Number(row?.total ?? 0)
}

/**
 * Alta del empleado de la invitada todavia en cola cuando se revoca la
 * invitacion (foco de revision 2). Va sin `access_point_employee_id` a
 * proposito: es el caso que la cancelacion por vinculo no alcanza.
 */
export async function enqueuePendingUpsertForGuest(fx: SharedFixture): Promise<DeviceCommand> {
  const stamp = Date.now()
  const result = await TenantContext.run([fx.ownerBu, fx.guestBu], () =>
    new DeviceCommandRepositoryMysql().enqueueIdempotent(
      {
        accessPointId: fx.accessPoint.accessPointId,
        businessUnitId: fx.guestBu,
        kind: DEVICE_COMMAND_KIND.USER_UPSERT,
        payload: `DATA UPDATE USERINFO PIN=${fx.guestPin}\tName=Prueba`,
        pin: fx.guestPin,
        bioNo: null,
        priority: 3,
        maxAttempts: null,
        employeeId: fx.guestEmployee.employeeId,
        accessPointEmployeeId: null,
        correlationKey: `test-share-upsert-${stamp}`,
        requestedByUserId: null,
        biometricTemplateId: null,
        biometricPhotoPublicationId: null,
      },
      [stamp % 2_000_000_000]
    )
  )
  if (!result) throw new Error('No se pudo encolar el alta de prueba')
  return result.command
}

const PLATFORM_ADMIN_PASSWORD = 'SharedAccessPoint123!'

/** Administrador de plataforma con su token de consola (`origin = 'platform'`). */
export interface PlatformConsoleActor {
  user: User
  token: string
  cleanup(): Promise<void>
}

/**
 * Administrador de plataforma que entra por el login de la consola: `loginAs`
 * emite un token `web` y el guard `platformAdmin` lo rechaza con 403.
 */
export async function createPlatformConsoleActor(client: ApiClient): Promise<PlatformConsoleActor> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const email = `share-landlord-${stamp}@gsti-tests.local`
  const { user, person } = await TenantContext.runUnscoped(async () => {
    const role = await Role.query()
      .whereNull('role_deleted_at')
      .where('role_slug', 'root')
      .firstOrFail()
    const created = await Person.create({
      personFirstname: 'Share',
      personLastname: 'Landlord',
      personSecondLastname: stamp,
      personEmail: email,
    })
    const admin = await User.create({
      userEmail: email,
      userPassword: PLATFORM_ADMIN_PASSWORD,
      userActive: 1,
      isPlatformAdmin: true,
      roleId: role.roleId,
      personId: created.personId,
      userEmailType: 'institutional',
    })
    return { user: admin, person: created }
  }, TENANT_UNSCOPED_REASON.ACCESS_POINT_SHARING)

  const cleanup = (): Promise<void> =>
    TenantContext.runUnscoped(async () => {
      await ApiToken.query().where('tokenable_id', user.userId).delete()
      await User.query().where('user_id', user.userId).delete()
      await Person.query().where('person_id', person.personId).delete()
    }, TENANT_UNSCOPED_REASON.ACCESS_POINT_SHARING)

  const response = await client.post('/api/platform/auth/login').json({
    userEmail: email,
    userPassword: PLATFORM_ADMIN_PASSWORD,
  })
  const token = (response.body() as { data?: { token?: string } }).data?.token
  if (response.status() !== 200 || !token) {
    await cleanup()
    throw new Error(`Login de plataforma sin token (HTTP ${response.status()})`)
  }
  return { user, token, cleanup }
}
