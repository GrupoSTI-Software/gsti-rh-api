import type { Assert } from '@japa/assert'
import Person from '#models/person'
import EmployeeBank from '#models/employee_bank'
import { CLEAR_FIXED } from './sensitive_read_by_category_support.js'

export const RFC_ORIGINAL = CLEAR_FIXED.rfc
export const RFC_NUEVO = 'VARL850602AB3'
export const CURP_NUEVA = 'AAAA800101HDFRRN09'
export const TELEFONO_NUEVO = '5511111111'
export const CLABE_NUEVA = '012180009999999999'
export const MASK_ECHO = '•••••••••2AB3'

export function assertWriteForbidden(
  response: { status: () => number; body: () => Record<string, unknown> },
  assert: Assert,
  categoryLabelEs: string
) {
  assert.equal(response.status(), 403)
  const body = response.body()
  assert.equal(body.code, 'EMP.SENS.WRITE.FORBIDDEN')
  assert.equal(body.key, 'sin-permiso-para-modificar-datos-sensibles')
  assert.equal(body.title, 'Sin permiso para modificar datos sensibles')
  assert.include(String(body.detail), categoryLabelEs)
  assert.include(String(body.detail), 'Ningún dato de la petición se guardó')
  assert.notInclude(JSON.stringify(body), RFC_NUEVO)
  assert.notInclude(JSON.stringify(body), CLABE_NUEVA)
  assert.notInclude(JSON.stringify(body), '••••')
}

export function assertWriteUnresolved(
  response: { status: () => number; body: () => Record<string, unknown> },
  assert: Assert
) {
  assert.equal(response.status(), 403)
  const body = response.body()
  assert.equal(body.code, 'EMP.SENS.WRITE.UNRESOLVED')
  assert.equal(body.key, 'no-se-pudo-determinar-el-permiso-de-escritura')
  assert.notInclude(String(body.detail).toLowerCase(), 'identificacion')
  assert.notInclude(String(body.detail).toLowerCase(), 'clabe')
}

export function personUpdateBase(
  person: Person,
  extras: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    personFirstname: person.personFirstname,
    personLastname: person.personLastname,
    personSecondLastname: person.personSecondLastname ?? '',
    personGender: person.personGender ?? 'M',
    personBirthday: person.personBirthday ?? '1990-01-15',
    personMaritalStatus: person.personMaritalStatus ?? 'single',
    personPlaceOfBirthCountry: person.personPlaceOfBirthCountry ?? 'México',
    personPlaceOfBirthState: person.personPlaceOfBirthState ?? 'CDMX',
    personPlaceOfBirthCity: person.personPlaceOfBirthCity ?? 'CDMX',
    ...extras,
  }
}

export async function reloadPerson(personId: number): Promise<Person> {
  return Person.findOrFail(personId)
}

export async function reloadBank(employeeBankId: number): Promise<EmployeeBank> {
  return EmployeeBank.findOrFail(employeeBankId)
}
