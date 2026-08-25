import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ExcelJS from 'exceljs'
import type { Assert } from '@japa/assert'
import Employee from '#models/employee'
import Person from '#models/person'
import { maskSensitiveValue } from '#helpers/sensitive_mask'
import { CLEAR_FIXED } from './sensitive_read_by_category_support.js'

export const MASK_ECHO_RFC = maskSensitiveValue('VARL850602AB3', 'identificacion')!
export const MASK_ECHO_PHONE_SECONDARY = maskSensitiveValue(CLEAR_FIXED.phoneSecondary, 'contacto')!
export const MASK_ECHO_EMAIL = maskSensitiveValue(CLEAR_FIXED.email, 'contacto')!
export const MASK_CORRUPT_A = '•••X1234ABCD'
export const MASK_CORRUPT_B = 'VARL•50602AB3'
export const MASK_EDITED_CARD = '••••••••••••••9999'

export function assertMaskEchoAccepted(
  response: { status: () => number; body: () => Record<string, unknown> },
  assert: Assert
) {
  assert.equal(response.status(), 201)
  assert.notEqual(response.body()?.code, 'EMP.SENS.WRITE.FORBIDDEN')
  const messages = response.body()?.messages
  if (Array.isArray(messages)) {
    const flat = JSON.stringify(messages)
    assert.notInclude(flat, 'noMaskChar')
    assert.notInclude(flat, 'carácter de máscara')
  }
}

export function assertMaskCorruptionRejected(
  response: { status: () => number; body: () => Record<string, unknown> },
  assert: Assert
) {
  assert.isTrue(response.status() === 400 || response.status() === 422)
  assert.notEqual(response.body()?.code, 'EMP.SENS.WRITE.FORBIDDEN')
  assert.notEqual(response.body()?.code, 'EMP.SENS.WRITE.IMPORT_FORBIDDEN')
}

export function assertImportForbidden(
  response: { status: () => number; body: () => Record<string, unknown> },
  assert: Assert,
  categoryLabelEs: string
) {
  assert.equal(response.status(), 403)
  const body = response.body()
  assert.equal(body.code, 'EMP.SENS.WRITE.IMPORT_FORBIDDEN')
  assert.equal(body.key, 'el-archivo-contiene-datos-sensibles-que-no-puedes-modificar')
  assert.include(String(body.detail), categoryLabelEs)
  assert.include(String(body.detail), 'No se procesó ningún registro')
  assert.notInclude(JSON.stringify(body), 'NSS')
}

const FULL_HEADERS = [
  'ID Empleado',
  'Identificador de nómina',
  'Unidad de negocio de trabajo',
  'Unidad de negocio de nómina',
  'Nombre del empleado',
  'Apellido paterno del empleado',
  'Apellido materno del empleado',
  'Fecha de contratación (yyyy/mm/dd)',
  'Departamento',
  'Posición',
  'Salario diario',
  'Fecha de nacimiento (dd/mm/yyyy)',
  'CURP',
  'RFC',
  'NSS',
  'Correo empresa',
  'Correo personal',
  'Teléfono Empresa',
  'Teléfono Personal',
  'Modalidad de trabajo',
  '% Teletrabajo',
  'Nombre contacto emergencia',
  'Apellido paterno contacto emergencia',
  'Apellido materno contacto emergencia',
  'Parentesco contacto emergencia',
  'Teléfono contacto emergencia',
] as const

const MINIMAL_HEADERS = [
  'Identificador de nómina',
  'Unidad de negocio de trabajo',
  'Unidad de negocio de nómina',
  'Nombre del empleado',
  'Apellido paterno del empleado',
] as const

type BuildExcelOptions = {
  businessUnitName: string
  includeSensitiveColumns?: boolean
  nssValue?: string
  payrollNum?: string
  firstName?: string
  lastName?: string
}

export async function buildMinimalImportExcel(options: BuildExcelOptions) {
  const headers = options.includeSensitiveColumns === false ? [...MINIMAL_HEADERS] : [...FULL_HEADERS]
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Empleados')
  sheet.addRow(headers)

  const row = new Array(headers.length).fill('')
  const idx = (name: string) => headers.indexOf(name)
  if (idx('Identificador de nómina') >= 0) {
    row[idx('Identificador de nómina')] = options.payrollNum ?? `IMP-${Date.now()}`
  }
  if (idx('Unidad de negocio de trabajo') >= 0) {
    row[idx('Unidad de negocio de trabajo')] = options.businessUnitName
  }
  if (idx('Unidad de negocio de nómina') >= 0) {
    row[idx('Unidad de negocio de nómina')] = options.businessUnitName
  }
  if (idx('Nombre del empleado') >= 0) {
    row[idx('Nombre del empleado')] = options.firstName ?? 'Import'
  }
  if (idx('Apellido paterno del empleado') >= 0) {
    row[idx('Apellido paterno del empleado')] = options.lastName ?? 'Qa'
  }
  if (idx('NSS') >= 0) row[idx('NSS')] = options.nssValue ?? '12345678901'

  sheet.addRow(row)

  const dir = await mkdtemp(join(tmpdir(), 'mask-echo-import-'))
  const tmpPath = join(dir, 'import.xlsx')
  await workbook.xlsx.writeFile(tmpPath)
  const buffer = await readFile(tmpPath)
  return { tmpPath, dir, buffer }
}

export async function cleanupImportDir(dir: string) {
  await rm(dir, { recursive: true, force: true })
}

export async function countActiveEmployees(): Promise<number> {
  const row = await Employee.query().whereNull('employee_deleted_at').count('* as total')
  return Number(row[0].$extras.total)
}

export async function countActivePersons(): Promise<number> {
  const row = await Person.query().whereNull('person_deleted_at').count('* as total')
  return Number(row[0].$extras.total)
}
