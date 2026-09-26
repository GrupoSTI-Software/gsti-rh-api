# Prueba manual API — La serie mensual de MRR reconstruida desde los pagos

**Problema:** El panel ya sabía decir cuánto se factura hoy, pero no cómo se llegó ahí. La cifra del mes, sola, no dice si el negocio crece, se aplanó o empezó a caer; para eso hace falta la historia, y no existía en ninguna parte. Reconstruirla a mano significaba revisar cobros uno por uno, y el resultado cambiaba según quién lo armara.

**Solución:** Un endpoint nuevo devuelve un valor por mes con el ingreso recurrente **cobrado** de la plataforma, reconstruido a partir de los cobros que el sistema ya tenía registrados. No espera a acumular historia nueva: sirve desde el primer día. Cada mes viene con una marca que dice si su cifra se puede sostener con los cobros o no, y por qué.

Ejemplo: es como si vendieras dulces en la escuela y solo supieras cuánto traes hoy en la bolsa, sin saber si vas mejor o peor que antes. Ahora tu cuaderno te muestra mes por mes cuánto dinero te pagaron de verdad tus compañeros, y te marca los meses que todavía no se pueden tomar en serio porque no han terminado.

Se prueba con un cliente de API (Postman, Insomnia, Bruno). La autenticación se asume resuelta por tu cliente: se envía el token del usuario en el header `Authorization: Bearer <token>`.

**URL base:** `http://127.0.0.1:3333`

---

## Antes de empezar: dos advertencias

**1. La base es compartida.** Los importes que devuelve el endpoint son de **toda la plataforma**, así que cada mes trae también los cobros de otros fixtures, no solo los de esta prueba. Por eso ningún escenario te pide comparar contra un número escrito aquí: cada uno trae la consulta SQL que calcula el valor esperado, y lo que verificas es que los dos coincidan.

**2. Un caso de la historia no se puede provocar aquí.** La historia pide que, cuando **no exista ni un solo cobro con periodo registrado**, la respuesta salga con `puntos: []` y la ventana en `null`. Esta base ya trae cobros de los fixtures de facturación, y vaciarla rompería los demás paneles. Ese caso queda fuera del recorrido — está cubierto por pruebas automatizadas.

---

## 1. Preparar (una sola vez)

```bash
cd gsti-rh-api
node ace db:seed --files=database/seeders/_tmp_do_not_commit_qa_seeder.ts
```

Deja listos los dos usuarios de esta prueba y siembra cuatro cobros de recorrido: uno que cubre tres meses, uno del mes en curso, uno sin periodo registrado y uno colgado de una suscripción dada de baja.

| | Correo | Contraseña | Variante |
|---|---|---|---|
| **A** | `qa-mrr-series-admin@gsti-tests.local` | `password` | Administrador de plataforma: debe ver la serie |
| **B** | `qa-mrr-series-sin-marca@gsti-tests.local` | `password` | Sin el marcador de plataforma: debe recibir `403` |

Guarda a la mano el mes actual en formato `YYYY-MM` — lo vas a usar en casi todos los escenarios. Lo obtienes con:

```sql
SELECT DATE_FORMAT(CURDATE(), '%Y-%m') AS mes_en_curso;
```

---

## 2. Escenario 1 — La serie responde con su forma completa

Usuario: **A**.

**Endpoint:** `GET /api/platform/metrics/mrr-series`

**Response — 200:**

```json
{
  "type": "success",
  "data": {
    "ventana": { "desde": "2026-04", "hasta": "2026-09" },
    "criterio": "pagos",
    "pagosSinPeriodoExcluidos": 3,
    "puntos": [
      {
        "mes": "2026-04",
        "mrrCobradoNetoCents": 100000,
        "pagosConsiderados": 1,
        "confiabilidad": "alta",
        "motivoBajaConfiabilidad": null
      },
      { "...": "un objeto igual por cada mes de la ventana" }
    ]
  }
}
```

Qué significa cada dato:

- `ventana.desde` / `ventana.hasta`: el primer y el último mes que trae la historia.
- `puntos`: la historia mes por mes, un renglón por cada mes de la ventana.
- `criterio: "pagos"`: la cifra sale de lo que ya se cobró, no de lo contratado.
- `pagosSinPeriodoExcluidos`: cobros que se quedaron fuera porque no dicen a qué meses pertenecen.
- `mes`: el mes al que pertenece la cifra.
- `mrrCobradoNetoCents`: lo cobrado para ese mes, en centavos y sin impuestos.
- `pagosConsiderados`: cuántos cobros aportaron a ese mes.
- `confiabilidad`: si la cifra del mes se puede tomar en serio. Puede valer `alta` (sí se puede sostener con los cobros) o `baja` (no se puede tomar tal cual).
- `motivoBajaConfiabilidad`: por qué no se puede tomar en serio, o nada (`null`) si la confiabilidad es `alta`. Puede valer `mes-en-curso` (al mes todavía le faltan días y cobros, así que su cifra va a crecer), `sin-pagos-en-el-mes` (el mes no tiene ningún cobro atribuido: su cero es falta de cobros, no un mes que valga cero) o `anterior-al-primer-pago` (el mes es anterior al primer cobro con periodo registrado — no se puede observar desde el endpoint porque la ventana nunca empieza antes de ese cobro).

Verifica que:

- `criterio` valga exactamente `"pagos"`.
- `ventana.hasta` sea el mes en curso.
- El último elemento de `puntos` tenga ese mismo mes.
- Los meses de `puntos` vayan en orden ascendente y **sin saltarse ninguno**: `2026-04`, `2026-05`, `2026-06`… sin huecos.
- `puntos` traiga **como máximo 12 elementos** (es la ventana por omisión).
- Ningún elemento traiga campos de más: exactamente `mes`, `mrrCobradoNetoCents`, `pagosConsiderados`, `confiabilidad` y `motivoBajaConfiabilidad`.
- En ninguna parte de la respuesta aparezcan nombres de empresa, identificadores internos, RFC ni datos fiscales.

---

## 3. Escenario 2 — Un cobro de tres meses se reparte, no se amontona

Es la regla central de la historia: si un cliente pagó tres meses por adelantado, ese dinero se reparte entre los tres, no infla el mes en que se pagó.

Usuario: **A**.

**Endpoint:** `GET /api/platform/metrics/mrr-series?meses=12`

**Response — 200:** el cuerpo varía según los cobros que ya existan en la base — se verifica contra la consulta SQL, no contra un valor fijo. (Los datos son los ya explicados en el Escenario 1: aquí solo se verifica que el reparto entre los tres meses sea parejo.)

Calcula el valor esperado de los tres meses del cobro sembrado:

```sql
SELECT DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 5 MONTH), '%Y-%m') AS mes_1,
       DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 4 MONTH), '%Y-%m') AS mes_2,
       DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 3 MONTH), '%Y-%m') AS mes_3;
```

El cobro sembrado vale 300 000 centavos y cubre tres periodos, así que aporta **100 000 centavos a cada uno** de esos tres meses. Como la base es compartida, compara contra el total real de cada mes con esta consulta: un renglón por cada mes de la ventana de 12 (del mes en curso hacia atrás), con las fechas normalizadas al día 1 para no depender del día del mes en que la corras. `aporte_por_mes` suma la parte de **todo** cobro cuyo rango cubierto incluye ese mes — no solo los que arrancan en él — y `cobros` cuenta cuántos aportan. Filtra el resultado a `mes_1`, `mes_2` y `mes_3`:

```sql
WITH RECURSIVE meses AS (
  SELECT 0 AS n
  UNION ALL
  SELECT n + 1 FROM meses WHERE n < 11
)
SELECT DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL meses.n MONTH), '%Y-%m') AS mes,
       COALESCE(SUM(FLOOR(bp.billing_payment_subtotal_cents / GREATEST(bp.billing_payment_periods_covered, 1))), 0) AS aporte_por_mes,
       COUNT(bp.billing_payment_id) AS cobros
FROM meses
LEFT JOIN billing_payments bp
  ON bp.billing_payment_period_start IS NOT NULL
 AND bp.billing_payment_period_end IS NOT NULL
 AND DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL meses.n MONTH), '%Y-%m-01')
       >= DATE_FORMAT(bp.billing_payment_period_start, '%Y-%m-01')
 AND DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL meses.n MONTH), '%Y-%m-01')
       < DATE_ADD(DATE_FORMAT(bp.billing_payment_period_start, '%Y-%m-01'), INTERVAL GREATEST(bp.billing_payment_periods_covered, 1) MONTH)
 AND EXISTS (
       SELECT 1
       FROM billing_subscriptions bs
       JOIN business_units bu ON bu.business_unit_id = bs.business_unit_id
       WHERE bs.billing_subscription_id = bp.billing_subscription_id
         AND bs.billing_subscription_deleted_at IS NULL
         AND bu.business_unit_deleted_at IS NULL
     )
GROUP BY mes
ORDER BY mes;
```

**Qué debe pasar:**

- En el resultado, filtra a los tres meses (`mes_1`, `mes_2`, `mes_3`): cada uno tiene `aporte_por_mes` **distinto de cero** y `cobros` ≥ 1. Esos mismos meses en `puntos` tienen un valor **distinto de cero** en `mrrCobradoNetoCents`, y su `pagosConsiderados` incluye el cobro sembrado.
- **Ninguno de los tres se lleva los 300 000 centavos completos.** Si uno solo se los lleva, el reparto está roto.
- La diferencia entre `mes_1` y `mes_2` es exactamente la que expliquen los demás cobros de la base: el cobro sembrado aporta lo mismo a los tres.

---

## 4. Escenario 3 — Un mes sin cobros vale cero y viene marcado

Usuario: **A**.

**Endpoint:** `GET /api/platform/metrics/mrr-series?meses=12`

**Response — 200:** el cuerpo varía según los cobros que ya existan en la base — se verifica contra la consulta SQL, no contra un valor fijo.

Averigua qué meses de la ventana no tienen ningún cobro atribuible, con la misma consulta del Escenario 2 (que ya cubre los 12 meses de la ventana): los meses cuyo `cobros` sale en `0` son los huecos.

**Qué debe pasar en cada uno de esos meses:** (los valores son los ya explicados en el Escenario 1)

```json
{
  "mes": "2026-07",
  "mrrCobradoNetoCents": 0,
  "pagosConsiderados": 0,
  "confiabilidad": "baja",
  "motivoBajaConfiabilidad": "sin-pagos-en-el-mes"
}
```

Lo que **no** debe pasar: que el mes traiga el importe del mes anterior, un promedio o cualquier cifra distinta de `0`. Un mes sin información se declara, no se rellena.

> Si todos los meses de la ventana tienen cobros, este escenario no se puede observar hoy. En ese caso amplía la ventana con `?meses=24`: mientras más atrás, más probable es encontrar un mes vacío.

---

## 5. Escenario 4 — El mes en curso siempre viene marcado

El mes actual solo lleva los cobros de lo que va del mes, así que siempre se va a ver más bajo de lo que terminará siendo. Por eso se marca aunque tenga dinero.

Usuario: **A**.

**Endpoint:** `GET /api/platform/metrics/mrr-series`

**Response — 200:** el cuerpo varía según los cobros que ya existan en la base — se verifica contra la consulta SQL, no contra un valor fijo.

**Qué debe pasar** en el **último** elemento de `puntos`: (los valores son los ya explicados en el Escenario 1)

```json
{
  "mes": "<el mes en curso>",
  "mrrCobradoNetoCents": 65000,
  "pagosConsiderados": 1,
  "confiabilidad": "baja",
  "motivoBajaConfiabilidad": "mes-en-curso"
}
```

El importe y el conteo serán mayores si la base trae más cobros del mes; lo que se verifica es que **`confiabilidad` sea `"baja"` y el motivo sea exactamente `"mes-en-curso"`**, con importe distinto de cero. Que tenga dinero y aun así venga marcado es justo el punto.

---

## 6. Escenario 5 — Los cobros sin periodo se cuentan, no se acomodan

Un cobro que no registró qué periodo cubría no se puede ubicar en ningún mes. El sistema lo dice en vez de adivinarle una fecha.

Usuario: **A**.

**Endpoint:** `GET /api/platform/metrics/mrr-series`

**Response — 200:** el cuerpo varía según los cobros que ya existan en la base — se verifica contra la consulta SQL, no contra un valor fijo. (El dato es el ya explicado en el Escenario 1: aquí solo se verifica que el conteo cuadre con la consulta.)

Calcula cuántos deben ser:

```sql
SELECT COUNT(*) AS sin_periodo
FROM billing_payments bp
JOIN billing_subscriptions bs ON bs.billing_subscription_id = bp.billing_subscription_id
JOIN business_units bu ON bu.business_unit_id = bs.business_unit_id
WHERE bs.billing_subscription_deleted_at IS NULL
  AND bu.business_unit_deleted_at IS NULL
  AND (bp.billing_payment_period_start IS NULL OR bp.billing_payment_period_end IS NULL);
```

**Qué debe pasar:** `pagosSinPeriodoExcluidos` en la respuesta vale exactamente ese número, y es **mayor o igual a 1** (el seeder siembra uno de 999 900 centavos).

Además: ese cobro de 999 900 centavos **no aparece en ningún mes**. Si algún mes de la ventana se disparó en esa cantidad, el cobro se acomodó por la fecha de pago y eso está mal.

---

## 7. Escenario 6 — Los cobros de suscripciones dadas de baja no cuentan

Usuario: **A**.

**Endpoint:** `GET /api/platform/metrics/mrr-series?meses=12`

**Response — 200:** el cuerpo varía según los cobros que ya existan en la base — se verifica contra la consulta SQL, no contra un valor fijo. (Sin datos nuevos: aquí solo se verifica que el cobro de la suscripción dada de baja no se cuele en ningún mes ni en los excluidos.)

El seeder cuelga un cobro de **9 999 999 centavos** (casi cien mil pesos) de una suscripción dada de baja, con periodo hace cuatro meses. Es un importe absurdo a propósito: si el filtro fallara, sería imposible no verlo.

```sql
SELECT DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 4 MONTH), '%Y-%m') AS mes_del_cobro_borrado;
```

**Qué debe pasar:** el `mrrCobradoNetoCents` de ese mes está en el mismo orden de magnitud que sus meses vecinos (decenas o centenas de miles de centavos). Si ese mes vale millones, el cobro de la suscripción borrada se coló.

Y `pagosSinPeriodoExcluidos` **tampoco** lo cuenta: ese cobro sí tiene periodo, lo que lo excluye es la baja lógica. No debe aparecer por ningún lado.

---

## 8. Escenario 7 — La ventana se puede pedir, y tiene tope

Usuario: **A**.

**Endpoint:** `GET /api/platform/metrics/mrr-series?meses=3`

**Response — 200:** `puntos` trae **como máximo 3** elementos y `ventana.hasta` sigue siendo el mes en curso. (Sin datos nuevos: solo se verifica que la historia se recorte a los últimos 3 meses y siga terminando hoy.)

**Endpoint:** `GET /api/platform/metrics/mrr-series?meses=40`

**Response — 422:**

```json
{
  "title": "No fue posible obtener la serie mensual de MRR",
  "detail": "El número de meses debe estar entre 1 y 24.",
  "key": "no-fue-posible-obtener-la-serie-mensual-de-mrr",
  "code": "PLT.MET.VAL_INPUT"
}
```

Qué significa cada dato aquí: `title` y `detail` dicen en palabras simples que el número de meses pedido no es válido (solo se vale de 1 a 24); `key` y `code` son las claves cortas del error para reportarlo.

No debe venir ningún punto de serie en esa respuesta.

Repite con `?meses=0` y con `?meses=doce`: los dos responden **422** con el mismo `code` `PLT.MET.VAL_INPUT`.

---

## 9. Escenario 8 — Sin el marcador de plataforma no se ve nada

Usuario: **B** (`qa-mrr-series-sin-marca`).

**Endpoint:** `GET /api/platform/metrics/mrr-series`

**Response — 403:**

```json
{
  "title": "Acceso restringido a plataforma",
  "detail": "...",
  "key": "AUTH.PLATFORM.FORBIDDEN"
}
```

Qué significa lo nuevo aquí: `key` dice que el usuario no tiene el pase de plataforma, así que no puede ver esta información; por eso la respuesta no trae ningún importe ni mes. (`title` es el ya explicado en el Escenario 7.)

Verifica que la respuesta **no traiga campo `code`** (es una inconsistencia conocida del guard, no un defecto de esta historia) y que **no revele nada del negocio**: ni importes, ni meses, ni conteos.

Y sin token, sin ningún `Authorization`:

**Response — 401** (no se valida cuerpo: es el manejo genérico de autenticación del framework, no un contrato de esta historia).

---

## 10. Escenario 9 — Esta serie NO es la cifra de la franja

Es el malentendido que la historia se hace cargo de evitar. Son dos métricas distintas y sus números no tienen por qué coincidir.

Usuario: **A**. Llama a los dos endpoints:

- `GET /api/platform/metrics/mrr` → **Response — 200** — devuelve `mrrActualNetoCents`: lo que está **contratado y vigente hoy**.
- `GET /api/platform/metrics/mrr-series` → **Response — 200** — el último punto devuelve `mrrCobradoNetoCents`: lo que **se cobró** para el mes en curso.

Qué significa lo nuevo aquí: `mrrActualNetoCents` es lo que los clientes tienen contratado hoy aunque todavía no lo paguen. (`mrrCobradoNetoCents` es el ya explicado en el Escenario 1: lo que de verdad ya se cobró.) Son dos fotos distintas y por eso no coinciden.

**Qué debe pasar:** los dos números son **distintos**, y eso es correcto. Lo que se verifica es que la diferencia esté declarada y no escondida:

- La respuesta de la serie trae `criterio: "pagos"`.
- Los campos se llaman distinto: `mrrCobradoNetoCents` en la serie, `mrrActualNetoCents` en la otra.
- La respuesta de la serie **no contiene** en ninguna parte la cadena `mrrActualNetoCents`.

---

## 11. Checklist

- [ ] Escenario 1: la serie responde `200`, con `criterio: "pagos"`, meses en orden y sin huecos, y máximo 12 puntos
- [ ] Escenario 2: el cobro de tres meses aporta lo mismo a cada uno; ninguno se lleva el importe completo
- [ ] Escenario 3: un mes sin cobros vale `0`, con `confiabilidad: "baja"` y motivo `"sin-pagos-en-el-mes"`
- [ ] Escenario 4: el mes en curso viene con `confiabilidad: "baja"` y motivo `"mes-en-curso"`, aunque tenga dinero
- [ ] Escenario 5: `pagosSinPeriodoExcluidos` cuadra con la consulta y el cobro sin periodo no aparece en ningún mes
- [ ] Escenario 6: el cobro de la suscripción dada de baja no aparece en ningún mes ni en los excluidos
- [ ] Escenario 7: `?meses=3` recorta la ventana; `?meses=40`, `?meses=0` y `?meses=doce` responden `422` con `PLT.MET.VAL_INPUT`
- [ ] Escenario 8: el usuario sin marcador de plataforma recibe `403` sin campo `code`; sin token, `401`
- [ ] Escenario 9: los dos endpoints dan números distintos y la serie lo declara con `criterio: "pagos"`
