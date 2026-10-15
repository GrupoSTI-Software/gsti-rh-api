import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import AccessPoint from '#models/access_point'
import AccessPointEmployee from '#models/access_point_employee'
import AccessPointProfile from '#models/access_point_profile'
import AccessPointShare from '#models/access_point_share'
import Employee from '#models/employee'
import PlatformTenantGroup from '#models/platform_tenant_group'
import PlatformTenantGroupMember from '#models/platform_tenant_group_member'
import { TENANT_UNSCOPED_REASON } from '#constants/tenant_unscoped_reason'
import { TenantContext } from '#utils/tenant_context'

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

      const accessPoint = new AccessPoint()
      accessPoint.accessPointName = `Checador compartido ${stamp}`
      accessPoint.businessUnitId = ownerBu
      accessPoint.accessPointActive = 1
      accessPoint.accessPointSerialNumber = serial
      accessPoint.accessPointStatus = 0
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
