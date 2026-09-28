import { test } from '@japa/runner'
import i18nManager from '@adonisjs/i18n/services/main'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import Employee from '#models/employee'
import Person from '#models/person'
import EmployeeService from '#services/employee_service'
import { LogStore } from '#models/MongoDB/log_store'
import type BiometricEmployeeInterface from '../../../app/interfaces/biometric_employee_interface.js'
import type { PersonReleaseContext } from '#helpers/person_release_guard'

/**
 * USRH1789698261608 — D2 / CA-9: el catch de `syncCreate` ya no borra a
 * ciegas con `deletePersonById`; pasa por `releasePersonIfOrphan`.
 *
 *  - La persona PREEXISTENTE que llegó del API de biométricos (`personId`)
 *    se conserva: cae fuera de ventana. Cambio de comportamiento deliberado,
 *    confirmado con Noé antes de esta tarea.
 *  - La persona CREADA en el mismo acto (sin `personId`) sí se libera.
 *
 * El fallo se fuerza con un `departmentId` inexistente: la FK truena al
 * guardar el empleado, después de resolver la persona.
 */

const STAMP = `${Date.now()}-${Math.floor(Math.random() * 100000)}`
const RELEASE_CONTEXT: PersonReleaseContext = { actorUserId: 11, businessUnitScope: [1] }

function getService(): EmployeeService {
  return new EmployeeService(i18nManager.locale(i18nManager.defaultLocale))
}

async function getTemplateEmployee(): Promise<Employee> {
  const template = await Employee.query().whereNull('employee_deleted_at').first()
  if (!template) {
    throw new Error('La BD de pruebas no tiene empleados para usar de plantilla')
  }
  return template
}

function buildBiometricPayload(
  template: Employee,
  suffix: string,
  personId?: number
): BiometricEmployeeInterface {
  return {
    id: 0,
    empCode: 0,
    firstName: `SyncRel-${suffix}-${STAMP}`,
    lastName: 'Test',
    secondLastName: suffix,
    payrollNum: `PN-SYNC-${suffix}-${STAMP}`,
    hireDate: DateTime.fromISO('2024-01-15'),
    companyId: template.companyId,
    departmentId: 99999999,
    positionId: Number(template.positionId),
    gender: 'M',
    photo: '',
    usersResponsible: [],
    businessUnitId: template.businessUnitId,
    personId,
  }
}

async function personDeletedAt(personId: number): Promise<unknown> {
  const row = await db
    .from('people')
    .where('person_id', personId)
    .select('person_deleted_at')
    .first()
  return row?.person_deleted_at ?? null
}

test.group('EmployeeService.syncCreate — compensación blindada (USRH1789698261608 D2)', (group) => {
  let originalSet: typeof LogStore.set

  group.each.setup(() => {
    originalSet = LogStore.set
    LogStore.set = async () => {}
  })

  group.each.teardown(() => {
    LogStore.set = originalSet
  })

  test('la persona preexistente del biométrico se conserva cuando el alta falla', async ({
    assert,
    cleanup,
  }) => {
    const person = await Person.create({
      personFirstname: 'SyncRel',
      personLastname: 'Preexistente',
      personSecondLastname: STAMP,
      personEmail: `sync-pre-${STAMP}@gsti-tests.local`,
    })
    cleanup(async () => {
      await db.from('people').where('person_id', person.personId).delete()
    })
    await db
      .from('people')
      .where('person_id', person.personId)
      .update({
        person_created_at: DateTime.now().minus({ days: 2 }).toUTC().toFormat('yyyy-MM-dd HH:mm:ss'),
      })

    const template = await getTemplateEmployee()
    const payload = buildBiometricPayload(template, 'pre', person.personId)

    await assert.rejects(() => getService().syncCreate(payload, RELEASE_CONTEXT))

    assert.isNull(await personDeletedAt(person.personId))
    const rows = await db.from('employees').where('person_id', person.personId).count('* as total')
    assert.equal(Number(rows[0].total), 0)
  })

  test('la persona creada en el mismo acto se libera cuando el alta falla', async ({
    assert,
    cleanup,
  }) => {
    const template = await getTemplateEmployee()
    const payload = buildBiometricPayload(template, 'nueva')
    cleanup(async () => {
      await db.from('people').where('person_firstname', payload.firstName).delete()
    })

    await assert.rejects(() => getService().syncCreate(payload, RELEASE_CONTEXT))

    const created = await Person.query()
      .withTrashed()
      .where('person_firstname', payload.firstName)
      .firstOrFail()
    assert.isNotNull(await personDeletedAt(created.personId))
  })
})
