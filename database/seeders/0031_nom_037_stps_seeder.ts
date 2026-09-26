import Regulation from '#models/regulation'
import RegulationClause from '#models/regulation_clause'
import RegulatoryAuthority from '#models/regulatory_authority'
import { BaseSeeder } from '@adonisjs/lucid/seeders'

/**
 * Semilla idempotente: NOM-037-STPS-2023 (Teletrabajo)
 *
 * Estructura de 49 cláusulas — Capítulo 5 (Obligaciones del Patrón):
 *   Capítulo 5 raíz (1)
 *   Padres 5.1–5.14  (14)
 *   Sub-incisos       (34)
 *     5.1: 5.1.I–5.1.VI                     (6)
 *     5.2: 5.2.I–5.2.IV                     (4)
 *     5.3: 5.3.I–5.3.III                    (3)
 *     5.4: 5.4.I–5.4.IV                     (4)
 *     5.5: 5.5.I–5.5.III                    (3)
 *     5.6: 5.6.I–5.6.III                    (3)
 *     5.7: 5.7.I–5.7.III                    (3)
 *     5.8: 5.8.I–5.8.III                    (3)
 *     5.9: 5.9.I–5.9.III                    (3)
 *     5.10: 5.10.I–5.10.II                  (2)
 *     5.11–5.14: sin sub-incisos            (0)
 *
 *   Total: 1 + 14 + 34 = 49 ✓
 */
export default class extends BaseSeeder {
  async run() {
    // ── 1. Obtener la autoridad STPS (debe existir; ejecutar 0028 primero) ──
    const stps = await RegulatoryAuthority.findBy('regulatoryAuthoritySlug', 'stps')
    if (!stps) {
      throw new Error('STPS authority not found, run StpsAuthoritySeeder first')
    }

    // ── 2. Insertar / actualizar la regulación ──────────────────────────────
    const regulation = await Regulation.updateOrCreate(
      { regulationCode: 'NOM-037-STPS', regulationVersion: '2023' },
      {
        regulatoryAuthorityId: stps.regulatoryAuthorityId,
        regulationTitle:
          'NOM-037-STPS-2023: Teletrabajo — Condiciones de seguridad y salud en el trabajo',
        regulationType: 'NOM',
        regulationPublicationDate: new Date('2023-06-08'),
        regulationEffectiveDate: new Date('2023-12-05'),
        regulationLastRevisionDate: null,
        regulationStatus: 'vigente',
        regulationScopeDescriptionKey: 'regulatory.regulations.nom_037_stps_2023.scope',
        regulationGeneralAuditDescriptionKey:
          'regulatory.regulations.nom_037_stps_2023.audit_description',
        regulationOfficialUrl:
          'https://dof.gob.mx/nota_detalle.php?codigo=5690434&fecha=08/06/2023',
        regulationInternalNotes:
          'Aplica a centros de trabajo con 1 o más teletrabajadores que representen al menos el 40% de su plantilla, o a elección del patrón.',
        regulationRetentionMinYears: null,
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
      const base = `regulatory.clauses.nom_037_stps_2023.${segment}`
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

    // ── 4. CAPÍTULO 5 — Obligaciones del Patrón (53 cláusulas) ─────────────
    const c5 = await upsert('5', 1, null)
    const pid = c5.regulationClauseId

    // 5.1 — Condiciones de seguridad y salud (6 sub-incisos)
    const c51 = await upsert('5.1', 1, pid)
    await upsert('5.1.I', 1, c51.regulationClauseId, null)
    await upsert('5.1.II', 2, c51.regulationClauseId, null)
    await upsert('5.1.III', 3, c51.regulationClauseId, null)
    await upsert('5.1.IV', 4, c51.regulationClauseId, null)
    await upsert('5.1.V', 5, c51.regulationClauseId, null)
    await upsert('5.1.VI', 6, c51.regulationClauseId, null)

    // 5.2 — Equipos y herramientas de trabajo (4 sub-incisos)
    const c52 = await upsert('5.2', 2, pid)
    await upsert('5.2.I', 1, c52.regulationClauseId, null)
    await upsert('5.2.II', 2, c52.regulationClauseId, null)
    await upsert('5.2.III', 3, c52.regulationClauseId, null)
    await upsert('5.2.IV', 4, c52.regulationClauseId, null)

    // 5.3 — Ergonomía (3 sub-incisos)
    const c53 = await upsert('5.3', 3, pid)
    await upsert('5.3.I', 1, c53.regulationClauseId, null)
    await upsert('5.3.II', 2, c53.regulationClauseId, null)
    await upsert('5.3.III', 3, c53.regulationClauseId, null)

    // 5.4 — Capacitación y formación (4 sub-incisos)
    const c54 = await upsert('5.4', 4, pid)
    await upsert('5.4.I', 1, c54.regulationClauseId, null)
    await upsert('5.4.II', 2, c54.regulationClauseId, null)
    await upsert('5.4.III', 3, c54.regulationClauseId, null)
    await upsert('5.4.IV', 4, c54.regulationClauseId, null)

    // 5.5 — Factores de riesgo (3 sub-incisos)
    const c55 = await upsert('5.5', 5, pid)
    await upsert('5.5.I', 1, c55.regulationClauseId, null)
    await upsert('5.5.II', 2, c55.regulationClauseId, null)
    await upsert('5.5.III', 3, c55.regulationClauseId, null)

    // 5.6 — Acuerdo de teletrabajo (3 sub-incisos)
    const c56 = await upsert('5.6', 6, pid)
    await upsert('5.6.I', 1, c56.regulationClauseId, null)
    await upsert('5.6.II', 2, c56.regulationClauseId, null)
    await upsert('5.6.III', 3, c56.regulationClauseId, null)

    // 5.7 — Registro y control (3 sub-incisos)
    const c57 = await upsert('5.7', 7, pid)
    await upsert('5.7.I', 1, c57.regulationClauseId, null)
    await upsert('5.7.II', 2, c57.regulationClauseId, null)
    await upsert('5.7.III', 3, c57.regulationClauseId, null)

    // 5.8 — Reversibilidad del teletrabajo (3 sub-incisos)
    const c58 = await upsert('5.8', 8, pid)
    await upsert('5.8.I', 1, c58.regulationClauseId, null)
    await upsert('5.8.II', 2, c58.regulationClauseId, null)
    await upsert('5.8.III', 3, c58.regulationClauseId, null)

    // 5.9 — Perspectiva de género y no discriminación (3 sub-incisos)
    const c59 = await upsert('5.9', 9, pid)
    await upsert('5.9.I', 1, c59.regulationClauseId, null)
    await upsert('5.9.II', 2, c59.regulationClauseId, null)
    await upsert('5.9.III', 3, c59.regulationClauseId, null)

    // 5.10 — Privacidad y protección de datos (2 sub-incisos)
    const c510 = await upsert('5.10', 10, pid)
    await upsert('5.10.I', 1, c510.regulationClauseId, null)
    await upsert('5.10.II', 2, c510.regulationClauseId, null)

    // 5.11–5.14 — Sin sub-incisos
    await upsert('5.11', 11, pid)
    await upsert('5.12', 12, pid)
    await upsert('5.13', 13, pid)
    await upsert('5.14', 14, pid)
  }
}
