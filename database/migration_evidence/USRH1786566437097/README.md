# Evidencia de migración — USRH1786566437097 (CA-24)

Artefacto **versionado junto a las migraciones** (`database/migration_evidence/`), no tabla del producto (decisión cerrada 2026-08-13, §9.8).

> **Ubicación:** fuera de `database/migrations/` porque Lucid carga recursivamente todo ese directorio; JSON/CSV ahí provocan error al correr `migration:run`.

## Qué contiene

| Archivo | Propósito |
|---------|-----------|
| `manifest.json` | Manifiesto acumulado: conteos por paso y rutas a artefactos |
| `manifest.schema.json` | Esquema JSON del manifiesto |
| `manual-resolutions.jsonl` | Ledger append-only de filas resueltas a mano |
| `conjunto-a-{step}-{stamp}.json` | Duplicados históricos (llave NULL, tenant asignado) por BU/año |
| `conjunto-b-{step}-{stamp}.csv` | Foto del conjunto B: empleado no encontrado por ninguna vía |
| `cuarentena-{step}-{stamp}.csv` | Filas con `business_unit_id IS NULL` (cuarentena pre-M3) |

## Campos del ledger manual (JSONL, una línea por resolución)

- `assist_id` — checada afectada
- `business_unit_id` — empresa asignada
- `rule` — regla o motivo (p. ej. `correccion-codigo-empleado`, `manual-wilvardo`)
- `resolved_at` — ISO-8601
- `executor` — email o identificador auditado
- `notes` — opcional

**No se registra contenido de la checada** (código, hora, terminal): solo metadatos de la resolución.

## Runbook

```bash
# Antes de M1
node ace assist:migration-evidence --step=pre-m1

# Tras M1, M2, deploy, M3 y backfill de llave
node ace assist:migration-evidence --step=post-m1
node ace assist:migration-evidence --step=post-m2
node ace assist:migration-evidence --step=post-deploy
node ace assist:migration-evidence --step=post-m3
node ace assist:migration-evidence --step=post-backfill

# Resolución manual (opción c, §9.5.4) — constancia sin UPDATE automático
node ace assist:migration-evidence record \
  --assist-id=12345 \
  --business-unit-id=1 \
  --rule=correccion-dato-origen \
  --executor=operador@empresa.com \
  --notes="Empleado reactivado con código corregido"
```

Tras ejecutar en staging/producción, **commitear** `manifest.json`, CSV/JSON generados y entradas del ledger junto al PR de migración.

## Conjuntos (§9.8)

- **Conjunto A:** `assist_natural_key IS NULL AND business_unit_id IS NOT NULL` — duplicados identificados, no consolidados.
- **Conjunto B:** filas sin empresa o sin empleado resoluble — cuarentena hasta corrección o resolución manual.

El ensayo de dos empresas (CA-21) usa `node ace assist:trial`; este comando es la constancia CA-24 específica.

## Regla 16 — checada inactivada no libera su slot (CA-23)

Decisión cerrada 2026-08-13 (Wilvardo). El UNIQUE `assists_natural_key_unique` **no** incluye
`assist_active` ni `assist_deleted_at`: inactivar desde Backoffice (`PUT …/inactivate`) solo
pone `assist_active = 0` y **conserva** `assist_natural_key`.

| Camino | Comportamiento ante reenvío idéntico |
|--------|--------------------------------------|
| Sync BioTime | `ER_DUP_ENTRY` → contador `duplicates`, corrida continúa |
| POST `/api/v1/assists` | `verifyInfo` detecta `(assist_emp_id, assist_punch_time)` existente → 400 |
| Insert directo | MySQL rechaza por UNIQUE |

Tests de regresión: `tests/functional/assist_inactivated_natural_key.spec.ts`,
`tests/unit/models/assist_inactivated_slot.spec.ts`.

**Implicación de producto:** dar de baja una checada **no** deshace la recepción; si RH necesita
re-capturarla, es una regla distinta (fuera de alcance de USRH1786566437097).
