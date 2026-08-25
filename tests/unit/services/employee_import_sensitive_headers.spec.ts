import { test } from '@japa/runner'
import i18nManager from '@adonisjs/i18n/services/main'
import { SENSITIVE_DATA_WRITE_ERROR_CODES } from '#constants/sensitive_data_write_error_codes'
import { SensitiveDataWriteError } from '#exceptions/sensitive_data_write_error'
import EmployeeService from '#services/employee_service'
import { SensitiveAccessContext } from '#utils/sensitive_access_context'

function service() {
  return new EmployeeService(i18nManager.locale(i18nManager.defaultLocale))
}

const writeDeniedStore = {
  read: { identificacion: true, contacto: true, financiero: true, salud: true, biometrico: true },
  write: {
    identificacion: 'denied' as const,
    contacto: 'allowed' as const,
    financiero: 'denied' as const,
    salud: 'denied' as const,
    biometrico: 'denied' as const,
  },
}

const writeAllowedStore = {
  read: { identificacion: true, contacto: true, financiero: true, salud: true, biometrico: true },
  write: {
    identificacion: 'allowed' as const,
    contacto: 'allowed' as const,
    financiero: 'allowed' as const,
    salud: 'allowed' as const,
    biometrico: 'allowed' as const,
  },
}

type ServiceWithAssert = {
  assertExcelSensitiveHeadersWritable(headers: string[]): void
}

test.group('EmployeeService.assertExcelSensitiveHeadersWritable', () => {
  test('lanza IMPORT_FORBIDDEN si NSS presente y sin escritura identificación', ({ assert }) => {
    const svc = service() as unknown as ServiceWithAssert
    SensitiveAccessContext.run(writeDeniedStore, () => {
      try {
        svc.assertExcelSensitiveHeadersWritable(['NSS', 'Nombre del empleado'])
        assert.fail('debía lanzar SensitiveDataWriteError')
      } catch (error) {
        assert.instanceOf(error, SensitiveDataWriteError)
        const e = error as SensitiveDataWriteError
        assert.equal(e.errorCode, SENSITIVE_DATA_WRITE_ERROR_CODES.IMPORT_FORBIDDEN)
        assert.equal(e.category, 'identificacion')
      }
    })
  })

  test('no lanza si no hay cabeceras sensibles', ({ assert }) => {
    const svc = service() as unknown as ServiceWithAssert
    SensitiveAccessContext.run(writeDeniedStore, () => {
      assert.doesNotThrow(() => svc.assertExcelSensitiveHeadersWritable(['Nombre del empleado']))
    })
  })

  test('no lanza si hay permiso de escritura', ({ assert }) => {
    const svc = service() as unknown as ServiceWithAssert
    SensitiveAccessContext.run(writeAllowedStore, () => {
      assert.doesNotThrow(() => svc.assertExcelSensitiveHeadersWritable(['NSS', 'CURP']))
    })
  })
})
