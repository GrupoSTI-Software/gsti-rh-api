import { test } from '@japa/runner'
import EvidenceRepositoryMysql from '#modules/consent/evidence/evidence.repository.mysql'
import { PLATFORM_ACCEPTANCE_DOCUMENT_TYPES } from '#modules/consent/platform/platform_consent.constants'
import { TENANT_UNSCOPED_REASON } from '#constants/tenant_unscoped_reason'
import { TenantContext } from '#utils/tenant_context'

/**
 * USRH1790654705065 — revelar (mostrar completos) la IP y el agente de usuario de UNA
 * aceptación del expediente de una empresa, dejando registro en la bitácora de acceso a
 * datos personales.
 *
 * Primer grupo: filtro aditivo `userConsentId` del repositorio de evidencia (Task 1 del
 * plan) — acota la consulta a una sola aceptación y, sin usarlo, deja el SQL idéntico al
 * de hoy. Se prueba llamando directo al adaptador, sin HTTP.
 *
 * El adaptador real se consume desde el sub-slice de plataforma, que corre bajo el bypass
 * auditado del tenant (`runUnscoped`, motivo `platform-admin`): fuera de una petición HTTP
 * el mixin de alcance de empresa lanzaría sin ese contexto. Las pruebas HTTP de los grupos
 * siguientes no necesitan envoltura: el guard de plataforma ya envuelve toda la petición.
 */

test.group('Repositorio de evidencia — filtro userConsentId (fail-closed)', () => {
  test('filtra por userConsentId: un id inexistente devuelve cero filas', async ({ assert }) => {
    /**
     * Objetivo: comprobar que el filtro acota la consulta a una sola aceptación por su PK:
     * un id que no existe no devuelve filas ni las cuenta.
     *
     * Dado: el adaptador de evidencia y el filtro de tipos de plataforma.
     * Cuando: se consulta con un `userConsentId` inexistente.
     * Entonces: cero filas y `meta.total === 0`.
     */
    const result = await TenantContext.runUnscoped(
      () =>
        new EvidenceRepositoryMysql().findEvidence(
          { types: [...PLATFORM_ACCEPTANCE_DOCUMENT_TYPES], userConsentId: 2147483000 },
          { page: 1, perPage: 20 }
        ),
      TENANT_UNSCOPED_REASON.PLATFORM_ADMIN
    )

    assert.lengthOf(result.rows, 0)
    assert.equal(result.meta.total, 0)
  })

  test('userConsentId 0 no filtra (por eso el servicio exige > 0)', async ({ assert }) => {
    /**
     * Objetivo: fijar que `userConsentId: 0` NO acota —el `.if` lo trata como ausente—,
     * por eso el servicio deberá exigir un id mayor a cero antes de confiar en el filtro.
     *
     * Dado: la BD sembrada de `sae_pruebas`.
     * Cuando: se consulta sin el filtro y con `userConsentId: 0`.
     * Entonces: ambas consultas cuentan el mismo total.
     */
    const sinFiltro = await TenantContext.runUnscoped(
      () =>
        new EvidenceRepositoryMysql().findEvidence(
          { types: [...PLATFORM_ACCEPTANCE_DOCUMENT_TYPES] },
          { page: 1, perPage: 100 }
        ),
      TENANT_UNSCOPED_REASON.PLATFORM_ADMIN
    )
    const conCero = await TenantContext.runUnscoped(
      () =>
        new EvidenceRepositoryMysql().findEvidence(
          { types: [...PLATFORM_ACCEPTANCE_DOCUMENT_TYPES], userConsentId: 0 },
          { page: 1, perPage: 100 }
        ),
      TENANT_UNSCOPED_REASON.PLATFORM_ADMIN
    )

    assert.equal(conCero.meta.total, sinFiltro.meta.total)
  })
})
