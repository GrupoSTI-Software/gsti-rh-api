import { test } from '@japa/runner'
import i18nManager from '@adonisjs/i18n/services/main'
import { SENSITIVE_EXPORT_PLACEHOLDER } from '#constants/sensitive_export_placeholder'
import EmployeeService from '#services/employee_service'

function service() {
  return new EmployeeService(i18nManager.locale(i18nManager.defaultLocale))
}

type ServiceWithImportInternals = {
  extractEmployeeDataFromRow(row: unknown, headers: string[]): Record<string, unknown>
  updateExistingEmployee(
    existingEmployee: Record<string, unknown>,
    employeeData: Record<string, unknown>,
    departments: unknown[],
    positions: unknown[],
    defaultDepartment: unknown,
    defaultPosition: unknown,
    businessUnitId: number | null,
    payrollBusinessUnitId: number | null,
    employeeTypes?: unknown[]
  ): Promise<void>
  ensureEmployeeResidenceAddress(employeeId: number, employeeData: unknown): Promise<void>
  ensureEmployeePrimaryEmergencyContact(employeeId: number, employeeData: unknown): Promise<void>
}

function mockImportRow(cells: Record<number, { value: unknown; text?: string }>) {
  return {
    eachCell(callback: (cell: { value: unknown; text?: string }, colNumber: number) => void) {
      for (const [col, cell] of Object.entries(cells)) {
        callback(
          { value: cell.value, text: cell.text ?? String(cell.value ?? '') },
          Number(col)
        )
      }
    },
  }
}

const SALARY_HEADER = 'Salario Diario'
const HEADERS = ['', SALARY_HEADER]

test.group('Reimportación Excel — guard de salario diario enmascarado (USRH1787433076994)', () => {
  test('extractEmployeeDataFromRow: celda ***** no asigna dailySalary', ({ assert }) => {
    const svc = service() as unknown as ServiceWithImportInternals
    const data = svc.extractEmployeeDataFromRow(
      mockImportRow({ 1: { value: SENSITIVE_EXPORT_PLACEHOLDER } }),
      HEADERS
    )
    assert.notProperty(data, 'dailySalary')
  })

  test('extractEmployeeDataFromRow: celda vacía no asigna dailySalary', ({ assert }) => {
    const svc = service() as unknown as ServiceWithImportInternals
    const data = svc.extractEmployeeDataFromRow(mockImportRow({ 1: { value: null } }), HEADERS)
    assert.notProperty(data, 'dailySalary')
  })

  test('extractEmployeeDataFromRow: celda con 0 asigna dailySalary = 0', ({ assert }) => {
    const svc = service() as unknown as ServiceWithImportInternals
    const data = svc.extractEmployeeDataFromRow(mockImportRow({ 1: { value: 0 } }), HEADERS)
    assert.property(data, 'dailySalary')
    assert.equal(data.dailySalary, 0)
  })

  test('extractEmployeeDataFromRow: celda con número positivo asigna dailySalary', ({ assert }) => {
    const svc = service() as unknown as ServiceWithImportInternals
    const data = svc.extractEmployeeDataFromRow(mockImportRow({ 1: { value: 850.5 } }), HEADERS)
    assert.equal(data.dailySalary, 850.5)
  })

  test('updateExistingEmployee: sin dailySalary en datos conserva el salario existente', async ({
    assert,
  }) => {
    const svc = service() as unknown as ServiceWithImportInternals
    svc.ensureEmployeeResidenceAddress = async () => {}
    svc.ensureEmployeePrimaryEmergencyContact = async () => {}

    const existingEmployee = {
      dailySalary: 850.5,
      employeeFirstName: 'Ana',
      employeeLastName: 'López',
      employeeSecondLastName: '',
      save: async () => {},
    }

    await svc.updateExistingEmployee(
      existingEmployee,
      {},
      [],
      [],
      null,
      null,
      null,
      null
    )

    assert.equal(existingEmployee.dailySalary, 850.5)
  })

  test('updateExistingEmployee: dailySalary 0 explícito sí persiste cero', async ({ assert }) => {
    const svc = service() as unknown as ServiceWithImportInternals
    svc.ensureEmployeeResidenceAddress = async () => {}
    svc.ensureEmployeePrimaryEmergencyContact = async () => {}

    const existingEmployee = {
      dailySalary: 850.5,
      employeeFirstName: 'Ana',
      employeeLastName: 'López',
      employeeSecondLastName: '',
      save: async () => {},
    }

    await svc.updateExistingEmployee(
      existingEmployee,
      { dailySalary: 0 },
      [],
      [],
      null,
      null,
      null,
      null
    )

    assert.equal(existingEmployee.dailySalary, 0)
  })

  test('updateExistingEmployee: dailySalary positivo actualiza el salario', async ({ assert }) => {
    const svc = service() as unknown as ServiceWithImportInternals
    svc.ensureEmployeeResidenceAddress = async () => {}
    svc.ensureEmployeePrimaryEmergencyContact = async () => {}

    const existingEmployee = {
      dailySalary: 850.5,
      employeeFirstName: 'Ana',
      employeeLastName: 'López',
      employeeSecondLastName: '',
      save: async () => {},
    }

    await svc.updateExistingEmployee(
      existingEmployee,
      { dailySalary: 1200 },
      [],
      [],
      null,
      null,
      null,
      null
    )

    assert.equal(existingEmployee.dailySalary, 1200)
  })
})
