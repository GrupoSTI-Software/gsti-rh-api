# Nota spike — Transferencia SPEI de Stripe en sandbox

| Campo | Valor |
| --- | --- |
| **Historia** | VLRH-H1791925351017 — Spike de transferencia SPEI de Stripe en sandbox |
| **Capacidad** | VLRH-C0191 — Cobro por transferencia SPEI |
| **Origen** | VLRH-A0037 (2026-10-13), decisión de cobrar por SPEI vía Stripe |
| **Estado** | En curso — **P1–P8, P4–P6 cerradas** · P7 parcial · **P9 en ejecución** · pendiente P10 |
| **Entorno** | Stripe **modo prueba**, cuenta **México** |
| **Ejecutor** | Jose Soto (prueba manual Dashboard) |
| **Fecha inicio / cierre** | 2026-10-15 / _pendiente_ |

> **Destino canónico:** copiar o mover esta nota a `_docs/` de **VLRH-C0191** en el repositorio de planeación cuando exista la carpeta. Mientras tanto vive en `docs/spike/` de `valanserh-api` como borrador de trabajo.

## Propósito

Documentar, con **evidencia del sandbox**, el comportamiento real de Stripe al cobrar por **transferencia SPEI** (`collection_method: send_invoice`, fondos vía **customer cash balance** / CLABE virtual), para:

- Confirmar o **corregir R1–R3** de VLRH-C0191 antes de detallar las historias de implementación.
- Cerrar premisas de **VLRH-H1791925352373** (cobro fallido / tope de cuenta) y **VLRH-H1791925353056** (líneas negativas en factura MXN).
- Alimentar después el catálogo de errores (**VLRH-H1791925350337**); esta prueba **no** espera ese catálogo.

## Reglas de la prueba (recordatorio)

- Solo **test mode**; nunca cuenta en vivo ni datos de empresas reales.
- No publicar: llaves API, secretos de webhook, URLs completas de hosted invoice, direcciones de factura sensibles.
- **CLABE:** anotar enmascarada (solo **últimos 4 dígitos**).
- Webhooks: pegar **recortados** (tipo, id, campos relevantes; sin firma).
- Tiempo acotado (SP 2): lo no respondido → sección **Preguntas abiertas** con lo intentado y bloqueo.
- Al **cerrar:** eliminar **test clocks** creados para esta prueba.

## Herramientas usadas

| Herramienta | Uso en esta prueba |
| --- | --- |
| Dashboard Stripe (test) | Clientes, suscripciones, facturas, balance, CLABE |
| Stripe CLI `listen` / reenvío | Capturar webhooks; CLI reciente exige `--events`, `--all-thin` o `--all-snapshot` (no listen vacío) |
| Test clock | Avanzar periodos de suscripción |
| API / curl (opcional) | Crear objetos, simular fondos si aplica |

**Cuenta Stripe (test):** plataforma en URL `acct_1UL8ULLHD9Fgztxb` · en suscripción aparece **cuenta del cliente** Connect `acct_1UQpsZLHD9BWFDGd` (no confundir con `cus_`)  
**Versión API usada en Valanserh (referencia):** `2026-08-26.dahlia` · SDK `stripe@22.6.2`

---

## Inventario de objetos de prueba

Completar al crear escenarios; reutilizar ids entre preguntas cuando aplique.

| Escenario | Test clock | Customer | Subscription | Invoice | Otros |
| --- | --- | --- | --- | --- | --- |
| A — Alta send_invoice + balance | — | `cus_VRjLQSj7on4mAv` | `sub_1UQqFRLHD9FgztxbHxwZ5jrt` | `in_1UQqFRLHD9FgztxbzY27TltV` | ítem `si_VRjiwLLAvCI0C7` |
| B — Transición tarjeta ↔ send_invoice | — | `cus_VRRgNr3Excad40` (Soto stripe2) | `sub_1UQYnsLHD9FgztxbQ6S7YqBs` | factura pagada `…HVBS7ET-0001` (0 MXN trial) | ítem `si_VRRhRFRLv3SmIN` · PM alta `pm_1UQYnq…4242` |
| C — Factura tarjeta pagada con balance (vencido) | test clock | `empresastripe@prueba.com` | Plan registro QA **cancelada** | `in_1UQX51LHD9FgztxbuuLj0FI6` | `YMWHZLQP-0005` · 150 MXN **Fallido** |
| D — Pago de más | | | | | |
| E — Pago de menos | — | `cus_VRjNg3cmJyI8sH` | `sub_1UQqyALHD9FgztxbWeQwz4La` | `in_1UQqyALHD9FgztxbD9cB1Ef3` | saldo 50 MXN vs factura 100 |
| F — Tope > 999 999.99 MXN | — | `cus_VRnIWCQeYnOss3` | subs 999 999.99 + **1M** activas | `in_1UQtoy…` / `in_1UQtjm…` | `QIP6RRLB-0001/0002` · sub 1M `sub_1UQtoyLHD9FgztxbWm4icfb2` |
| G — Límite de cuenta (recurrente) | _(opcional)_ | _(nuevo o reutilizar)_ | `charge_automatically` | _(fallida)_ | tarjeta **0341** · escuchar `invoice.payment_failed` |
| H — Líneas negativas MXN | | | | | |
| P6 — Flujo integrado SPEI | — | `cus_VRmo79Hcradot2` | (sub activa Producto Prueba Transferencia) | `in_1UQtFiLHD9FgztxbchyBWHml` | `SIMWMODC-0001` |

---

## P1 — Datos que recibe la empresa para transferir

**Pregunta:** Al crear una suscripción con **`collection_method: send_invoice`** y método de pago / flujo de **customer balance** (transferencia SPEI), ¿qué datos recibe la empresa para transferir?

Documentar al menos:

- [x] CLABE virtual (enmascarada: `**************2590`) — en hosted invoice, pestaña **Transferencia bancaria**
- [x] Nombre del banco / clave de banco — **CITI MEXICO** · código bancario **124**
- [x] Referencia, concepto o instrucciones de pago — referencia numérica **`914535`**; texto: transferencia **SPEI** a la CLABE indicada; *«Si es posible, incluye el código de referencia con la transferencia bancaria»*; titular mostrado: razón social del emisor en test («Entorno de prueba de Joses»)
- [x] Monto a transferir y moneda — **100.00 MXN** (cabecera de hosted invoice; debe coincidir con importe de factura)
- [x] Vencimiento de la factura / plazo para pagar — **14 de noviembre de 2026** en página de pago; configuración **30 días** tras envío
- [x] Dónde los ve el pagador — **correo** con enlace → **hosted invoice** (`invoice.stripe.com`, badge «Entorno de prueba»); métodos visibles en página: **Tarjeta** y **Transferencia bancaria** (instrucciones SPEI al expandir transferencia). PDF de factura disponible en la misma página.

**Respuesta:**

Se creó en Dashboard (test) la suscripción del escenario A con:

- **`collection_method`:** «Enviar factura» (`send_invoice`); facturación **flexible**; vence **30 días después de enviar** la factura.
- **Producto:** Producto Prueba Transferencia · **100 MXN/mes** · periodo actual 15 oct – 15 nov 2026.
- **Métodos de pago en la factura/suscripción:** tarjeta, **Transferencia bancaria**, Link (activados en «Administrar métodos de pago» al crear la suscripción). En la **hosted invoice** probada solo se ofrecen **Tarjeta** y **Transferencia bancaria** (Link no aparece como tercera fila en esta vista).

**Factura** `in_1UQqFRLHD9FgztxbzY27TltV` · número en página de pago **`IBPZXV6O-0001`** (tras envío de prueba por correo).

**Instrucciones SPEI** (hosted invoice → Transferencia bancaria):

| Campo | Valor observado (sandbox) |
| --- | --- |
| Titular de la cuenta | Nombre comercial del emisor en Stripe test |
| CLABE | `**************2590` (18 dígitos; solo últimos 4 en esta nota) |
| Referencia | `914535` |
| Código bancario | `124` |
| Banco | CITI MEXICO |

La página incluye acordeones opcionales («Banco», «Titular de la cuenta») por si el banco del ordenante pide direcciones.

**Flujo temporal:** la factura nació en **borrador** (~1 h antes del envío automático); al **enviar factura de prueba** por correo, el pagador abre el enlace y ya ve monto, vencimiento y CLABE. No fue necesario simular transferencia para obtener instrucciones.

**R1 (hipótesis):** **confirmada en configuración y UX** — cobro recurrente por transferencia exige `send_invoice` + habilitar transferencia bancaria; Stripe no cobra solo; la empresa paga con SPEI usando datos de la hosted invoice; estado de pago dependerá de recepción de fondos (webhooks: validar en P4–P6).

**Implicación producto:** Valanserh deberá **mostrar o enlazar** la hosted invoice (o replicar campos autorizados) al ofrecer transferencia; la CLABE **no** estaba en el detalle de factura en Dashboard mientras era borrador.

**Evidencia:**

- Ids: `cus_VRjLQSj7on4mAv`, `sub_1UQqFRLHD9FgztxbHxwZ5jrt`, `in_1UQqFRLHD9FgztxbzY27TltV`, `si_VRjiwLLAvCI0C7`
- Dashboard: suscripción «Enviar factura», factura emitida, envío de prueba por correo
- Hosted invoice: MXN 100.00, vencimiento 14 nov 2026, SPEI con CLABE/referencia/banco (capturas C4, oct-2026)

**Notas / errores Stripe (tipo, código, mensaje):**

- Ningún error al crear (`POST /v1/subscriptions` → 200, 15/10/26 15:07:13).
- **Connect:** la suscripción muestra «Cuenta del cliente» `acct_1UQpsZ…` distinta del `acct_1UL8UL…` en la URL del Dashboard; el cliente de cobro es `cus_…` en esa cuenta conectada.

---

## P2 — Cambiar suscripción viva de tarjeta a send_invoice y regreso

**Pregunta:** Con suscripción **viva** (trial o activa), factura **abierta**, método de pago guardado (tarjeta):

1. ¿Se puede cambiar de cobro automático con tarjeta a **`send_invoice`** + balance?
2. ¿Se puede revertir de **`send_invoice`** a tarjeta?
3. ¿Qué pasa con la factura abierta, el PM por defecto y el periodo de prueba en cada transición?

Si Stripe rechaza una transición, anotar **error exacto** (tipo, código, mensaje).

**Respuesta — tarjeta → send_invoice:**

**Sí**, en sandbox, **sin error**.

- **Origen:** suscripción creada por alta Valanserh con **cargo automático** a tarjeta (`pm_…4242`), en **periodo de prueba** hasta **21 oct 2026** (plan QA **0 MXN/mes** en trial).
- **Cambio:** Dashboard → **Actualizar suscripción** → «Enviar factura al cliente…», **30 días** de vencimiento, enlace a página de pago, métodos **tarjeta + transferencia bancaria + Link**.
- **Cuándo aplicar:** modal «Aplicar actualizaciones» → **Inmediatamente** (15 oct 2026); Stripe también ofrece **al final del período** (21 oct) o fecha custom.
- **Resultado:** `collection_method` efectivo **Enviar factura**; vencimiento **30 días después del envío**; métodos habilitados incluyen **transferencia bancaria**.
- **Trial:** intacto — «En prueba hasta **21 oct**»; periodo actual **14 oct – 21 oct 2026**; **próxima factura** programada **21 oct** por **MXN 0.00** (borrador).
- **Factura abierta con importe:** **no** había factura abierta de cobro al cambiar (trial a 0 MXN). En historial aparece al menos una factura **Pagada** (`…HVBS7ET-0001`) asociada al trial, no un `open` con deuda.
- **PM tarjeta:** antes del cambio figuraba en Datos de la suscripción; **tras el cambio** el panel **Datos** ya no lista el PM (cobro por factura). **Pendiente confirmar** en ficha **Cliente** si `pm_1UQYnqLHD9Fgztxbt63VNBpC` sigue adjunto al customer (hipótesis: sí, pero deja de usarse hasta volver a cargo automático).

**Respuesta — send_invoice → tarjeta:**

**Sí**, en sandbox, **sin error**.

- **Cambio:** **Actualizar suscripción** → «**Cargar automáticamente un método de pago en el archivo**» → Visa **4242** (`pm_1UQYnqLHD9Fgztxbt63VNBpC`).
- **Resultado:** **Método de facturación** vuelve a **«Cargar a un método de pago específico»**; el PM **4242** reaparece en el panel **Datos** de la suscripción.
- **Trial:** sin cambio — **En prueba hasta 21 oct 2026**; próxima factura **21 oct**, **MXN 0.00**.
- **Facturas:** no se observó factura **abierta** bloqueando el cambio (mismo contexto trial a cero).

**Conclusión P2:** Stripe permite **ida y vuelta** entre cargo automático (tarjeta en archivo) y **send_invoice** en una suscripción viva en **trial**, aplicando el cambio **inmediato** desde Dashboard. Valanserh deberá exponer en API el equivalente (`collection_method`, `default_payment_method`, `payment_settings` / métodos de factura) y decidir si el cambio es inmediato o al fin de periodo (Stripe ofrece ambos en modal).

**Evidencia:**

- Suscripción `sub_1UQYnsLHD9FgztxbQ6S7YqBs` tras actualización inmediata (oct-2026): método **Enviar factura**, trial 21 oct, métodos con transferencia bancaria.
- Modal de scheduling «Inmediatamente» vs «21 oct» (captura previa al guardado).
- Misma suscripción tras **vuelta a tarjeta**: **Cargar a método específico**, `pm_…4242` visible, trial 21 oct (oct-2026).

**Estado final objetos (ids + status):**

| Objeto | Estado |
| --- | --- |
| `sub_1UQYnsLHD9FgztxbQ6S7YqBs` | Activa en **trial** · **send_invoice** · flexible |
| Próxima factura 21 oct | Borrador / **0 MXN** |
| Factura trial | **Pagada** (número `HVBS7ET-0001`) |

---

## P3 — Factura nacida para tarjeta, pagada con saldo (caso vencido)

**Pregunta:** ¿Una factura generada en flujo **charge_automatically** / tarjeta se puede pagar con **customer cash balance** (transferencia)? ¿Cómo (pasos en Dashboard o API)?

**Respuesta:**

Factura generada por suscripción **`charge_automatically`** (método **cargar PM predeterminado**), cobro automático **fallido** (tarjeta **0341** en test clock ~may 2027):

- **Estado:** **Fallido** · **150 MXN** · Stripe **desactivó el cobro automático** de esa factura y expuso **página de pago**.
- **Hosted invoice** (`YMWHZLQP-0005`): solo **tarjeta** (guardada 0341 o nueva); **no** aparece **Transferencia bancaria / SPEI** (a diferencia de facturas creadas con **send_invoice** + transferencia habilitada en P1).
- **Métodos habilitados en Dashboard** (Detalles de factura): tarjeta + **Link**; sin transferencia bancaria en la configuración de esa factura.

**SPEI vía hosted invoice (autoservicio pagador):** **No** en este caso — el vencido “de tarjeta” no ofrece el mismo checkout SPEI que send_invoice.

**Pago con cash balance (Dashboard / operador) — P3-d:**

1. Tras **Agrega una cuenta para transferencias bancarias**, aparece **MXN cash balance** en el customer (`cus_VPDhH2ThbzY58S`).
2. Simulación **150 MXN** fondos → saldo **150 disponible**; webhooks **`cash_balance.funds_available`** + **`customer_cash_balance_transaction.created`** (**200** al API).
3. Factura **`YMWHZLQP-0005`** sigue en contexto **Fallido**; los **150 no se auto-aplicaron** (saldo sigue disponible; distinto de facturas **send_invoice** abiertas).
4. **Cobrar la factura al cliente:** el desplegable **Método de pago** solo ofrece **tarjeta (0341)**; **no** aparece **Saldo en efectivo** / cash balance (a diferencia del modal P5 sobre factura send_invoice).

**Conclusión P3:** una factura **vencida/fallida de cargo automático** **no** expone SPEI al pagador en hosted invoice **ni** permite cobrar desde **cash balance** en el modal estándar del Dashboard, aunque el customer tenga saldo SPEI. Cerrar vencidos por transferencia (**8560**) probablemente requiere **API** (p. ej. pagar factura con balance), **nueva factura send_invoice** con transferencia habilitada, o **migrar** la suscripción a send_invoice — **escalar diseño**; no asumir paridad con P1/P6.

**Evidencia:**

- Factura fallida + hosted invoice solo tarjeta · customer con **MXN 150** cash balance · modal **Cobrar** solo Visa · webhooks balance (oct-2026 / reloj abr–may 2027).

**Implicación para VLRH-H1791925358560 (pagar vencido por transferencia):**

- **Autoservicio SPEI** sobre la misma factura de tarjeta: **no** (UI probada).
- **Operador Dashboard** con saldo ya ingresado: **no** vía «Cobrar al cliente» (solo tarjeta).
- Siguiente diseño: investigar **`invoices.pay`** / aplicación explícita de customer balance en API (fuera de alcance del spike UI) o **reemitir** cobro en modo send_invoice + CLABE (HU dedicada).

---

## P4 — Transferencia por **más** del monto de la factura

**Pregunta:** Si la empresa transfiere **más** que el `amount_due` de la factura abierta:

- ¿Qué pasa con el **cash balance** del customer?
- ¿Qué pasa con la **factura** (paid, partial, crédito)?
- ¿Cómo y cuándo se **devuelve el excedente**? ¿Plazo observado vs documentación (p. ej. 75 días)?

**Montos de prueba:** factura **100** MXN · fondos simulados **1000** MXN · excedente observado **900** MXN en saldo

**Respuesta:**

En test, tras **añadir fondos** al **cash balance MXN** del customer (`cus_VRjLQSj7on4mAv`) por **1000 MXN** con factura **`in_1UQqFRLHD9FgztxbzY27TltV`** (`IBPZXV6O-0001`) **abierta** por **100 MXN**:

1. Stripe **aplicó automáticamente 100 MXN** a la factura (actividad: *«pago de MXN 100.00 aplicado correctamente»*, 15 oct ~15:42).
2. La factura pasó a **Pagada**; suscripción **Producto Prueba Transferencia** sigue **Activa**; próximo ciclo **15 nov** (100 MXN).
3. En el customer, **saldo disponible ≈ 900 MXN** (1000 − 100); el **excedente permanece en cash balance**, no se devolvió al banco en test.
4. En **Pagos** apareció un intento/registro por **100 MXN** (*Subscription creation*) momentáneamente **Incompleto** antes de cuadrar con la aplicación a factura — revisar en detalle del pago si el estado final es `succeeded` vía balance.

**Devolución del excedente (900 MXN):** no observada en esta pasada; queda **crédito en balance** para futuras facturas o devolución según reglas Stripe (documentación ~75 días — validar en doc vigente o prueba aparte).

**R3 (hipótesis):** el saldo **900** en Stripe es espejo del crédito del tenant; Valanserh debe **registrar saldo a favor** y alertar desfase si la BD no coincide.

**Evidencia (balance transactions, customer balance, invoice):**

- Factura pagada `IBPZXV6O-0001` · `in_1UQqFRLHD9FgztxbzY27TltV` · actividad 15:19 finalizada / 15:42 pago aplicado (oct-2026).
- Customer: cash balance **900** disponible tras funding 1000 (captura oct-2026).

**Implicación para VLRH-H1791925357171 (conciliación pago de más):**

- Conciliar **monto transferido (1000)** vs **aplicado a factura (100)** vs **saldo remanente (900)**; no asumir que todo el SPEI se consume en una factura.

---

## P5 — Transferencia por **menos** del monto de la factura

**Pregunta:** Si la empresa transfiere **menos** que el `amount_due`:

- ¿Estado de factura y balance?
- ¿Stripe aplica pago parcial automáticamente?
- ¿Qué hace falta para completar el pago?

**Montos de prueba:** factura **100** MXN · fondos en balance **50** MXN · faltante **50** MXN (hasta aplicar saldo o nueva SPEI)

**Respuesta:**

Cliente nuevo **TransferenciaSpei** (`cus_VRjNg3cmJyI8sH`): primero se simularon **50 MXN** en **cash balance**; después suscripción **send_invoice** 100 MXN/mes (`sub_1UQqyALHD9FgztxbWeQwz4La`) y factura **`in_1UQqyALHD9FgztxbD9cB1Ef3`** (`FB3WKVVW-0001`) **finalizada y enviada** (15 oct ~15:58).

**Comportamiento observado (fondos &lt; adeudo):**

1. Factura queda **Abierta** con **100 MXN** pendientes (correo y hosted invoice: *Amount due 100*, *Amount paid 0*).
2. Los **50 MXN** **no** se aplicaron solos al finalizar/enviar la factura (a diferencia del escenario P4, donde al entrar fondos con factura abierta Stripe aplicó 100 automáticamente).
3. El Dashboard muestra aviso: *«El cliente tiene MXN 50.00 de saldo en efectivo… disponible para aplicar al saldo pendiente de MXN 100.00»* con acción **«Aplicar a la factura»** (aplicación **manual** desde operador o paso explícito).
4. La **hosted invoice** sigue pidiendo el **total 100 MXN** por SPEI (CLABE/referencia propias de la factura; referencia de prueba `939193`, CLABE enmascarada `**************5712`).

**Aplicación parcial (Dashboard):** acción **Cobrar al cliente** / aplicar saldo → **50 MXN** desde *Saldo en efectivo* hacia factura `FB3WKVVW-0001`. Vista previa Stripe: estado **Abierta** → **Pagada parcialmente**; **saldo impago MXN 50.00**; pago **50 aplicado** (confirmar con **Confirmar** en modal).

**Conclusión conciliación:** pago de menos deja factura **`open` / partially paid** con **`amount_remaining` 50**; el crédito en balance se consume al aplicar; falta segundo ingreso SPEI o nueva aplicación por **50** para cerrar la factura.

**Segundo ingreso (50 MXN simulados) con factura parcial:** al añadir **50 MXN** más al cash balance con **50 MXN** aún pendientes en `FB3WKVVW-0001`, Stripe **aplicó automáticamente** el segundo tramo; factura pasó a **Pagada** (100 MXN); actividad 15 oct ~17:21 *«pago de MXN 50.00 aplicado correctamente»* tras el pago manual parcial de las 16:02. **Regla práctica:** fondos que **completan** el `amount_remaining` tras un pago parcial se **auto-aplican**; fondos previos al **finalize** de la factura no (ver arriba).

**Tras confirmar aplicación de 50 MXN:**

- Factura `FB3WKVVW-0001`: estado **Pagada parcialmente**; **50 MXN** pendientes (cabecera Dashboard); actividad ~15 oct 16:02.
- **Pago** **50 MXN** · **Exitoso** · descripción *Factura FB3WKVVW-0001* (desde saldo en efectivo).
- **Cash balance** del customer: **0.00 MXN** disponible.
- Permanece pago **50 MXN · Incompleto** (*Subscription creation*, 15:58) — artefacto del alta; no confundir con el pago exitoso a factura.

**Evidencia:**

- Factura abierta 100 MXN + banner aplicar 50 (oct-2026).
- Correo/hosted invoice con 100 adeudados (oct-2026).
- Factura parcial + pago exitoso 50 + saldo 0 (oct-2026).

**Implicación para VLRH-H1791925357171 (conciliación pago de menos):**

- Valanserh debe soportar **factura open** con **cash balance &gt; 0** sin asumir pago completo; distinguir **fondos recibidos** vs **aplicados a factura**; el Dashboard Stripe permite aplicación manual — definir si el producto auto-aplica al webhook de entrada o solo al umbral que cubre el adeudo (P4 vs P5).

---

## P6 — Webhooks al recibir fondos y al pagar la factura

**Pregunta:** Listar los **eventos** que Stripe envía, en **orden cronológico**, desde que entra una transferencia hasta que la factura queda pagada (o el estado final observado).

Para cada evento:

### Corrida integrada A→D (cerrada) — oct-2026

Cliente **`cliente`** (`cus_VRmo79Hcradot2`): suscripción **100 MXN** send_invoice · factura **`in_1UQtFiLHD9FgztxbchyBWHml`** (`SIMWMODC-0001`) **Abierta** → simulación **100 MXN** fondos → **Pagada** (~18:25).  
`stripe listen` con `--events` **clásicos** (sin `--all-thin`); forward `http://127.0.0.1:3333/api/webhooks/stripe`; **todos [200]**.

| Orden | Hora (CST) | `event.type` | `event.id` (parcial) | API Valanserh hoy |
| --- | --- | --- | --- | --- |
| 1 | 12:20:30 | `invoice.finalized` | `evt_…` | **Ignored** (sin handler) |
| 2 | 12:20:30 | `invoice.updated` | `evt_…` | **Ignored** |
| 3 | 12:25:38 | `customer_cash_balance_transaction.created` | (×2 en el mismo segundo) | **Ignored** — **7171:** registrar ingreso SPEI |
| 4 | 12:25:38 | `invoice.paid` | `evt_1UQtLS…QiR3a1` | **Handler 7693** si hay sub en BD; si no, **ignored** |
| 5 | 12:25:38 | `payment_intent.succeeded` | `evt_…` | **Ignored** |
| 6 | 12:25:38 | `charge.succeeded` | `evt_…` | **Ignored** |
| 7 | 12:25:39 | `invoice.updated` | `evt_…` | **Ignored** |

`cash_balance.funds_available` **no** apareció en esta corrida (sí en pasada `--all-thin`); no bloquea: **`customer_cash_balance_transaction.created`** basta para detectar fondos.

**Escenario parcial P5 (referencia):** cierre con segundo **50 MXN** en `in_1UQqyALHD9FgztxbD9cB1Ef3` — misma terna **charge → payment_intent → invoice.paid** (~11:21 CST).

**Eventos de entrada de fondos (SPEI simulado → balance)** — cliente `cus_VRjNg3cmJyI8sH` con saldo **0**, `stripe listen --all-thin`, +**50 MXN** de prueba (15 oct ~12:03 CST):

| Orden | Tipo (CLI) | `evt_…` (prefijo) | POST API |
| --- | --- | --- | --- |
| 1 | `cash_balance.funds_available` (thin: `v1.cash_balance.funds_available`) | `evt_test_65VaGxZ6lDC…` | **400** |
| 2 | `customer_cash_balance_transaction.created` (thin: `v1.customer_cash_balance_transaction.created`) | `evt_test_65VaGxZ6yzHw…` | **400** |

**Interpretación:** Stripe avisa **primero** fondos disponibles en balance, **después** la transacción de cash balance del customer. Valanserh **no registra** hoy esos tipos (`billing_provider_event_handlers.ts` solo `invoice.*`, `customer.subscription.*`); el **400** en spike con `--all-thin` es coherente con verificación/formato distinto del payload thin — **no** invalida la existencia de los eventos (confirmar payload en **Developers → Eventos**). Para **7171** harán falta handlers o cola que consuma estos tipos **antes** de `invoice.paid` cuando el pago sea SPEI.

**Cierre de factura (tramo ya capturado):** terna **charge + payment_intent + invoice.paid** con **200** (filtro `--events` clásico, sin thin).

**Payload recortado (ejemplo del evento más importante):**

```json
{ "type": "invoice.paid", "data": { "object": { "id": "in_1UQtFiLHD9FgztxbchyBWHml", "status": "paid", "amount_paid": 10000, "customer": "cus_VRmo79Hcradot2" } } }
```
*(montos en centavos; ejemplo corrida integrada P6)*

**Respuesta narrativa:**

El registro de pago **como hoy** puede apoyarse en **`invoice.paid`** cuando la factura queda **paid** (incluye cierre tras pagos parciales acumulados). Los pagos **parciales** intermedios generan **`invoice.updated`** y pagos **Exitoso** en Dashboard antes del `invoice.paid` final — **7171** debe escuchar o consultar estados parciales, no solo el cierre.

**Brecha vs registro actual de pagos (hipótesis):**

- Sin handler de **balance / fondos entrantes**, Valanserh no ve el SPEI hasta que Stripe **aplica** y eventualmente emite **`invoice.paid`** (o habría que persistir en **`invoice.updated`** / transacciones de balance).
- **`invoice.paid`** no distingue tarjeta vs balance en la premisa del spike; hay que validar en payload `charge`/`payment_intent` asociado (P7).

### P6 — Flujo end-to-end (modelo esperado)

Secuencia **lógica** para SPEI simulado → factura **send_invoice** pagada (unir tramos ya probados):

| Fase | Acción en test | Eventos esperados (orden típico) | ¿Registra Valanserh hoy? |
| --- | --- | --- | --- |
| A | Simular transferencia / **añadir fondos** al customer (sin factura abierta o antes de aplicar) | `cash_balance.funds_available` → `customer_cash_balance_transaction.created` | **No** (sin handler; spike: **200 ignored** si payload clásico, **400** con `--all-thin`) |
| B | Factura **finalizada** / enviada | `invoice.finalized`, `invoice.updated` | **No** / parcial (`invoice.created` sí está registrado en otro momento del ciclo) |
| C | Stripe **aplica** balance a factura abierta | `charge.succeeded`, `payment_intent.succeeded`, `invoice.updated` | **No** / parcial |
| D | Factura queda **paid** | `invoice.paid` | **Sí** (7693) |

**Corrida integrada:** completada — ver tabla «Corrida integrada A→D» arriba.

**Campos mínimos por tipo (7171 / registro):**

| `event.type` | Campos a copiar (recortados) |
| --- | --- |
| `customer_cash_balance_transaction.created` | `customer`, `net_amount`, `currency`, `type`, `ending_balance`, `invoice` (si viene) |
| `cash_balance.funds_available` | `customer`, `available_balance`, `currency` |
| `invoice.updated` / `invoice.paid` | `id`, `customer`, `subscription`, `status`, `amount_paid`, `amount_remaining`, `payment_intent` |
| `payment_intent.succeeded` | `id`, `amount_received`, `customer`, `invoice`, `payment_method_types` |

---

## P7 — ¿El pago con balance llega como pago normal o “pagado fuera de Stripe”?

**Premisa para implementación:** El pago aplicado desde cash balance debe aparecer como **pago normal** con monto pagado, **no** como `paid_out_of_band` / pagado fuera de Stripe (que hoy el sistema ignora).

**Pregunta:** ¿Qué muestra la API/Dashboard en `PaymentIntent`, `Invoice`, `Charge` o equivalente?

**Respuesta:** **Confirmada en webhook (parcial en API)** — al cerrar la factura P5, `stripe listen` recibió **`charge.succeeded`** y **`payment_intent.succeeded`** antes de **`invoice.paid`** (no solo `paid_out_of_band`). Eso indica **pago normal** vía rail de balance, no «marcada pagada fuera de Stripe». Valanserh hoy reacciona sobre todo a **`invoice.paid`**; los PI/charge confirman monto para auditoría (7171 / 7693).

**Evidencia:** `evt_1UQsLI…` (`invoice.paid`), `evt_3UQr2d…` (`payment_intent.succeeded`, `charge.succeeded`) · factura `in_1UQqyALHD9FgztxbD9cB1Ef3` **Pagada** 100 MXN (oct-2026). _Opcional:_ en Workbench abrir PI y verificar `paid_out_of_band === false`.

---

## P8 — Periodo mayor al tope **999 999.99 MXN** (pago no tarjeta)

**Regla C0191 R2:** no ofrecer por transferencia un periodo que exceda el tope.

**Pregunta:** ¿Qué responde Stripe (tipo, código, **en qué momento**: crear suscripción, generar factura, recibir transferencia) si el monto del periodo supera **999 999.99 MXN**?

**Contraste con tope Valanserh al registrar pago:** Valanserh (R2) no debe **ofrecer** transferencia si el periodo **>** 999 999.99; validación **antes** de crear cobro send_invoice en producto.

**Respuesta (parcial — en el tope):**

**999 999.99 MXN** (justo en R2): **Stripe acepta** suscripción **send_invoice** + **transferencia bancaria** · factura **`QIP6RRLB-0001`** (`in_1UQtjmLHD9Fgztxbi22oBQ9G`) **Abierta** · correo al cliente · hosted invoice con **SPEI** (CLABE enmascarada `**************0597`, referencia `115908`) por **999 999.99 MXN** · vencimiento 14 nov 2026. Webhooks: `invoice.finalized`, `invoice.updated` (**200**). **Momento:** crear/finalizar factura **sin error** en el límite.

**1 000 000.00 MXN (un centavo por encima de R2 Valanserh, entero redondo):** **mismo comportamiento** — suscripción «producto millon» **Activa** · factura **`QIP6RRLB-0002`** (`in_1UQtoyLHD9Fgztxb40QIBFrS`) **Abierta** · **1 000 000.00 MXN** · **Enviar factura** · transferencia habilitada · finalizada y **correo** (como 999 999.99) · webhooks `invoice.finalized` / `invoice.updated` (**200**). **No** hubo error al **crear suscripción** ni al **finalizar** factura.

**Momento del tope Stripe (sandbox):**

| Momento | 999 999.99 | 1 000 000.00 |
| --- | --- | --- |
| Crear sub + factura send_invoice + SPEI en hosted invoice | **Permitido** | **Permitido** (factura abierta) |
| **Simular transferencia** («Agregar fondos al saldo de caja») | **Permitido** → pagó `QIP6RRLB-0001` (**Pagada**; pago **Exitoso**; webhooks balance + `invoice.paid`) | **Rechazado** en UI: *«El importe no puede ser superior a $999,999.99»* (no llega a ingresar fondos) |

El tope **999 999.99 MXN** de C0191 **coincide con Stripe** en el **ingreso SPEI / cash balance**, no al **emitir** factura por 1M. Riesgo: factura **1M abierta** sin vía SPEI para saldarla en test (solo tarjeta o fraccionar pagos &lt; tope — fuera de alcance).

**R2 — propuesta:** **Confirmada** — tope **999 999.99** por pago no tarjeta; Valanserh debe **no ofrecer** periodos &gt; tope **y** evitar facturas send_invoice transferibles &gt; tope, porque el pagador **no puede** simular/recibir SPEI por encima del tope aunque la factura exista.

**Evidencia:**

- Factura 999 999.99 pagada vía fondos simulados · webhooks 13:00 (`customer_cash_balance_transaction.created`, `invoice.paid`, …) (oct-2026).
- Factura 1M abierta · modal fondos rechaza 1M · listado facturas Pagada vs Abierta (oct-2026).

---

## P9 — Rechazo por **límite de cuenta** en cobro recurrente fallido

**Premisa para VLRH-H1791925352373:** Un rechazo por límite/topo de la **cuenta Stripe de Valanserh** podría llegar en el webhook **`invoice.payment_failed`**.

**Pregunta:** ¿Se pudo provocar en sandbox un fallo recurrente por límite de cuenta? Si sí, ¿cómo llega en el evento (campos, códigos)? Si no, documentar intentos.

**Respuesta:** Confirmada / Refutada / **Abierta**

**Qué buscamos (2373 / 0337):** En **`invoice.payment_failed`**, el motivo legible sale de **`PaymentIntent.last_payment_error`** (o equivalente al re-leer la factura): `type`, **`code`**, **`decline_code`** (si aplica), `message` recortado. Valanserh ya persiste **`code` + `decline_code` crudos** en el webhook y mapea `charge_exceeds_transaction_limit` / `charge_exceeds_source_limit` → **`cobro-restringido-por-el-procesador`** (acción **Valanserh**).

**Hipótesis Stripe (docs):** `charge_exceeds_transaction_limit` aparece cuando un cargo con **débito bancario** superaría el **límite de volumen de la cuenta**; **no** hay tarjeta de prueba documentada que lo dispare — en sandbox suele simularse en tests automatizados o verse en **live** con límites reales.

**Lo intentado (guion — completar con ids y capturas):**

| Paso | Acción | Objetivo |
| --- | --- | --- |
| **G0** | `stripe listen --forward-to http://127.0.0.1:3333/api/webhooks/stripe --events invoice.payment_failed,invoice.updated,customer.subscription.updated,payment_intent.payment_failed` | Capturar fallo recurrente sin ruido `--all-thin` |
| **G1** | Cliente nuevo · sub **mensual** · **Cobro automático** (`charge_automatically`) · **500 MXN** · tarjeta **4242** → primera factura **pagada** | Baseline recurrente tarjeta |
| **G2** | Cambiar PM predeterminado a **4000 0000 0000 0341** (falla genérica) | Provocar **`invoice.payment_failed`** en renovación o al **Cobrar** factura abierta |
| **G3** | **Test clock** (recomendado) avanzar al **fin de periodo** _o_ factura abierta → **Reintentar cobro** | Fallo en ciclo **recurrente**, no solo alta |
| **G4** | Dashboard → **Developers → Eventos** → abrir `invoice.payment_failed` · copiar recorte JSON | Campos `data.object.id`, `status`, `subscription`, `customer`, `attempt_count` |
| **G5** | Misma factura → **PaymentIntent** enlazado → **`last_payment_error`** (`code`, `decline_code`, `type`, `message`) | Lo que lee `readInvoicePaymentFailure` en API |
| **G6** | ✅ Revisión P8 — cliente **`cus_VRnIWCQeYnOss3`** · factura **`QIP6RRLB-0002`** (`in_1UQtoy…`) | Ver **G6 abajo** — **no** es `payment_failed` |
| **G7** | Si G1–G6 **no** arrojan `charge_exceeds_*`: marcar premisa **no reproducible en sandbox MX**; citar [error codes](https://docs.stripe.com/error-codes) + [changelog transaction limit](https://docs.stripe.com/changelog/acacia/2024-09-30/error-code-transaction-limit) | Cierre honesto para 2373 |

**No confundir con P8:** tope **999 999.99** en **simular SPEI / cash balance** ≠ límite de **procesamiento de cuenta** en cargo recurrente.

### G6 — Revisión factura 1M (`QIP6RRLB-0002`) — **no cuenta para P9**

En Workbench se filtró **`v1.invoice.finalized`** (evento **`invoice.finalized`**, p. ej. `evt_1UQtoNLHD9FgztxbUWCX2Hjv`, 15 oct 18:56:33). El payload es la **factura finalizada**, no un fallo de cobro.

| Campo (factura `in_1UQtoyLHD9Fgztxb40QIBFrS`) | Valor | Lectura P9 |
| --- | --- | --- |
| `collection_method` | **`send_invoice`** | No hay cobro automático al crear |
| `attempted` / `attempt_count` | **`false` / `0`** | Stripe **no intentó** cobrar tarjeta |
| `last_finalization_error` | **`null`** | Finalizar factura **OK** (no error de cuenta) |
| `next_payment_attempt` | **`null`** | Coherente con send_invoice |
| `status` | **`open`** | Espera pago (SPEI/tarjeta en hosted invoice) |
| `payment_settings.payment_method_types` | `card`, **`customer_balance`**, `link` | Mismo patrón P1/P8 |
| `billing_reason` | `subscription_create` | Alta de sub «producto millon» |

El pago **«Incompleto»** en la ficha del cliente al alta de la sub **1M** **no** implica `invoice.payment_failed` ni `charge_exceeds_*`: con **send_invoice** la primera factura queda **abierta** sin intento de cargo. **No hay PaymentIntent con `last_payment_error`** en este tramo para analizar límite de cuenta.

**Conclusión G6:** descartado como evidencia de límite de cuenta; sigue pendiente **G1–G5** (sub **`charge_automatically`** + **0341** + evento **`invoice.payment_failed`**).

**Por qué no aparece `invoice.payment_failed` en Eventos para esta factura:** Stripe solo emite **`invoice.payment_failed`** cuando **falla un intento de cobro** de la factura (p. ej. suscripción **`charge_automatically`**, reintento Smart Retries, o pago en hosted invoice que llega a PI y **declina**). Con **`send_invoice`**, al crear/finalizar la factura 1M Stripe **no cobra** (`attempted: false`) → solo verás **`invoice.created` / `invoice.finalized` / `invoice.updated`**, factura **`open`**. Eso **no** demuestra ausencia de límites de cuenta; solo que **este flujo no genera el evento** que P9 necesita.

**Evidencia (`invoice.finalized` recortado — G6, no P9):**

```json
{
  "type": "invoice.finalized",
  "data": {
    "object": {
      "id": "in_1UQtoyLHD9Fgztxb40QIBFrS",
      "number": "QIP6RRLB-0002",
      "customer": "cus_VRnIWCQeYnOss3",
      "collection_method": "send_invoice",
      "amount_due": 100000000,
      "status": "open",
      "attempted": false,
      "attempt_count": 0,
      "last_finalization_error": null,
      "parent": { "subscription_details": { "subscription": "sub_1UQtoyLHD9FgztxbWm4icfb2" } }
    }
  }
}
```

**Evidencia (`invoice.payment_failed` recortado):**

```json
{
  "type": "invoice.payment_failed",
  "id": "evt_…",
  "data": {
    "object": {
      "id": "in_…",
      "status": "open",
      "customer": "cus_…",
      "subscription": "sub_…",
      "attempt_count": null
    }
  }
}
```

**PaymentIntent (recorte vía Dashboard o API):**

```json
{
  "id": "pi_…",
  "status": "requires_payment_method",
  "last_payment_error": {
    "type": "…",
    "code": "…",
    "decline_code": "…",
    "message": "…"
  }
}
```

**Tabla resultado P9 (rellenar):**

| ¿`charge_exceeds_transaction_limit` o `charge_exceeds_source_limit`? | Código observado | `decline_code` | ¿Llega en webhook sin re-leer PI? | Implicación 2373 |
| --- | --- | --- | --- | --- |
| **G6** — factura 1M send_invoice | _(ninguno — sin intento de pago)_ | — | N/A | El «Incompleto» de alta ≠ límite cuenta; repetir con **G1–G3** |
| **G1–G5** | _pendiente_ | | | |

---

## P10 — Líneas **negativas** en pesos mexicanos en factura de suscripción

**Premisa para VLRH-H1791925353056:** Stripe acepta ítems/líneas con importe negativo en MXN en la factura de una suscripción.

**Pregunta:** ¿Se pudo agregar línea negativa (API o Dashboard)? ¿Cómo queda en líneas y en `total`?

**Respuesta:** Confirmada / Refutada — _(detalle)_

**Evidencia:**

**Si refutada:** escalar a Wilvardo antes de abrir VLRH-H1791925353056.

---

## Reglas VLRH-C0191 — Confirmación o corrección (R1–R3)

Tratar R1–R3 como **hipótesis** hasta cerrar la nota. Wilvardo actualiza la ficha de la capacidad (R5).

### R1 — send_invoice + customer balance; reloj y estado dependen de fondos (webhook)

| | |
| --- | --- |
| **Texto vigente (resumen)** | Transferencia solo con `send_invoice` y balance; sin cargo automático; periodo/estado/desbloqueo según llegada de fondos vía webhook. |
| **Resultado spike** | ☐ Confirmada ☐ Corregida |
| **Corrección propuesta (si aplica)** | |

### R2 — Tope **999 999.99 MXN** por pago no tarjeta

| | |
| --- | --- |
| **Resultado spike** | ☑ **Confirmada** (con matiz) |
| **Corrección propuesta** | Matiz para implementación: validar tope al **ofrecer transferencia** y al **emitir** factura cobrable por SPEI, no solo al simular pago — Stripe puede **crear** factura 1M pero **bloquea transferencia &gt; 999 999.99**. Documentar mensaje UI Stripe para catálogo 0337 si aplica vía API. |

### R3 — Valanserh fuente de verdad del saldo a favor; cash balance en Stripe es espejo

| | |
| --- | --- |
| **Resultado spike** | ☐ Confirmada ☐ Corregida |
| **Corrección propuesta** | |

_(R4 convivencia tarjeta/transferencia y R5 delegación al spike no se reescriben aquí; R5 se cumple con esta nota.)_

---

## Catálogo provisional de errores (para VLRH-H1791925350337)

Anotar durante la prueba; no bloquea el spike.

| Momento | Operación | Tipo error Stripe | Código | Mensaje (recortado) | Id objeto |
| --- | --- | --- | --- | --- | --- |
| | | | | | |

---

## Preguntas abiertas y bloqueos

| # | Pregunta | Lo intentado | Bloqueo | Dueño / siguiente paso |
| --- | --- | --- | --- | --- |
| | | | | |

---

## Escalados a producto

| Tema | ¿Escalar? | Notas |
| --- | --- | --- |
| Cliente SPEI exige datos que **VLRH-H1791925351695** no envía | ☐ Sí ☐ No | |
| Líneas negativas MXN no soportadas (**3056**) | ☐ Sí ☐ No | |
| Otro | | |

---

## Cierre de la prueba

- [ ] Test clocks creados listados y **eliminados**
- [ ] Objetos de prueba identificados (opcional: archivar ids en tabla superior)
- [ ] Nota revisada: cada P1–P10 respondida o marcada abierta
- [ ] R1–R3 con confirmación o corrección propuesta
- [ ] Nota publicada en `_docs/` de **VLRH-C0191**

**Refs:** VLRH-H1791925351017

---

## Historias que consumen esta nota

| Código | Título |
| --- | --- |
| VLRH-H1791925356484 | Habilitar cobro recurrente por transferencia SPEI en suscripción Stripe |
| VLRH-H1791925357171 | Asentar transferencias recibidas y conciliar pagos de más o de menos |
| VLRH-H1791925358560 | Pagar por transferencia una factura vencida |
| VLRH-H1791925352373 | Resolver motivo legible del cobro fallido y alertar topes de cuenta |
| VLRH-H1791925353056 | Desglosar factura Stripe en bruto, tramo, código y alianza |
