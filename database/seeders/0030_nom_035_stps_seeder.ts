import Regulation from '#models/regulation'
import RegulationClause from '#models/regulation_clause'
import RegulationEvidenceRequirement from '#models/regulation_evidence_requirement'
import RegulatoryAuthority from '#models/regulatory_authority'
import { BaseSeeder } from '@adonisjs/lucid/seeders'

/**
 * Semilla idempotente: NOM-035-STPS-2018
 *
 * Estructura de 47 cláusulas:
 *   Capítulo 5  → 1 raíz + 8 padres (5.1–5.8) + 12 sub-incisos = 21
 *     sub 5.1: 5.1.1, 5.1.2, 5.1.3           (3)
 *     sub 5.2: 5.2.1, 5.2.2                   (2)
 *     sub 5.3: 5.3.1, 5.3.2                   (2)
 *     sub 5.4: 5.4.1, 5.4.2                   (2)
 *     sub 5.8: 5.8.a, 5.8.b, 5.8.c            (3)
 *   Capítulo 8  → 1 raíz + 5 padres (8.1–8.5) + 20 sub-incisos = 26
 *     sub 8.1: 8.1.1–8.1.4                    (4)
 *     sub 8.2: 8.2.1–8.2.4                    (4)
 *     sub 8.3: 8.3.1–8.3.4                    (4)
 *     sub 8.4: 8.4.1–8.4.4                    (4)
 *     sub 8.5: 8.5.1–8.5.4                    (4)
 *
 *   Total: 21 + 26 = 47 ✓
 */
export default class extends BaseSeeder {
  async run() {
    // ── 1. Obtener la autoridad STPS ────────────────────────────────────────
    const stps = await RegulatoryAuthority.findByOrFail('regulatoryAuthoritySlug', 'stps')

    // ── 2. Insertar / actualizar la regulación ──────────────────────────────
    const regulation = await Regulation.updateOrCreate(
      { regulationCode: 'NOM-035-STPS', regulationVersion: '2018' },
      {
        regulatoryAuthorityId: stps.regulatoryAuthorityId,
        regulationTitle:
          'NOM-035-STPS-2018: Factores de riesgo psicosocial en el trabajo — Identificación, análisis y prevención',
        regulationType: 'NOM',
        regulationPublicationDate: new Date('2018-10-23'),
        regulationEffectiveDate: new Date('2019-10-23'),
        regulationLastRevisionDate: null,
        regulationStatus: 'vigente',
        regulationScopeDescriptionKey: 'regulatory.regulations.nom_035_stps_2018.scope',
        regulationGeneralAuditDescriptionKey:
          'regulatory.regulations.nom_035_stps_2018.audit_description',
        regulationOfficialUrl:
          'https://dof.gob.mx/nota_detalle.php?codigo=5541687&fecha=23/10/2018',
        regulationInternalNotes:
          'Dos fases: Fase 1 oct-2019 (art.7-9) y Fase 2 oct-2020 (aplicación plena).',
        regulationRetentionMinYears: 4,
      }
    )

    const rid = regulation.regulationId

    // ── 3. Helper para crear / actualizar cláusulas ─────────────────────────
    const upsert = async (
      code: string,
      ord: number,
      parentId: number | null,
      titleKey?: string | null
    ) => {
      const segment = code.replace(/\./g, '_')
      const base = `regulatory.clauses.nom_035_stps_2018.${segment}`
      return RegulationClause.updateOrCreate(
        { regulationId: rid, regulationClauseCode: code },
        {
          parentRegulationClauseId: parentId,
          regulationClauseOrd: ord,
          regulationClauseTitleKey: titleKey !== undefined ? titleKey : `${base}.title`,
          regulationClauseObligationKey: `${base}.obligation`,
          regulationClauseExplanationKey: `${base}.explanation`,
          regulationClauseRationaleKey: `${base}.rationale`,
          regulationClauseAuditCriteriaKey: `${base}.audit_criteria`,
          regulationClauseApplicabilityKey: null,
        }
      )
    }

    // ── 4. CAPÍTULO 5 — Obligaciones del empleador (21 cláusulas) ──────────
    const c5 = await upsert('5', 1, null)

    const c51 = await upsert('5.1', 1, c5.regulationClauseId)
    await upsert('5.1.1', 1, c51.regulationClauseId, null)
    await upsert('5.1.2', 2, c51.regulationClauseId, null)
    await upsert('5.1.3', 3, c51.regulationClauseId, null)

    const c52 = await upsert('5.2', 2, c5.regulationClauseId)
    await upsert('5.2.1', 1, c52.regulationClauseId, null)
    await upsert('5.2.2', 2, c52.regulationClauseId, null)

    const c53 = await upsert('5.3', 3, c5.regulationClauseId)
    await upsert('5.3.1', 1, c53.regulationClauseId, null)
    await upsert('5.3.2', 2, c53.regulationClauseId, null)

    const c54 = await upsert('5.4', 4, c5.regulationClauseId)
    await upsert('5.4.1', 1, c54.regulationClauseId, null)
    await upsert('5.4.2', 2, c54.regulationClauseId, null)

    await upsert('5.5', 5, c5.regulationClauseId)
    await upsert('5.6', 6, c5.regulationClauseId)
    await upsert('5.7', 7, c5.regulationClauseId)

    const c58 = await upsert('5.8', 8, c5.regulationClauseId)
    const c58a = await upsert('5.8.a', 1, c58.regulationClauseId, null)
    const c58b = await upsert('5.8.b', 2, c58.regulationClauseId, null)
    const c58c = await upsert('5.8.c', 3, c58.regulationClauseId, null)

    // ── 5. CAPÍTULO 8 — Evaluación y seguimiento (26 cláusulas) ────────────
    const c8 = await upsert('8', 2, null)

    const c81 = await upsert('8.1', 1, c8.regulationClauseId)
    await upsert('8.1.1', 1, c81.regulationClauseId, null)
    await upsert('8.1.2', 2, c81.regulationClauseId, null)
    await upsert('8.1.3', 3, c81.regulationClauseId, null)
    await upsert('8.1.4', 4, c81.regulationClauseId, null)

    const c82 = await upsert('8.2', 2, c8.regulationClauseId)
    await upsert('8.2.1', 1, c82.regulationClauseId, null)
    await upsert('8.2.2', 2, c82.regulationClauseId, null)
    await upsert('8.2.3', 3, c82.regulationClauseId, null)
    await upsert('8.2.4', 4, c82.regulationClauseId, null)

    const c83 = await upsert('8.3', 3, c8.regulationClauseId)
    await upsert('8.3.1', 1, c83.regulationClauseId, null)
    await upsert('8.3.2', 2, c83.regulationClauseId, null)
    await upsert('8.3.3', 3, c83.regulationClauseId, null)
    await upsert('8.3.4', 4, c83.regulationClauseId, null)

    const c84 = await upsert('8.4', 4, c8.regulationClauseId)
    await upsert('8.4.1', 1, c84.regulationClauseId, null)
    await upsert('8.4.2', 2, c84.regulationClauseId, null)
    await upsert('8.4.3', 3, c84.regulationClauseId, null)
    await upsert('8.4.4', 4, c84.regulationClauseId, null)

    const c85 = await upsert('8.5', 5, c8.regulationClauseId)
    await upsert('8.5.1', 1, c85.regulationClauseId, null)
    await upsert('8.5.2', 2, c85.regulationClauseId, null)
    await upsert('8.5.3', 3, c85.regulationClauseId, null)
    await upsert('8.5.4', 4, c85.regulationClauseId, null)

    // ── 6. Evidencias del numeral 5.8 (3 registros) ─────────────────────────
    const evidencias: Array<{
      clauseId: number
      descKey: string
    }> = [
      {
        clauseId: c58a.regulationClauseId,
        descKey: 'regulatory.evidence.nom_035_stps_2018.5_8_a.description',
      },
      {
        clauseId: c58b.regulationClauseId,
        descKey: 'regulatory.evidence.nom_035_stps_2018.5_8_b.description',
      },
      {
        clauseId: c58c.regulationClauseId,
        descKey: 'regulatory.evidence.nom_035_stps_2018.5_8_c.description',
      },
    ]

    for (const ev of evidencias) {
      await RegulationEvidenceRequirement.updateOrCreate(
        {
          regulationClauseId: ev.clauseId,
          regulationEvidenceRequirementDescriptionKey: ev.descKey,
        },
        {
          regulationEvidenceRequirementType: 'registro',
          regulationEvidenceRequirementRetentionYears: 4,
        }
      )
    }
  }
}
