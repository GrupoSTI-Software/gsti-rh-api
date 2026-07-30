import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'
import { EMPLOYEE_IMPORT_UPLOAD } from '../../../app/constants/employee_import_error_codes.js'

const SERVICE_FILE = join(process.cwd(), 'app/services/employee_service.ts')

/**
 * `importFromExcel` procesaba archivos de miles de filas con dos problemas
 * de escala: (1) `findExistingEmployeeForImport` hacía un `.find()` lineal
 * sobre TODOS los empleados existentes por cada fila (O(filas × existentes));
 * (2) la sincronización con dispositivos ZKTeco corría un `await` secuencial
 * por empleado nuevo, con hasta 10s de timeout cada uno, dentro del mismo
 * loop de creación — un archivo de miles de altas podía tomar horas en una
 * sola petición HTTP. Ninguna prueba de integración real corre esto contra
 * la base de datos (demasiado pesado); se verifica por contenido de fuente,
 * igual que el resto de specs de este archivo.
 */
test.group('employee_service importFromExcel — escala con archivos de miles de filas', () => {
  test('busca empleados existentes por ID vía un índice Map, no un `.find()` lineal', ({ assert }) => {
    const content = readFileSync(SERVICE_FILE, 'utf-8')

    assert.include(content, 'const existingEmployeesById = new Map<number, Employee>(')
    assert.include(
      content,
      'private findExistingEmployeeForImport(employeeData: any, existingEmployeesById: Map<number, any>): any'
    )
    assert.include(content, 'return existingEmployeesById.get(id) ?? null')
    assert.notInclude(content, 'existingEmployees.find((emp) => emp.employeeId === id)')
  })

  test('la sincronización con ZKTeco corre después del loop de creación, en lotes acotados', ({
    assert,
  }) => {
    const content = readFileSync(SERVICE_FILE, 'utf-8')

    assert.include(content, 'const EMPLOYEE_IMPORT_ZK_SYNC_CONCURRENCY = 10')
    assert.include(content, 'private async syncCreatedEmployeesToZkDevices(employees: Employee[]): Promise<void>')
    assert.include(content, 'private async syncEmployeeToZkDevice(newEmployee: Employee): Promise<void>')
    assert.include(content, 'await this.syncCreatedEmployeesToZkDevices(createdEmployees)')

    // La sincronización ya no bloquea cada fila del loop de creación
    // (antes vivía inline, justo después de `ensureEmployeePrimaryEmergencyContact`).
    const creationLoopMarker = content.indexOf('await this.ensureEmployeePrimaryEmergencyContact(newEmployee.employeeId, employeeData)')
    const nextLines = content.slice(creationLoopMarker, creationLoopMarker + 400)
    assert.notInclude(nextLines, 'Ws.emitZkCreateEmployee')
  })

  test('una falla de sincronización ZK individual no aborta el import (mismo contrato de antes)', ({
    assert,
  }) => {
    const content = readFileSync(SERVICE_FILE, 'utf-8')

    assert.include(
      content,
      "console.warn('No se recibió respuesta del dispositivo ZKTeco, continuando normalmente:', error.message)"
    )
  })

  test('rechaza archivos con más filas que EMPLOYEE_IMPORT_UPLOAD.maxDataRows, ANTES de procesar filas', ({
    assert,
  }) => {
    const content = readFileSync(SERVICE_FILE, 'utf-8')

    assert.include(content, "import { EMPLOYEE_IMPORT_UPLOAD } from '#constants/employee_import_error_codes'")
    assert.include(content, 'if (rows.length > EMPLOYEE_IMPORT_UPLOAD.maxDataRows)')
    assert.include(content, 'private createRowLimitValidationError(rowCount: number): Error')
    assert.include(content, 'error.isHeaderValidationError || error.isRowLimitError')

    // El chequeo compara contra la constante, no contra un número repetido
    // a mano en el servicio (regresión al requisito de "un solo valor").
    assert.notMatch(content, /rows\.length\s*>\s*\d/)
  })

  test('el tope de filas es un único valor en EMPLOYEE_IMPORT_UPLOAD.maxDataRows, sin variable de entorno', ({
    assert,
  }) => {
    assert.equal(EMPLOYEE_IMPORT_UPLOAD.maxDataRows, 500)

    const constantsContent = readFileSync(
      join(process.cwd(), 'app/constants/employee_import_error_codes.ts'),
      'utf-8'
    )
    assert.notMatch(constantsContent, /process\.env/)
  })
})
