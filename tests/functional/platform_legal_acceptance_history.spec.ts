import { test } from '@japa/runner'
import EvidenceRepositoryMysql from '#modules/consent/evidence/evidence.repository.mysql'
import { PLATFORM_ACCEPTANCE_DOCUMENT_TYPES } from '#modules/consent/platform/platform_consent.constants'
import { TENANT_UNSCOPED_REASON } from '#constants/tenant_unscoped_reason'
import { TenantContext } from '#utils/tenant_context'

/**
 * USRH1790610965466 — expediente de aceptaciones legales por tenant (historial).
 *
 * Cubre los filtros aditivos del repositorio de evidencia que la historia del
 * expediente consumirá desde el sub-slice de plataforma. Este primer grupo prueba
 * el comportamiento fail-closed de los filtros llamando directo al adaptador
 * (sin HTTP ni fixtures; corre contra `sae_pruebas`). Los grupos HTTP los agrega
 * la Task 4 del plan.
 *
 * El adaptador real se consume desde el sub-slice de plataforma, que corre bajo el
 * bypass auditado del tenant (`runUnscoped`, motivo `platform-admin`): fuera de una
 * petición HTTP el mixin de alcance de empresa lanzaría sin ese contexto.
 */

test.group('Repositorio de evidencia — filtros del historial (fail-closed)', () => {
  test('CA-8b: excludePlatformAccounts sin businessUnitId devuelve cero filas', async ({
    assert,
  }) => {
    /**
     * Objetivo: comprobar que pedir la exclusión de cuentas de plataforma sin la
     * empresa del filtro no degrada a "sin filtro": es fail-closed y devuelve vacío.
     *
     * Dado: el adaptador de evidencia y el filtro de tipos de plataforma, sin empresa.
     * Cuando: se consulta con `excludePlatformAccounts: true` y sin `businessUnitId`.
     * Entonces: cero filas y `meta.total === 0`.
     */
    const result = await TenantContext.runUnscoped(
      () =>
        new EvidenceRepositoryMysql().findEvidence(
          { types: [...PLATFORM_ACCEPTANCE_DOCUMENT_TYPES], excludePlatformAccounts: true },
          { page: 1, perPage: 20 }
        ),
      TENANT_UNSCOPED_REASON.PLATFORM_ADMIN
    )

    assert.lengthOf(result.rows, 0)
    assert.equal(result.meta.total, 0)
  })

  test('types con arreglo vacío devuelve cero filas (fail-closed)', async ({ assert }) => {
    /**
     * Objetivo: comprobar que un arreglo de tipos vacío NO significa "sin filtro":
     * es fail-closed y devuelve vacío.
     *
     * Dado: el adaptador de evidencia.
     * Cuando: se consulta con `types: []`.
     * Entonces: cero filas.
     */
    const result = await TenantContext.runUnscoped(
      () =>
        new EvidenceRepositoryMysql().findEvidence({ types: [] }, { page: 1, perPage: 20 }),
      TENANT_UNSCOPED_REASON.PLATFORM_ADMIN
    )

    assert.lengthOf(result.rows, 0)
  })
})
