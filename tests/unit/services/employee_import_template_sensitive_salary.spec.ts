import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

test.group('Plantilla Excel importación — salario diario sensible (USRH1787433076994)', () => {
  test('celda 11 enmascara dailySalary con templateSensitiveNumericCellValue', ({ assert }) => {
    const source = readFileSync(
      join(process.cwd(), 'app/services/employee_service.ts'),
      'utf-8'
    )
    assert.include(source, 'private templateSensitiveNumericCellValue(')
    assert.match(
      source,
      /worksheet\.getCell\(rowNum,\s*11\)\.value\s*=\s*this\.templateSensitiveNumericCellValue\(\s*options\?\.maskSensitive,\s*emp\.dailySalary\s*\)/
    )
    assert.notMatch(source, /worksheet\.getCell\(rowNum,\s*11\)\.value\s*=\s*emp\.dailySalary/)
  })
})
