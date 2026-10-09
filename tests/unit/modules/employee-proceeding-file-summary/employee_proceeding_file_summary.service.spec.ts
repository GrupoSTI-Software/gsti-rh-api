import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { DateTime } from 'luxon'
import { EMPLOYEES_READ_PERMISSION_DECLARATIONS } from '#constants/employees_read_permission_declarations'
import { EMPLOYEE_PROCEEDING_FILE_SUMMARY_EXPIRING_WINDOW_DAYS } from '#modules/employee-proceeding-file-summary/employee_proceeding_file_summary.constants'
import { EmployeeProceedingFileSummaryError } from '#modules/employee-proceeding-file-summary/employee_proceeding_file_summary.error'
import type {
  EmployeeProceedingFileCountParams,
  EmployeeProceedingFileCountRecord,
  EmployeeProceedingFileSummaryRepository,
  EmployeeProceedingFolderRecord,
} from '#modules/employee-proceeding-file-summary/employee_proceeding_file_summary.repository'
import EmployeeProceedingFileSummaryService, {
  resolveVisibleFolders,
} from '#modules/employee-proceeding-file-summary/employee_proceeding_file_summary.service'
import { toBusinessDateString, todayInBusinessZone } from '#utils/business_date'

/**
 * Resumen del expediente con repositorio falso en memoria: la regla de
 * visibilidad (exclusivas y poda de subárbol) y la suma de totales viven en
 * el service, así que se prueban sin base de datos.
 */

function folder(
  proceedingFileTypeId: number,
  parentId: number | null,
  overrides: Partial<EmployeeProceedingFolderRecord> = {}
): EmployeeProceedingFolderRecord {
  return {
    proceedingFileTypeId,
    parentId,
    isExclusive: false,
    assignedToEmployee: false,
    ...overrides,
  }
}

interface FakeRepositoryData {
  exists?: boolean
  folders?: EmployeeProceedingFolderRecord[]
  counts?: EmployeeProceedingFileCountRecord[]
  contracts?: number
}

function makeRepository(data: FakeRepositoryData) {
  const calls: { countParams: EmployeeProceedingFileCountParams | null } = { countParams: null }
  const repository: EmployeeProceedingFileSummaryRepository = {
    async employeeExists() {
      return data.exists ?? true
    },
    async findFolders() {
      return data.folders ?? []
    },
    async countFilesByFolder(params) {
      calls.countParams = params
      return data.counts ?? []
    },
    async countContracts() {
      return data.contracts ?? 0
    },
  }
  return { repository, calls }
}

const SCOPE = { employeeId: 57, businessUnitIds: [3] }

test.group('resolveVisibleFolders — regla de exclusivas del expediente', () => {
  test('una exclusiva sin el empleado asignado se oculta con todo su subárbol', ({ assert }) => {
    const visible = resolveVisibleFolders([
      folder(1, null),
      folder(2, null, { isExclusive: true, assignedToEmployee: false }),
      folder(3, 2),
      folder(4, 2, { isExclusive: true, assignedToEmployee: true }),
      folder(5, 1, { isExclusive: true, assignedToEmployee: true }),
      folder(6, 1, { isExclusive: true, assignedToEmployee: false }),
    ])

    assert.deepEqual(
      visible.map((item) => item.proceedingFileTypeId),
      [1, 5]
    )
  })

  test('un parent_id en ciclo no repite carpetas ni se cuelga', ({ assert }) => {
    const visible = resolveVisibleFolders([
      folder(1, null),
      folder(2, 1),
      folder(3, 2),
      folder(1, 3),
    ])

    assert.deepEqual(
      visible.map((item) => item.proceedingFileTypeId),
      [1, 2, 3]
    )
  })
})

test.group('EmployeeProceedingFileSummaryService.summarize', () => {
  test('cuenta archivos directos, subcarpetas visibles, contratos y totales', async ({
    assert,
  }) => {
    const { repository } = makeRepository({
      folders: [
        folder(10, null),
        folder(11, 10),
        folder(12, 10, { isExclusive: true, assignedToEmployee: true }),
        folder(13, 10, { isExclusive: true, assignedToEmployee: false }),
        folder(20, null),
      ],
      counts: [
        { proceedingFileTypeId: 10, documents: 3, expiringOrExpired: 1 },
        { proceedingFileTypeId: 12, documents: 2, expiringOrExpired: 2 },
        // Carpeta oculta para el empleado: no suma a ningún total.
        { proceedingFileTypeId: 13, documents: 4, expiringOrExpired: 4 },
        // Archivo en una carpeta fuera del árbol del área (otra empresa o área).
        { proceedingFileTypeId: 99, documents: 7, expiringOrExpired: 7 },
      ],
      contracts: 2,
    })

    const summary = await new EmployeeProceedingFileSummaryService(repository).summarize(SCOPE)

    assert.deepEqual(summary, {
      windowDays: EMPLOYEE_PROCEEDING_FILE_SUMMARY_EXPIRING_WINDOW_DAYS,
      totals: { documents: 7, folders: 5, expiringOrExpired: 3 },
      contracts: { documents: 2 },
      folders: [
        { proceedingFileTypeId: 10, documentsCount: 3, subfoldersCount: 2 },
        { proceedingFileTypeId: 11, documentsCount: 0, subfoldersCount: 0 },
        { proceedingFileTypeId: 12, documentsCount: 2, subfoldersCount: 0 },
        { proceedingFileTypeId: 20, documentsCount: 0, subfoldersCount: 0 },
      ],
    })
  })

  test('sin carpetas cuenta solo la carpeta virtual de contratos', async ({ assert }) => {
    const { repository } = makeRepository({ contracts: 1 })

    const summary = await new EmployeeProceedingFileSummaryService(repository).summarize(SCOPE)

    assert.deepEqual(summary.totals, { documents: 1, folders: 1, expiringOrExpired: 0 })
    assert.deepEqual(summary.folders, [])
  })

  test('pide los vencimientos con horizonte = hoy + ventana en zona de negocio', async ({
    assert,
  }) => {
    const { repository, calls } = makeRepository({})

    await new EmployeeProceedingFileSummaryService(repository).summarize(SCOPE)

    const expected = toBusinessDateString(
      todayInBusinessZone().plus({ days: EMPLOYEE_PROCEEDING_FILE_SUMMARY_EXPIRING_WINDOW_DAYS })
    )
    assert.equal(calls.countParams?.horizon, expected)
    assert.isTrue(DateTime.fromISO(expected).isValid)
    assert.equal(calls.countParams?.employeeId, SCOPE.employeeId)
    assert.deepEqual(calls.countParams?.businessUnitIds, SCOPE.businessUnitIds)
  })

  test('empleado inexistente en el tenant responde 404 con key', async ({ assert }) => {
    const { repository } = makeRepository({ exists: false })

    try {
      await new EmployeeProceedingFileSummaryService(repository).summarize(SCOPE)
      assert.fail('debió lanzar EmployeeProceedingFileSummaryError')
    } catch (error) {
      assert.instanceOf(error, EmployeeProceedingFileSummaryError)
      const summaryError = error as EmployeeProceedingFileSummaryError
      assert.equal(summaryError.httpStatus, 404)
      assert.equal(summaryError.key, 'empleado-no-encontrado')
    }
  })
})

test.group('proceeding-file-summary — gate de ruta', () => {
  test('usa el mismo permiso que listar los archivos del expediente', async ({ assert }) => {
    assert.deepEqual(
      EMPLOYEES_READ_PERMISSION_DECLARATIONS.getEmployeeProceedingFileSummary,
      EMPLOYEES_READ_PERMISSION_DECLARATIONS.getEmployeeProceedingFiles
    )
    const content = await readFile(
      join(
        process.cwd(),
        'app/modules/employee-proceeding-file-summary/employee_proceeding_file_summary.routes.ts'
      ),
      'utf8'
    )
    assert.include(
      content.replace(/\s+/g, ''),
      'permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.getEmployeeProceedingFileSummary)'
    )
    assert.include(content, 'middleware.businessScope()')
  })
})
