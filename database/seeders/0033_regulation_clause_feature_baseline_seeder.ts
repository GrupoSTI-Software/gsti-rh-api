import { BaseSeeder } from '@adonisjs/lucid/seeders'
import db from '@adonisjs/lucid/services/db'
import RegulationClauseFeature from '#models/regulation_clause_feature'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * SEEDER DE BASELINE DE COBERTURA REGULATORIA
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Propósito
 * ─────────
 * Siembra las filas iniciales (baseline) de la tabla regulation_clause_features,
 * que liga numerales regulatorios (regulation_clauses) con funcionalidades del
 * producto (system_features). Cada fila dice: "esta funcionalidad cubre este
 * numeral, con este grado de cobertura".
 *
 * Estado del baseline
 * ───────────────────
 * Al cierre de esta historia (CAP-08-01-08-03), NOM-035 y NOM-037 aún no tienen
 * funcionalidades de compliance construidas — están en EPICs 08-02 a 08-07.
 * Por eso el arreglo `rows` arranca vacío. El seeder corre limpio aunque esté
 * vacío; su valor principal es la convención que queda documentada aquí.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CONVENCIÓN DE RELLENO POR EPIC
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Cuándo agregar filas
 * ────────────────────
 * Cada EPIC funcional (EPIC-08-02 a EPIC-08-07) agrega su cobertura al liberar
 * sus funcionalidades, creando un seeder dedicado siguiendo esta convención.
 * NO se crea migración nueva; el esquema FK ya existe desde USRH1779717151707.
 *
 * Nomenclatura del seeder por EPIC
 * ─────────────────────────────────
 *   NNNN_<epic-slug>_clause_feature_seeder.ts
 *
 *   Ejemplos:
 *     0034_nom035_clima_organizacional_clause_feature_seeder.ts  (EPIC-08-02)
 *     0035_nom035_factores_riesgo_clause_feature_seeder.ts       (EPIC-08-03)
 *     0036_nom037_teletrabajo_clause_feature_seeder.ts           (EPIC-08-07)
 *
 *   La numeración debe ser la siguiente disponible en database/seeders/.
 *   Verificar con: ls database/seeders/ | sort | tail -5
 *
 * Estructura de cada fila
 * ───────────────────────
 *   {
 *     // Llave natural del numeral: regulation_clause_obligation_key sin el
 *     // sufijo ".obligation" (ej. "regulatory.clauses.nom_035_stps_2018.5_1")
 *     clauseObligationKey: 'regulatory.clauses.<norma>.<numeral>.obligation',
 *
 *     // Slug estable de la funcionalidad (system_feature_slug en system_features)
 *     featureSlug: '<slug-del-feature>',
 *
 *     // Grado de cobertura: 'total' | 'parcial' | null
 *     // total  → la funcionalidad cubre íntegramente la obligación del numeral.
 *     // parcial → cubre solo parte de la obligación.
 *     // null   → aún no evaluado o el grado no aplica en esta etapa.
 *     coverage: 'total' | 'parcial' | null,
 *
 *     // Clave i18n opcional para notas aclaratorias (máx 150 chars).
 *     // Apunta a resources/lang/{es,en}.json.
 *     noteKey: 'regulatory.coverage_notes.<norma>.<numeral>.<feature>' | null,
 *   }
 *
 * Idempotencia
 * ────────────
 * Usar SIEMPRE updateOrCreate sobre la pareja (regulation_clause_id, system_feature_id).
 * Nunca usar insert puro — correría con error en la segunda ejecución por el UNIQUE.
 *
 * El status de la funcionalidad NO determina si se mapea
 * ───────────────────────────────────────────────────────
 * Un feature puede estar en 'en_desarrollo' y ya tener su mapeo de cobertura
 * registrado para el cómputo futuro. El seeder no filtra por system_feature_status.
 *
 * Resolución de FK por llave natural
 * ────────────────────────────────────
 * El seeder resuelve regulation_clause_id buscando por regulation_clause_obligation_key
 * y system_feature_id buscando por system_feature_slug. Si alguna llave natural
 * no existe en BD, el seeder DEBE fallar explícitamente con un mensaje que
 * nombre la clave faltante — nunca silenciar el error ni continuar parcialmente.
 *
 * Prohibiciones
 * ─────────────
 * ✗ No crear migración nueva para agregar cobertura.
 * ✗ No usar insert() o save() directos; solo updateOrCreate.
 * ✗ No crear features ni numerales sobre la marcha desde este seeder.
 * ✗ No incluir en este baseline filas de EPICs no liberadas.
 * ✗ No renderizar note_key como HTML; es solo una clave i18n.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EJEMPLO EJECUTABLE (comentado — copiar y descomentar en el seeder de la EPIC)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * import { BaseSeeder } from '@adonisjs/lucid/seeders'
 * import db from '@adonisjs/lucid/services/db'
 * import RegulationClauseFeature from '#models/regulation_clause_feature'
 *
 * export default class extends BaseSeeder {
 *   async run() {
 *     const rows = [
 *       {
 *         clauseObligationKey: 'regulatory.clauses.nom_035_stps_2018.5_1.obligation',
 *         featureSlug: 'employee-create-edit',
 *         coverage: 'parcial' as const,
 *         noteKey: null,
 *       },
 *     ]
 *
 *     for (const row of rows) {
 *       // 1. Resolver regulation_clause_id por llave natural
 *       const clause = await db
 *         .from('regulation_clauses')
 *         .where('regulation_clause_obligation_key', row.clauseObligationKey)
 *         .first()
 *       if (!clause) {
 *         throw new Error(
 *           `[seeder] Numeral no encontrado para obligation_key "${row.clauseObligationKey}". ` +
 *           `Verifica que los seeders STPS hayan corrido antes.`
 *         )
 *       }
 *
 *       // 2. Resolver system_feature_id por slug
 *       const feature = await db
 *         .from('system_features')
 *         .where('system_feature_slug', row.featureSlug)
 *         .whereNull('deleted_at')
 *         .first()
 *       if (!feature) {
 *         throw new Error(
 *           `[seeder] Feature no encontrada para slug "${row.featureSlug}". ` +
 *           `Verifica que 0032_system_feature_seeder haya corrido antes.`
 *         )
 *       }
 *
 *       // 3. Upsert idempotente sobre la pareja (regulation_clause_id, system_feature_id)
 *       await RegulationClauseFeature.updateOrCreate(
 *         {
 *           regulationClauseId: clause.regulation_clause_id,
 *           systemFeatureId: feature.system_feature_id,
 *         },
 *         {
 *           regulationClauseFeatureCoverage: row.coverage,
 *           regulationClauseFeatureNoteKey: row.noteKey,
 *         }
 *       )
 *     }
 *   }
 * }
 */

export default class extends BaseSeeder {
  /**
   * Baseline de cobertura al cierre de CAP-08-01-08-03.
   *
   * Las EPICs de compliance (EPIC-08-02 a EPIC-08-07) aún no están construidas,
   * por lo que ninguna funcionalidad actual cubre formalmente los numerales
   * NOM-035 o NOM-037. El arreglo queda vacío de forma intencional.
   *
   * Cuando una EPIC libere sus features y quiera registrar cobertura, crea su
   * propio seeder siguiendo la convención documentada en el bloque de cabecera.
   */
  private readonly rows: Array<{
    clauseObligationKey: string
    featureSlug: string
    coverage: 'total' | 'parcial' | null
    noteKey: string | null
  }> = [
    /*
     * BASELINE VACÍO — intencional.
     *
     * Ejemplo de fila para referencia (no ejecutar):
     * {
     *   clauseObligationKey: 'regulatory.clauses.nom_035_stps_2018.5_1.obligation',
     *   featureSlug: 'employee-create-edit',
     *   coverage: 'parcial',
     *   noteKey: null,
     * },
     */
  ]

  async run() {
    if (this.rows.length === 0) {
      // Baseline vacío: corre sin error. La convención queda en la cabecera del archivo.
      return
    }

    for (const row of this.rows) {
      // 1. Resolver regulation_clause_id por llave natural
      const clause = await db
        .from('regulation_clauses')
        .where('regulation_clause_obligation_key', row.clauseObligationKey)
        .first()

      if (!clause) {
        throw new Error(
          `[0033_baseline_seeder] Numeral no encontrado para obligation_key "${row.clauseObligationKey}". ` +
            'Verifica que los seeders STPS normativos (0030 y 0031) hayan corrido antes que este seeder.'
        )
      }

      // 2. Resolver system_feature_id por slug
      const feature = await db
        .from('system_features')
        .where('system_feature_slug', row.featureSlug)
        .whereNull('deleted_at')
        .first()

      if (!feature) {
        throw new Error(
          `[0033_baseline_seeder] Feature no encontrada para slug "${row.featureSlug}". ` +
            'Verifica que 0032_system_feature_seeder haya corrido antes que este seeder.'
        )
      }

      // 3. Upsert idempotente sobre la pareja (regulation_clause_id, system_feature_id)
      await RegulationClauseFeature.updateOrCreate(
        {
          regulationClauseId: clause.regulation_clause_id,
          regulationClauseFeatureSlug: feature.system_feature_slug,
        },
        {
          regulationClauseFeatureNotes: row.noteKey,
        }
      )
    }
  }
}
