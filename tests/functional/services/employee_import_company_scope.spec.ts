import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ExcelJS from 'exceljs'
import { test } from '@japa/runner'
import i18nManager from '@adonisjs/i18n/services/main'
import BusinessUnit from '#models/business_unit'
import Employee from '#models/employee'
import Person from '#models/person'
import EmployeeService from '#services/employee_service'
import { SensitiveAccessContext } from '#utils/sensitive_access_context'

/**
 * USRH1789747321650 — rechazo de carga masiva por empresa distinta.
 * Nivel servicio (como employee_import_quota.spec.ts): el 422 HTTP ya está
 * fijado en unitarios; aquí se prueba el todo-o-nada contra BD real.
 * Empresas `platform`: el cupo no estorba (`{ limit: null, source: 'none' }`).
 */

const STAMP = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`

const SENSITIVE_WRITE_ALLOWED = {
  read: {
    identificacion: true,
    contacto: true,
    financiero: true,
    salud: true,
    biometrico: true,
  },
  write: {
    identificacion: 'allowed' as const,
    contacto: 'allowed' as const,
    financiero: 'allowed' as const,
    salud: 'allowed' as const,
    biometrico: 'allowed' as const,
  },
}

const IMPORT_HEADERS = [
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

type ImportRowInput = {
  // Riesgo declarado de la HU: el material compartido asumía la misma empresa
  // en ambas columnas. Este constructor acepta nómina distinta a propósito.
  payrollNum: string
  workUnitName: string
  payrollUnitName?: string
  firstName: string
  lastName: string
  curp?: string
}

type CompanyMismatchError = Error & {
  isCompanyMismatchError: true
  statusCode: number
  offendingRows: Array<{ row: number }>
}

function asCompanyMismatchError(error: unknown): CompanyMismatchError {
  return error as CompanyMismatchError
}

function getService(): EmployeeService {
  return new EmployeeService(i18nManager.locale(i18nManager.defaultLocale))
}

function buildImportRow(row: ImportRowInput): (string | number)[] {
  const values = new Array(IMPORT_HEADERS.length).fill('') as (string | number)[]
  values[0] = ''
  values[1] = row.payrollNum
  values[2] = row.workUnitName
  values[3] = row.payrollUnitName ?? row.workUnitName
  values[4] = row.firstName
  values[5] = row.lastName
  if (row.curp) values[12] = row.curp
  return values
}

async function writeImportExcel(
  rows: ImportRowInput[]
): Promise<{ tmpPath: string; dir: string }> {
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('Empleados')
  worksheet.addRow([...IMPORT_HEADERS])
  for (const row of rows) {
    worksheet.addRow(buildImportRow(row))
  }
  const dir = await mkdtemp(join(tmpdir(), `employee-import-company-${STAMP}-`))
  const tmpPath = join(dir, 'import.xlsx')
  await workbook.xlsx.writeFile(tmpPath)
  return { tmpPath, dir }
}

function asUploadFile(tmpPath: string) {
  return {
    tmpPath,
    clientName: 'import.xlsx',
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    size: 1024,
  }
}

async function createPlatformUnit(tag: string, businessUnitName?: string): Promise<BusinessUnit> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const businessUnit = new BusinessUnit()
  businessUnit.businessUnitName = businessUnitName ?? `Rechazo Carga ${tag} ${stamp}`
  businessUnit.businessUnitSlug = `rechazo-carga-${tag.toLowerCase()}-${stamp}`
  businessUnit.businessUnitLegalName = `Rechazo Carga ${tag} Legal ${stamp}`
  businessUnit.businessUnitActive = 1
  businessUnit.businessUnitOrigin = 'platform'
  await businessUnit.save()
  return businessUnit
}

async function countEmployeesIn(businessUnitId: number): Promise<number> {
  return Employee.query()
    .where('business_unit_id', businessUnitId)
    .whereNull('employee_deleted_at')
    .exec()
    .then((rows) => rows.length)
}

async function countPersonsIn(businessUnitId: number): Promise<number> {
  return Person.query()
    .where('business_unit_id', businessUnitId)
    .exec()
    .then((rows) => rows.length)
}

test.group('EmployeeService.importFromExcel — empresa distinta (USRH1789747321650)', (group) => {
  let unitA: BusinessUnit
  let unitB: BusinessUnit
  let unitSameName: BusinessUnit

  group.setup(async () => {
    unitA = await createPlatformUnit('A')
    unitB = await createPlatformUnit('B')
    unitSameName = await createPlatformUnit('MismoNombre', unitA.businessUnitName)
  })

  group.teardown(async () => {
    await Employee.query()
      .whereIn('business_unit_id', [
        unitA.businessUnitId,
        unitB.businessUnitId,
        unitSameName.businessUnitId,
      ])
      .delete()
    await Person.query()
      .whereIn('business_unit_id', [
        unitA.businessUnitId,
        unitB.businessUnitId,
        unitSameName.businessUnitId,
      ])
      .delete()
    await BusinessUnit.query()
      .whereIn('business_unit_id', [
        unitA.businessUnitId,
        unitB.businessUnitId,
        unitSameName.businessUnitId,
      ])
      .delete()
  })

  async function importAsA(
    rows: ImportRowInput[],
    cleanup: (fn: () => Promise<void>) => void
  ) {
    const { tmpPath, dir } = await writeImportExcel(rows)
    cleanup(async () => {
      await rm(dir, { recursive: true, force: true })
    })
    return SensitiveAccessContext.run(SENSITIVE_WRITE_ALLOWED, () =>
      getService().importFromExcel(asUploadFile(tmpPath), [unitA.businessUnitId])
    )
  }

  test('criterio 1 — archivo todo de la activa: carga como hoy', async ({ assert, cleanup }) => {
    const beforeEmployees = await countEmployeesIn(unitA.businessUnitId)
    const result = await importAsA(
      [
        {
          payrollNum: `RC-OK-1-${STAMP}`,
          workUnitName: unitA.businessUnitName,
          firstName: 'Carga',
          lastName: 'OkUno',
        },
        {
          payrollNum: `RC-OK-2-${STAMP}`,
          workUnitName: unitA.businessUnitName,
          firstName: 'Carga',
          lastName: 'OkDos',
        },
      ],
      cleanup
    )
    assert.equal(result.summary.created, 2)
    assert.equal(result.rowErrors.length, 0)
    assert.equal(await countEmployeesIn(unitA.businessUnitId), beforeEmployees + 2)
  })

  test('nombre duplicado en otro tenant — el archivo se resuelve en la empresa activa', async ({
    assert,
    cleanup,
  }) => {
    assert.equal(unitSameName.businessUnitName, unitA.businessUnitName)
    assert.notEqual(unitSameName.businessUnitSlug, unitA.businessUnitSlug)
    const beforeEmployees = await countEmployeesIn(unitA.businessUnitId)
    const result = await importAsA(
      [
        {
          payrollNum: `RC-SAME-1-${STAMP}`,
          workUnitName: unitA.businessUnitName,
          firstName: 'Carga',
          lastName: 'NombreDuplicado',
        },
      ],
      cleanup
    )

    assert.equal(result.summary.created, 1)
    assert.equal(result.rowErrors.length, 0)
    assert.equal(await countEmployeesIn(unitA.businessUnitId), beforeEmployees + 1)
    assert.equal(await countEmployeesIn(unitSameName.businessUnitId), 0)
  })

  test('criterio 2 — una fila con trabajo distinto: rechazo completo, nada creado, fila identificada', async ({
    assert,
    cleanup,
  }) => {
    const beforeEmployeesA = await countEmployeesIn(unitA.businessUnitId)
    const beforePersonsA = await countPersonsIn(unitA.businessUnitId)
    let caught: unknown = null
    try {
      await importAsA(
        [
          {
            payrollNum: `RC-W-1-${STAMP}`,
            workUnitName: unitA.businessUnitName,
            firstName: 'Carga',
            lastName: 'Bien',
          },
          {
            payrollNum: `RC-W-2-${STAMP}`,
            workUnitName: unitB.businessUnitName,
            firstName: 'Carga',
            lastName: 'Mal',
          },
        ],
        cleanup
      )
    } catch (error) {
      caught = error
    }
    assert.exists(caught, 'debió rechazar el archivo completo')
    const mismatchError = asCompanyMismatchError(caught)
    assert.equal(mismatchError.isCompanyMismatchError, true)
    assert.equal(mismatchError.statusCode, 422)
    assert.equal(mismatchError.offendingRows.length, 1)
    assert.equal(mismatchError.offendingRows[0].row, 3)
    assert.equal(await countEmployeesIn(unitA.businessUnitId), beforeEmployeesA)
    assert.equal(await countPersonsIn(unitA.businessUnitId), beforePersonsA)
  })

  test('criterio 3 — trabajo de la activa pero nómina distinta: mismo rechazo', async ({
    assert,
    cleanup,
  }) => {
    const beforeEmployeesA = await countEmployeesIn(unitA.businessUnitId)
    let caught: unknown = null
    try {
      await importAsA(
        [
          {
            payrollNum: `RC-P-1-${STAMP}`,
            workUnitName: unitA.businessUnitName,
            payrollUnitName: unitB.businessUnitName,
            firstName: 'Carga',
            lastName: 'NominaMal',
          },
        ],
        cleanup
      )
    } catch (error) {
      caught = error
    }
    assert.exists(caught, 'debió rechazar el archivo completo')
    const mismatchError = asCompanyMismatchError(caught)
    assert.equal(mismatchError.isCompanyMismatchError, true)
    assert.equal(mismatchError.offendingRows.length, 1)
    assert.equal(await countEmployeesIn(unitA.businessUnitId), beforeEmployeesA)
  })

  test('criterio 4 — varias filas ofensoras: el rechazo las enumera todas', async ({
    assert,
    cleanup,
  }) => {
    let caught: unknown = null
    try {
      await importAsA(
        [
          {
            payrollNum: `RC-M-1-${STAMP}`,
            workUnitName: unitB.businessUnitName,
            firstName: 'Carga',
            lastName: 'MalUno',
          },
          {
            payrollNum: `RC-M-2-${STAMP}`,
            workUnitName: unitA.businessUnitName,
            firstName: 'Carga',
            lastName: 'Bien',
          },
          {
            payrollNum: `RC-M-3-${STAMP}`,
            workUnitName: unitA.businessUnitName,
            payrollUnitName: unitB.businessUnitName,
            firstName: 'Carga',
            lastName: 'MalDos',
          },
        ],
        cleanup
      )
    } catch (error) {
      caught = error
    }
    assert.exists(caught, 'debió rechazar el archivo completo')
    const mismatchError = asCompanyMismatchError(caught)
    assert.equal(mismatchError.offendingRows.length, 2)
    assert.deepEqual(
      mismatchError.offendingRows.map((item) => item.row),
      [2, 4]
    )
    assert.match(mismatchError.message, /Fila 2.*Fila 4/s)
  })

  test('criterio 5 / regla 4 — CURP ya registrada en la propia empresa: esa fila se salta, el resto carga', async ({
    assert,
    cleanup,
  }) => {
    const seeded = new Person()
    seeded.personFirstname = 'Sembrada'
    seeded.personLastname = 'Duplicada'
    seeded.personSecondLastname = 'Scope'
    seeded.personCurp = `RCCURPSEED${STAMP}`.slice(0, 18)
    seeded.businessUnitId = unitA.businessUnitId
    await seeded.save()

    const beforeEmployees = await countEmployeesIn(unitA.businessUnitId)
    const result = await importAsA(
      [
        {
          payrollNum: `RC-D-1-${STAMP}`,
          workUnitName: unitA.businessUnitName,
          firstName: 'Carga',
          lastName: 'Dup',
          curp: seeded.personCurp,
        },
        {
          payrollNum: `RC-D-2-${STAMP}`,
          workUnitName: unitA.businessUnitName,
          firstName: 'Carga',
          lastName: 'Libre',
        },
      ],
      cleanup
    )
    assert.equal(result.summary.created, 1)
    assert.equal(result.rowErrors.length, 1)
    assert.equal(result.rowErrors[0].message, 'CURP duplicado')
    assert.equal(await countEmployeesIn(unitA.businessUnitId), beforeEmployees + 1)
  })
})
