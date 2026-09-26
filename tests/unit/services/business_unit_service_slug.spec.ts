import { test } from '@japa/runner'
import BusinessUnitService from '../../../app/services/business_unit_service.js'
import {
  BUSINESS_UNIT_SLUG_ALPHABET,
  BUSINESS_UNIT_SLUG_PREFIX,
  BUSINESS_UNIT_SLUG_RANDOM_LENGTH,
  BUSINESS_UNIT_SLUG_UNIQUE_INDEX,
} from '../../../app/constants/business_unit.js'
import { I18n } from '@adonisjs/i18n'

/**
 * Tests unitarios del slug opaco de empresa (USRH1787932877000).
 *
 * Estilo espejo: funciones puras sin base de datos. Verifica formato,
 * uniformidad, clasificación en business_unit_access y discriminación de
 * ER_DUP_ENTRY.  La cobertura de integración (UNIQUE real, reintento ante
 * colisión forzada) vive en `tests/functional/business_unit_slug_unique.spec.ts`.
 */

function makeService(): BusinessUnitService {
  return new BusinessUnitService({ formatMessage: (key: string) => key } as unknown as I18n)
}

// ---------------------------------------------------------------------------
// generateOpaqueSlug — formato y propiedades del token
// ---------------------------------------------------------------------------

test.group('BusinessUnitService — generateOpaqueSlug: formato del token', () => {
  test('el token casa con /^bu-[abcdefghjkmnpqrstuvwxyz23456789]{12}$/', ({ assert }) => {
    const service = makeService()
    const token = service.generateOpaqueSlug()
    const expected = new RegExp(
      `^${BUSINESS_UNIT_SLUG_PREFIX}[${BUSINESS_UNIT_SLUG_ALPHABET}]{${BUSINESS_UNIT_SLUG_RANDOM_LENGTH}}$`
    )
    assert.match(token, expected, `token "${token}" no cumple el formato esperado`)
  })

  test('no contiene i, l, o, 0 ni 1 (caracteres confusos excluidos del alfabeto)', ({ assert }) => {
    const service = makeService()
    for (let i = 0; i < 100; i++) {
      const token = service.generateOpaqueSlug()
      assert.notMatch(token, /[ilo01]/, `token "${token}" contiene carácter confuso`)
    }
  })

  test('longitud total = prefijo + RANDOM_LENGTH', ({ assert }) => {
    const service = makeService()
    const token = service.generateOpaqueSlug()
    assert.equal(
      token.length,
      BUSINESS_UNIT_SLUG_PREFIX.length + BUSINESS_UNIT_SLUG_RANDOM_LENGTH
    )
  })

  test('token.toLowerCase() === token (inmune a normalización de los consumidores)', ({ assert }) => {
    const service = makeService()
    for (let i = 0; i < 50; i++) {
      const token = service.generateOpaqueSlug()
      assert.equal(token.toLowerCase(), token, `token "${token}" cambia al bajar a minúsculas`)
    }
  })

  test('dos llamadas consecutivas producen tokens distintos (sin estado compartido)', ({
    assert,
  }) => {
    const service = makeService()
    const tokens = new Set(Array.from({ length: 20 }, () => service.generateOpaqueSlug()))
    assert.equal(tokens.size, 20, 'se esperaban 20 tokens únicos en 20 llamadas')
  })
})

// ---------------------------------------------------------------------------
// generateOpaqueSlug — clasificación en business_unit_access
// ---------------------------------------------------------------------------

test.group(
  'BusinessUnitService — generateOpaqueSlug: clasificación como slug, nunca como id',
  () => {
    /**
     * Espeja la rama de clasificación de `parseBusinessUnitAccessInput`
     * (`app/utils/business_unit_access.ts:47-53`):
     *   - token numérico entero positivo → `ids`
     *   - cualquier otro → `slugs`
     *
     * El prefijo `bu-` hace que `Number('bu-...')` sea NaN, así que el
     * token cae siempre en la rama `slugs`. Probabilidad exactamente 0
     * de ser leído como `business_unit_id`.
     */
    function classifyToken(token: string): 'id' | 'slug' {
      const asNumber = Number(token)
      if (Number.isInteger(asNumber) && asNumber > 0 && `${asNumber}` === token) {
        return 'id'
      }
      return 'slug'
    }

    test('todos los tokens opacos se clasifican como slug, nunca como id numérico', ({
      assert,
    }) => {
      const service = makeService()
      for (let i = 0; i < 100; i++) {
        const token = service.generateOpaqueSlug()
        assert.equal(
          classifyToken(token),
          'slug',
          `token "${token}" fue clasificado como id numérico`
        )
      }
    })
  }
)

// ---------------------------------------------------------------------------
// isSlugDuplicateError — discriminación por nombre de índice
// ---------------------------------------------------------------------------

test.group('BusinessUnitService — isSlugDuplicateError', () => {
  const service = makeService()

  test('CA-5/CA-6: detecta ER_DUP_ENTRY sobre el índice del slug (error.code)', ({ assert }) => {
    const error = {
      code: 'ER_DUP_ENTRY',
      sqlMessage: `Duplicate entry 'bu-abc123def456' for key '${BUSINESS_UNIT_SLUG_UNIQUE_INDEX}'`,
    }
    assert.isTrue(service.isSlugDuplicateError(error))
  })

  test('CA-5/CA-6: detecta ER_DUP_ENTRY sobre el índice del slug (error.original.code)', ({
    assert,
  }) => {
    const error = {
      original: {
        code: 'ER_DUP_ENTRY',
        sqlMessage: `Duplicate entry 'bu-xyz789' for key '${BUSINESS_UNIT_SLUG_UNIQUE_INDEX}'`,
      },
    }
    assert.isTrue(service.isSlugDuplicateError(error))
  })

  test('CA-7: NO detecta ER_DUP_ENTRY de otro índice — cero reintentos', ({ assert }) => {
    const error = {
      code: 'ER_DUP_ENTRY',
      sqlMessage: "Duplicate entry 'user@example.com' for key 'users_email_unique'",
    }
    assert.isFalse(service.isSlugDuplicateError(error))
  })

  test('CA-7: NO detecta errores que no son ER_DUP_ENTRY', ({ assert }) => {
    const errors = [
      { code: 'ER_NO_REFERENCED_ROW_2', sqlMessage: 'Cannot add or update a child row' },
      { message: 'Connection lost' },
      null,
      undefined,
      'string error',
    ]
    for (const error of errors) {
      assert.isFalse(
        service.isSlugDuplicateError(error),
        `se esperaba false para: ${JSON.stringify(error)}`
      )
    }
  })

  test('ER_DUP_ENTRY sin sqlMessage del índice del slug devuelve false', ({ assert }) => {
    const error = { code: 'ER_DUP_ENTRY', sqlMessage: '' }
    assert.isFalse(service.isSlugDuplicateError(error))
  })
})
