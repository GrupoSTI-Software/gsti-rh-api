# Prueba manual — Precargar, ajustar y terminar la declaración de equipo propio

**Problema:** la declaración de equipo propio de la NOM-037 nació sin ciclo de vida. Al declararla había que capturar la cuota a mano aunque la empresa ya tuviera una **cuota estándar**; una vez vigente no se podía cambiar la cuota, la descripción ni las condiciones sin perder el rastro de lo que había antes; y una declaración **vigente** no se podía terminar: la categoría se quedaba marcada como equipo propio para siempre. Además, si la empresa terminaba entregando un activo de esa categoría, la declaración seguía vigente sin avisar, y quien dejaba de teletrabajar conservaba su declaración sin ninguna forma de cerrarla.

**Solución:** la cuota del alta se **propone con la cuota estándar** de la empresa y el sistema marca si quedó **Cuota estándar** o **Cuota ajustada**. Cada declaración vigente gana las acciones **Ajustar cuota** y **Terminar declaración**: al **ajustar**, la versión anterior se cierra y baja al histórico plegado **Declaraciones anteriores**, con su periodo y el motivo **Ajuste de cuota**, mientras la nueva queda vigente; al **terminar**, la declaración se cierra con fecha y un motivo del catálogo, la categoría vuelve a **Sin cubrir** y su renglón pasa al histórico. Si un **activo de la empresa** pasa a cubrir una categoría con declaración vigente, aparece el aviso de sustitución con su botón para terminar la declaración; y quien ya no teletrabaja conserva el bloque con **solo sus declaraciones vigentes** listadas para terminarlas.

Ejemplo: es como el recibo de la renta. Si el casero ya fijó la renta mensual, el recibo llega con ese monto y solo lo cambias si acuerdas otra cosa; si renegocias, el recibo viejo queda guardado con sus fechas y el nuevo empieza a contar; y si te mudas, el contrato se cierra con fecha y motivo, sin borrar los recibos anteriores.

## Glosario

- **Insumo de teletrabajo:** bien que la empresa le entrega a quien trabaja desde casa porque la NOM-037 lo exige (silla ergonómica, equipo de cómputo o impresión, aditamentos).
- **Categoría de la norma:** cada uno de los tres grupos que la matriz vigila: **Silla ergonómica**, **Equipo de cómputo o impresión** y **Aditamento**.
- **Equipo propio declarado:** la empresa registra que la persona cubre una categoría con su propio equipo y con una cuota mensual; no es un bien entregado por la empresa.
- **Cuota mensual:** el importe que la empresa paga cada mes por usar ese equipo propio.
- **Cuota estándar:** el monto mensual que la empresa fijó de antemano para el equipo propio; es el que el alta propone y el que decide si una cuota es estándar o ajustada.
- **Declaración vigente:** la versión que está en efecto hoy en una categoría (una sola por categoría).
- **Ajuste:** cambiar la cuota, la descripción o las condiciones de una declaración vigente sin perder la versión anterior.
- **Término:** cerrar una declaración vigente con su fecha de fin y el motivo por el que se cierra.
- **Aditamento:** accesorio que complementa el puesto en casa (monitor, teclado, diadema, reposapiés). La norma no obliga a entregarlo, por eso nunca se cuenta como un faltante.
- **Resguardo:** el vale con el que la persona recibe un activo.
- **Folio:** el número que identifica al activo en el inventario (por ejemplo `QA-TEL-ACT-SILLA-05`).
- **Listado de teletrabajadores:** el registro obligatorio de la NOM-037 con los colaboradores cuyo teletrabajo representa el 40% o más de su jornada.

## 1. Preparar

Prerrequisito: esta rama del API y la del backoffice están levantadas, y la base ya trae los módulos **Empleados** y **Activos e insumos**.

Ejecuta una vez el sembrador de QA compartido:

```bash
cd gsti-rh-api
node ace db:seed --files=database/seeders/_tmp_do_not_commit_qa_seeder.ts
```

Qué deja listo para esta prueba:

- **QA Fundadora**: la empresa donde se hace todo el recorrido, con la **cuota estándar** de equipo propio en `350.00`.
- Los **tres colaboradores** de la tabla de abajo, cada uno con el estado que prueba un escenario.
- Los **tipos de activo** con su categoría de la norma (entre ellos **Silla QA Insumos** con la categoría *Silla ergonómica*).
- La silla **`QA-TEL-ACT-SILLA-05`**, del tipo **Silla QA Insumos**, **en almacén**: sin resguardo. Se usa una sola vez, en el Escenario 4.6.
- Las **dos cuentas** de la §2.

**Señal para reconocer lo nuestro:** los colaboradores de esta prueba son `QA-TEL-02`, `QA-TEL-03` y `QA-TEL-09`; cualquier otro colaborador con código `QA-TEL-` es de otra historia y no se toca. El activo de esta prueba lleva folio `QA-TEL-ACT-SILLA-05`; cualquier otro activo de la empresa es de otra historia. El tipo de la silla termina en `QA Insumos`.

Estado de cada colaborador (lo que deja el sembrador):

| Código | Nombre | Modalidad y % | Con qué arranca | Escenario |
|---|---|---|---|---|
| `QA-TEL-02` | Ulises Pardo Gil | Híbrido, 20% | Una silla declarada como equipo propio ya **cerrada** (puebla **Declaraciones anteriores**) y las tres categorías sin cubrir | 4.1, 4.2, 4.3, 4.4, 4.5, 4.7, 4.9 |
| `QA-TEL-03` | Vera Quintero Lira | Híbrido, 40% | Ningún activo y ninguna declaración | 4.6 |
| `QA-TEL-09` | Berta Zamora Cano | Presencial (no teletrabaja) | Una silla declarada como equipo propio **vigente** | 4.8 |

Orden del recorrido: los escenarios se recorren **en orden**. Los Escenarios 4.1 a 4.5 escriben declaraciones sobre **Ulises Pardo Gil**, y los Escenarios 4.7 y 4.9 revisan ese mismo colaborador ya con ese estado, así que hay que llegar a ellos con esos cinco hechos. El **Escenario 4.6** asigna y luego devuelve la silla `QA-TEL-ACT-SILLA-05`; su último paso deja el activo como estaba. El **Escenario 4.8** termina la declaración vigente de **Berta Zamora Cano**.

## 2. Usuarios

Las dos cuentas entran por el backoffice con el mismo flujo: en `http://127.0.0.1:3000`, botón **Continuar con contraseña**, llena **Correo electrónico** y **Contraseña**, botón **Entrar**. Las dos usan la contraseña de prueba `«redacted-vault-secret»`.

| | Correo | Contraseña | Login | Permisos (variante) | Para qué se usa |
|---|---|---|---|---|---|
| **A** | `qa-own-equipment-full@gsti-tests.local` | `«redacted-vault-secret»` | Backoffice | lectura de **Empleados** y de **Activos e insumos** + administrar los suministros del colaborador (declara, ajusta y termina) | Escenarios 4.1 a 4.6, 4.8 y 4.9 |
| **B** | `qa-own-equipment-readonly@gsti-tests.local` | `«redacted-vault-secret»` | Backoffice | lectura de **Empleados** y de **Activos e insumos**, **sin** administrar los suministros del colaborador | Escenario 4.7 (no ve las acciones) |

Las dos cuentas pueden abrir la pantalla con la que arranca el backoffice (**Monitor de asistencia**): el sembrador concede la lectura de ese módulo a todos los roles de QA, así que la sesión no empieza en un aviso de permisos.

## 3. Dónde probar

La declaración vive dentro de la **matriz Insumos de teletrabajo** de la ficha del colaborador, en la sección **Activos**.

Para entrar: en `http://127.0.0.1:3000`, botón **Continuar con contraseña**, llena **Correo electrónico** y **Contraseña** con la cuenta que toque, botón **Entrar**. Al entrar, el backoffice abre siempre la pantalla **Monitor de asistencia**, que no es donde se prueba: del menú lateral entra a **Empleados**.

Para elegir la empresa (si el usuario tiene más de una): arriba a la derecha abre **Mi cuenta** (el avatar) y en el campo **Empresa** elige **QA Fundadora**.

Para llegar a la ficha: menú lateral → **Empleados**; busca a la persona por su código de nómina (por ejemplo `QA-TEL-02`) y, en su tarjeta, pulsa **Ver detalles**. La ficha abre en la sección **Información del empleado**.

La sección es **Activos**: está en el submenú lateral de la ficha, **al final**, con el icono de un portátil. Dentro, arriba, está la tarjeta **Insumos de teletrabajo**.

Cómo se lee la matriz, de arriba a abajo: el título; la leyenda que dice si el registro es obligatorio o preventivo; los chips de resumen; y las tres categorías de la norma, **cada una en su renglón** —el rótulo de la categoría, su chip de estado al extremo derecho y, debajo, lo que la cubre: los activos con su folio y sus chips, o la **declaración de equipo propio** (su descripción, sus condiciones si las hay, la línea con **Desde el …** y **$… al mes**, su chip de origen de cuota y, si la categoría tiene versiones cerradas, el bloque plegado **Declaraciones anteriores**), o la acción **Declarar equipo propio** cuando la categoría está pendiente y la cuenta puede escribir. Las tres categorías salen siempre en el mismo orden: silla, cómputo, aditamento.

URL directa de la sección: `http://127.0.0.1:3000/employees/` seguida del identificador propio de la ficha abierta y de `/assets`; la dirección **no** lleva `/es`.

Para el **Escenario 4.6**, la pantalla del catálogo de activos: menú lateral, grupo **Empresa** → **Activos e insumos**; ahí está el buscador **Buscar activo** y el filtro de **Estado**. URL directa: `http://127.0.0.1:3000/supplies`.

---

## 4. Escenarios que se recorren

Entra con el Usuario A (`qa-own-equipment-full@gsti-tests.local`) y elige la empresa **QA Fundadora**.

### 4.1 Declarar sin capturar la cuota: llega la estándar

Objetivo: comprobar que al declarar equipo propio sin tocar la cuota el alta propone la cuota estándar de la empresa, la guarda como **Cuota estándar** y la categoría deja de contar como pendiente, sin perder el histórico que ya tenía.

1. Con el Usuario A, abre la ficha de **Ulises Pardo Gil** (`QA-TEL-02`, Híbrido 20%) y entra a la sección **Activos**.
2. La tarjeta **Insumos de teletrabajo** trae la leyenda **Registro preventivo: no está en el listado de teletrabajadores** y el chip de resumen **2 sin cubrir**. El renglón **Silla ergonómica** muestra el chip **Sin cubrir**, su botón **Declarar equipo propio** y, plegado, **Declaraciones anteriores (1)**.
3. Despliega **Declaraciones anteriores (1)** y revisa el renglón que trae.
4. Pulsa **Declarar equipo propio** en el renglón **Silla ergonómica**. Se abre por la derecha un cajón titulado **Declarar equipo propio: Silla ergonómica**, con los campos **Descripción del equipo**, **Condiciones pactadas**, **Fecha de inicio** y **Cuota mensual (MXN)**, y los botones **Cancelar** y **Guardar**.
5. Llena **Descripción del equipo** con `Silla ergonomica de casa` y **Condiciones pactadas** con `Buen estado; uso exclusivo para trabajo`.
6. En **Fecha de inicio** elige el 1 de noviembre de 2026 (el campo queda como `2026-11-01`).
7. **No toques la Cuota mensual (MXN):** el campo llega precargado con el importe de la cuota estándar (`350`) y, debajo, la ayuda **Cuota estándar de la empresa: $350.00**.
8. Pulsa **Guardar**.

**Qué debe verse:**

- El cajón se cierra y aparece el aviso de guardado: **Silla ergonómica** con **Declaración guardada.**
- En el renglón **Silla ergonómica**, el chip **Sin cubrir** se cambió por **Equipo propio declarado**; la categoría sigue sin activos debajo y el botón **Declarar equipo propio** ya no está en ese renglón.
- Debajo del rótulo, la declaración vigente: **Silla ergonomica de casa**; en tono apagado y recortadas a dos líneas si son más largas, las condiciones **Buen estado; uso exclusivo para trabajo**; y en la línea de abajo **Desde el 01/11/2026**, **$350.00 al mes** y el chip **Cuota estándar**.
- El bloque plegado **Declaraciones anteriores (1)** sigue ahí con su renglón, ahora debajo de la nueva vigente.
- El chip de resumen de la tarjeta pasó de **2 sin cubrir** a **1 sin cubrir**: la silla ya no se cuenta como pendiente.
- **Negativo a comprobar a propósito:** en ningún momento la categoría se pinta como **Entregado**.

**Qué significa cada cosa que se ve:**

- **Insumos de teletrabajo**: el nombre de la tarjeta; agrupa las tres categorías que la norma obliga a vigilar.
- **Registro preventivo: no está en el listado de teletrabajadores**: la persona teletrabaja, así que su cumplimiento se sigue, pero por debajo del 40% no entra al listado obligatorio; su registro es de seguimiento y no exigible.
- **Silla ergonómica / Equipo de cómputo o impresión / Aditamento**: las tres categorías de la norma, siempre en este orden.
- **Estado de la categoría** (el chip de cada renglón): puede valer **Entregado** (la empresa ya le entregó cuando menos un activo de esa categoría), **En envío** (lo tiene en camino, todavía no en sus manos), **Equipo propio declarado** (no es un bien entregado por la empresa: registra que la persona pone su equipo y la cuota que se le paga por usarlo), **Sin cubrir** (falta y así cuenta como pendiente) o **Sin entregar** (no se le ha entregado; solo aplica al Aditamento, que la norma no exige cubrir).
- **Declarar equipo propio**: la acción que ofrece una categoría pendiente; al declararla desaparece de ese renglón y, si la categoría ya tiene versiones cerradas, debajo aparece su histórico.
- **Declaración guardada.**: el aviso de que el alta se registró; arriba aparece el nombre de la categoría declarada.
- **Desde el 01/11/2026**: la fecha desde la que rige el uso del equipo propio y su cuota.
- **$350.00 al mes**: la cuota mensual de la versión vigente, en pesos y con dos decimales.
- **Cuota estándar**: el origen de la cuota vigente; quiere decir que el monto coincide con la cuota estándar de la empresa. En los escenarios siguientes se remite a este.
- **Cuota estándar de la empresa: $350.00**: la ayuda del alta; avisa cuánto es la cuota estándar y que el campo ya la trae puesta.
- **Declaraciones anteriores (1)**: el bloque plegado con las versiones cerradas de esa categoría; el número es cuántas hay. Cada renglón del histórico trae la descripción de esa versión, su cuota, su periodo (**{inicio} a {fin}**, en formato `dd/mm/aaaa`) y su motivo de cierre.
- **Motivo de cierre** (el rótulo del renglón del histórico): puede valer **Se le asignó equipo de la empresa** (la empresa entregó un activo y dejó sin efecto esa versión), **Dejó el teletrabajo** (la persona dejó de teletrabajar), **Cambio de condiciones** (las condiciones pactadas cambiaron), **Otro** (cualquier otro motivo) o **Ajuste de cuota** (la versión se cerró porque una cuota nueva la sustituyó). El renglón que viene sembrado en esta categoría dice **Cambio de condiciones**, con periodo **01/06/2026 a 31/08/2026**.
- **2 sin cubrir / 1 sin cubrir**: cuántas categorías obligatorias están pendientes. Cuenta solo las que están **Sin cubrir** y las que están **En envío**; lo declarado como equipo propio y lo que no aplica (el aditamento) no se cuentan.
- **Completo** (cuando no queda nada pendiente) y **{n} en envío** / **{n} resguardo(s) sin firmar** completan los chips de resumen: el primero aparece cuando no hay pendientes ni envíos, y los otros dos cuentan activos en camino y activos entregados a los que todavía les falta el resguardo firmado.

### 4.2 Declarar con una cuota distinta a la estándar

Objetivo: comprobar que si la persona captura una cuota distinta de la estándar, el alta la guarda tal cual y la marca como **Cuota ajustada**.

1. Con el Usuario A, en la misma ficha de **Ulises Pardo Gil** (`QA-TEL-02`), sección **Activos**.
2. En el renglón **Equipo de cómputo o impresión** (chip **Sin cubrir**) pulsa **Declarar equipo propio**.
3. Llena **Descripción del equipo** con `Laptop propia` y deja **Condiciones pactadas** vacío.
4. En **Fecha de inicio** elige el 1 de noviembre de 2026.
5. En **Cuota mensual (MXN)** captura `500`: el campo acepta el importe tal como se teclea y reemplaza la cuota estándar propuesta. El formato con dos decimales y el símbolo de peso aparecen en la etiqueta ya guardada.
6. Pulsa **Guardar**.

**Qué debe verse:**

- El aviso **Equipo de cómputo o impresión** con **Declaración guardada.** y el cajón cerrado.
- El renglón **Equipo de cómputo o impresión** muestra el chip **Equipo propio declarado** y, debajo, la declaración **Laptop propia** —sin línea de condiciones, porque no se capturaron— con **Desde el 01/11/2026**, **$500.00 al mes** y el chip **Cuota ajustada**.
- El chip de resumen de la tarjeta cambió: ya no aparece **1 sin cubrir**; en su lugar se ve **Completo**.
- **Negativo a comprobar a propósito:** la cuota capturada no se reemplaza por la estándar: se lee **$500.00 al mes**, no `$350.00 al mes`.

**Qué significa lo nuevo aquí:**

- **Cuota ajustada**: el origen de la cuota vigente; quiere decir que el monto no coincide con la cuota estándar de la empresa, así que es un monto pactado aparte.
- **Completo**: ya no queda ninguna categoría pendiente ni en camino.

### 4.3 Ajustar la cuota de una declaración vigente

Objetivo: comprobar que ajustar la cuota de una declaración vigente cierra la versión anterior el día previo a la fecha de vigencia y abre una nueva, dejando la anterior en el histórico con su periodo y el motivo **Ajuste de cuota**.

1. Con el Usuario A, en la ficha de **Ulises Pardo Gil** (`QA-TEL-02`), sección **Activos**.
2. En el renglón **Silla ergonómica** (chip **Equipo propio declarado**, con la declaración **Silla ergonomica de casa** y **$350.00 al mes**) pulsa **Ajustar cuota**.
3. Se abre el cajón **Ajustar declaración: Silla ergonómica**, con **Cuota mensual (MXN)** precargada con la cuota vigente, **Vigente desde**, **Descripción del equipo** y **Condiciones pactadas** precargadas, y la nota **La versión nueva queda sin evidencia ni respaldo de adenda**. No hay campo de archivo.
4. En **Cuota mensual (MXN)** captura `420`.
5. En **Vigente desde** elige el 1 de diciembre de 2026 (el calendario no deja elegir una fecha igual o anterior al inicio de la vigente).
6. Pulsa **Guardar**.

**Qué debe verse:**

- El cajón se cierra y aparece el aviso **Silla ergonómica** con **Declaración ajustada.**
- El renglón **Silla ergonómica** sigue en **Equipo propio declarado**, ahora con **Silla ergonomica de casa**, sus condiciones, **Desde el 01/12/2026**, **$420.00 al mes** y el chip **Cuota ajustada**.
- El bloque plegado pasó a **Declaraciones anteriores (2)** y su primer renglón es la versión que se acaba de cerrar: **Silla ergonomica de casa**, **$350.00 al mes**, periodo **01/11/2026 a 30/11/2026** y motivo **Ajuste de cuota**.
- El renglón sembrado (**Silla de escritorio anterior**, **01/06/2026 a 31/08/2026**, **Cambio de condiciones**) sigue en el histórico, ahora en segundo lugar.
- El chip de resumen se queda como estaba (**Completo**): la categoría sigue cubierta, ahora por la versión nueva.
- **Negativo a comprobar a propósito:** la versión anterior no desaparece ni se duplica como vigente: en el renglón de la categoría hay **una sola** declaración vigente, y la anterior vive solo dentro de **Declaraciones anteriores**.

**Qué significa lo nuevo aquí:**

- **Ajustar cuota**: la acción que abre la captura del ajuste sobre la versión vigente de esa categoría.
- **Vigente desde**: la fecha a partir de la cual rige la versión nueva; la anterior se cierra el día anterior.
- **La versión nueva queda sin evidencia ni respaldo de adenda**: aviso del ajuste; la versión que nace no arrastra el archivo de la anterior.
- **Declaración ajustada.**: el aviso de que el ajuste se registró.
- **Declaraciones anteriores (2)**: el conteo subió a dos porque la versión que se cerró se sumó al histórico.

### 4.4 Ajustar solo la descripción

Objetivo: comprobar que se puede ajustar una declaración vigente cambiando solo la descripción del equipo —sin tocar la cuota— y que eso abre una versión nueva y manda la anterior al histórico.

1. Con el Usuario A, en la ficha de **Ulises Pardo Gil** (`QA-TEL-02`), sección **Activos**.
2. En el renglón **Silla ergonómica** pulsa **Ajustar cuota**.
3. En el cajón **Ajustar declaración: Silla ergonómica** cambia **Descripción del equipo** a `Silla ergonomica de casa con soporte lumbar`. **Deja la Cuota mensual (MXN) como está** (420).
4. En **Vigente desde** elige el 1 de enero de 2027.
5. Pulsa **Guardar**.

**Qué debe verse:**

- El aviso **Silla ergonómica** con **Declaración ajustada.** y el cajón cerrado.
- El renglón **Silla ergonómica** muestra la declaración vigente con la descripción nueva **Silla ergonomica de casa con soporte lumbar**, **Desde el 01/01/2027** y **$420.00 al mes** con el chip **Cuota ajustada**.
- El bloque pasó a **Declaraciones anteriores (3)**; su primer renglón es la versión anterior: **Silla ergonomica de casa**, **$420.00 al mes**, periodo **01/12/2026 a 31/12/2026** y motivo **Ajuste de cuota**.
- **Negativo a comprobar a propósito:** el renglón de la categoría no muestra dos declaraciones vigentes ni una descripción repetida; la versión anterior solo vive en el histórico.

**Qué significa lo nuevo aquí:**

- Que se pueda ajustar **solo la descripción**: cualquier dato de la declaración (cuota, descripción o condiciones) sirve de motivo para versionar; el ajuste no exige cambiar la cuota.

### 4.5 Terminar la declaración con fecha y motivo

Objetivo: comprobar que terminar una declaración vigente la cierra con su fecha y su motivo del catálogo, que la categoría vuelve a **Sin cubrir** y que el renglón cerrado pasa al histórico.

1. Con el Usuario A, en la ficha de **Ulises Pardo Gil** (`QA-TEL-02`), sección **Activos**.
2. En el renglón **Silla ergonómica** (declaración vigente **Silla ergonomica de casa con soporte lumbar**) pulsa **Terminar declaración**.
3. Se abre el cajón **Terminar declaración: Silla ergonómica**, con **Fecha de término** y **Motivo de término**.
4. En **Fecha de término** elige el 1 de febrero de 2027 (el calendario no deja elegir una fecha anterior al inicio de la vigente).
5. En **Motivo de término** elige **Dejó el teletrabajo**.
6. Pulsa **Guardar**.

**Qué debe verse:**

- El cajón se cierra y aparece el aviso **Silla ergonómica** con **Declaración terminada.**
- El renglón **Silla ergonómica** vuelve al chip **Sin cubrir**, trae otra vez el botón **Declarar equipo propio** y ya no muestra una declaración vigente debajo del rótulo.
- El bloque pasó a **Declaraciones anteriores (4)** y su primer renglón es la versión que se acaba de cerrar: **Silla ergonomica de casa con soporte lumbar**, **$420.00 al mes**, periodo **01/01/2027 a 01/02/2027** y motivo **Dejó el teletrabajo**.
- El chip de resumen de la tarjeta pasó de **Completo** a **1 sin cubrir**: la silla vuelve a contar como pendiente. (El cómputo sigue declarado como equipo propio y el aditamento sigue **Sin entregar**.)

**Qué significa lo nuevo aquí:**

- **Terminar declaración**: la acción que cierra la versión vigente de esa categoría; el panel del término solo pide la fecha y el motivo, nunca el motivo **Ajuste de cuota** (ese lo pone el sistema al ajustar).
- **Fecha de término**: el día en que deja de regir esa declaración; puede ser el mismo día en que inició.
- **Motivo de término**: por qué se cierra; aquí **Dejó el teletrabajo**. Los demás motivos del catálogo se explican en el Escenario 4.1.
- **Que la categoría vuelva a Sin cubrir**: el equipo propio dejó de estar declarado, así que la categoría vuelve a ser un faltante para la empresa y su declaración pasa al histórico con su periodo y su motivo.

### 4.6 La categoría que ya cubre un activo: aviso de sustitución

Objetivo: comprobar que si la empresa entrega un activo en una categoría que ya tenía equipo propio declarado, el sistema avisa que la categoría ya la cubre un activo y ofrece el botón para terminar esa declaración.

1. Con el Usuario A, abre la ficha de **Vera Quintero Lira** (`QA-TEL-03`, Híbrido 40%) y entra a **Activos**. La leyenda dice **Obligatorio: este colaborador está en el listado de teletrabajadores (NOM-037 5.7, LFT 330-E)** y el resumen es **2 sin cubrir**.
2. En el renglón **Silla ergonómica** pulsa **Declarar equipo propio**; llena **Descripción del equipo** con `Silla propia`, **Fecha de inicio** 1 de septiembre de 2026 y guarda sin tocar la cuota (llega con la estándar). El renglón queda en **Equipo propio declarado** con el chip **Cuota estándar**.
3. En **otra pestaña** del mismo navegador, con la misma sesión: menú lateral, grupo **Empresa** → **Activos e insumos**. En **Buscar activo** escribe el folio `QA-TEL-ACT-SILLA-05` y en **Estado** deja **Disponibles**.
4. En la tarjeta de esa silla (chip **Disponible**, «En almacén, listo para asignar») pulsa **Asignar**. Se abre su ficha en la pestaña **Resguardo** con el formulario **Asignar este activo**.
5. En **Empleado responsable** escribe `Vera Quintero` y elige a **Vera Quintero Lira**; deja la **Fecha de asignación** en el día de hoy.
6. Pulsa **Asignar el activo** y espera el aviso de que el resguardo quedó registrado.
7. Vuelve a la primera pestaña y recarga la ficha de **Vera Quintero Lira** → **Activos**.

**Qué debe verse:**

- El renglón **Silla ergonómica** ahora muestra el chip **Entregado**, con la silla `QA-TEL-ACT-SILLA-05` y sus chips, y el resumen pasó a **1 sin cubrir**.
- **Debajo del activo**, la declaración sigue vigente (con su descripción **Silla propia**, **Desde el 01/11/2026** y su cuota) y encima de ella aparece el aviso **Esta categoría ya la cubre un activo de la empresa: termina la declaración.**
- Junto al aviso está el botón **Terminar declaración**, que abre el cajón **Terminar declaración: Silla ergonómica**.
- **Negativo a comprobar a propósito:** en este renglón **ya no está** el botón **Ajustar cuota** (el aviso solo ofrece terminar); el aviso y su botón no aparecen en las categorías sin activo.

Pulsa **Terminar declaración**, elige en **Motivo de término** la opción **Se le asignó equipo de la empresa**, deja **Fecha de término** en el día de hoy y pulsa **Guardar**.

- El cajón se cierra con el aviso **Declaración terminada.**; la declaración desaparece de ese renglón, el aviso de sustitución se va con ella y el renglón queda solo con el activo **Entregado**.
- En **Activos e insumos**, abre la ficha de esa silla, pestaña **Resguardo**, y pulsa **Registrar devolución**: llena **Fecha de devolución** (el día de hoy) y **Motivo o condición** con `Se devuelve al terminar la prueba`, y guarda. Al recargar la ficha del colaborador, **Silla ergonómica** vuelve a **Sin cubrir** y aparece **Declaraciones anteriores (1)** con la versión terminada.

**Qué significa lo nuevo aquí:**

- **Entregado**: la empresa ya entregó un activo de esa categoría, así que la cubre el activo y no el equipo propio.
- **Esta categoría ya la cubre un activo de la empresa: termina la declaración.**: el aviso de sustitución; la declaración de equipo propio ya no tiene sentido porque el activo de la empresa cubre la categoría, y la salida es terminarla. La sustitución no cierra la declaración sola: hay que terminarla.
- **Se le asignó equipo de la empresa**: el motivo de término para este caso; deja escrito por qué se cerró.
- **Disponible** («En almacén, listo para asignar»): el activo no tiene resguardo vigente, así que se puede asignar a una persona.
- **Asignar este activo** / **Empleado responsable** / **Asignar el activo**: el formulario del resguardo con el que un activo pasa a estar en manos de alguien; la persona elegida queda como responsable del activo.
- **Registrar devolución** con su **Fecha de devolución** y su **Motivo o condición**: cierra el resguardo; el activo vuelve a estar disponible y su categoría deja de estar cubierta.
- **1 sin cubrir** en esta ficha: al entregar la silla, la categoría deja de contar como pendiente y solo queda pendiente el cómputo.

### 4.7 Sin el permiso de escribir, no aparecen las acciones

Objetivo: comprobar que con una cuenta que puede ver la matriz de insumos —con sus declaraciones y su histórico— pero no administrar los suministros del colaborador, ninguna acción de escritura aparece en el bloque.

1. Cierra la sesión y entra con el **Usuario B** (`qa-own-equipment-readonly@gsti-tests.local`). Elige la empresa **QA Fundadora**.
2. Abre la ficha de **Ulises Pardo Gil** (`QA-TEL-02`) y entra a **Activos**.
3. Deja cargar la tarjeta **Insumos de teletrabajo** y revisa sus tres renglones y el histórico.

**Qué debe verse:**

- El renglón **Silla ergonómica** en **Sin cubrir** y, debajo, el bloque **Declaraciones anteriores (4)** con sus renglones.
- El renglón **Equipo de cómputo o impresión** en **Equipo propio declarado**, con su declaración **Laptop propia**, **Desde el 01/11/2026**, **$500.00 al mes** y el chip **Cuota ajustada**.
- El renglón **Aditamento** en **Sin entregar**.
- **Negativo a comprobar a propósito:** en ningún renglón están **Declarar equipo propio**, **Ajustar cuota** ni **Terminar declaración**; no aparecen deshabilitados, ni grises, ni con candado: simplemente no están.

**Qué significa lo nuevo aquí:**

- Que falten las acciones no es un fallo de la pantalla: a esta cuenta le falta el permiso con el que se administran los suministros del colaborador, así que la matriz se ve entera —con sus declaraciones y su histórico— pero no ofrece escribir. La falta del permiso no se avisa en pantalla: las acciones no se pintan.

### 4.8 El colaborador que ya no teletrabaja

Objetivo: comprobar que un colaborador que ya no teletrabaja conserva el bloque con **solo** sus declaraciones vigentes listadas, con su acción para terminarlas y la nota que lo explica.

1. Con el Usuario A, abre la ficha de **Berta Zamora Cano** (`QA-TEL-09`, Presencial) y entra a **Activos**.

**Qué debe verse:**

- El bloque **no** trae la tarjeta con leyenda, chips de resumen ni los tres renglones de categoría.
- Arriba se ve la nota **Sin teletrabajo: solo se muestran las declaraciones vigentes para terminarlas.**
- Debajo, una lista con un renglón rotulado **Silla ergonómica** que trae la declaración vigente **Silla propia de casa**, **Desde el 01/09/2026**, **$350.00 al mes** y el chip **Cuota estándar**.
- El renglón ofrece la acción **Terminar declaración**.
- **Negativo a comprobar a propósito:** no hay botón **Declarar equipo propio** (la persona no teletrabaja, así que no se declara equipo propio) y no hay chips de resumen ni renglones de categoría.

Termina la declaración: pulsa **Terminar declaración**, elige en **Motivo de término** la opción **Dejó el teletrabajo**, deja **Fecha de término** en el día de hoy y pulsa **Guardar**.

- El aviso **Declaración terminada.** confirma el cierre y la declaración desaparece de la lista: sin vigentes por terminar, el bloque **Insumos de teletrabajo** deja de aparecer en la ficha.

**Qué significa lo nuevo aquí:**

- **Sin teletrabajo: solo se muestran las declaraciones vigentes para terminarlas.**: el bloque de insumos no aplica a quien ya no teletrabaja, pero sus declaraciones vigentes siguen ahí y hay que poder cerrarlas; por eso se listan solas, sin la matriz de categorías.
- Que al terminar la última vigente **el bloque desaparezca**: sin teletrabajo y sin declaraciones vigentes no hay nada que mostrar en la sección.

### 4.9 Anchos de pantalla

Objetivo: comprobar que el renglón con su declaración, el histórico y el cajón se adaptan a un teléfono (360 px), a un ancho intermedio (unos 850 px) y a escritorio, sin apretar los datos en dos columnas ni provocar desplazamiento horizontal.

1. Con el Usuario A, abre la ficha de **Ulises Pardo Gil** (`QA-TEL-02`) y entra a **Activos**: tras los Escenarios 4.1 a 4.5, la silla está **Sin cubrir** con su histórico, el cómputo está **Equipo propio declarado** y el aditamento sigue **Sin entregar**.
2. Estrecha la ventana del navegador a unos **360 px** de ancho (o usa el modo de dispositivo móvil).
3. La página **no se desplaza en horizontal**: no hay barra inferior de desplazamiento y el contenido de la tarjeta no se sale hacia los lados.
4. Cada renglón queda **apilado en una sola columna**, de arriba abajo: primero el rótulo de la categoría, después su chip de estado y al final lo que la cubre (los activos, o la declaración con su cuota y su histórico), cada cosa en su propio renglón. El texto no se encabalga ni se parte en dos columnas.
5. Despliega **Declaraciones anteriores** en el renglón de la silla: cada versión cerrada ocupa **su propio renglón en una sola columna** (descripción arriba y, debajo, su cuota, su periodo y su motivo), sin partirse en dos columnas.
6. Abre un cajón del alta (en el renglón **Silla ergonómica**, **Declarar equipo propio**): el cajón ocupa **todo el ancho de la pantalla** y sus botones **Cancelar** y **Guardar** van apilados a lo ancho, uno debajo del otro. Ciérralo con **Cancelar**.
7. Ensancha la ventana a un ancho intermedio, **entre tableta y escritorio** (unos **850 px**): el renglón **sigue apilado en una sola columna** (el chip de estado viaja junto al rótulo) y la declaración se sigue leyendo en una sola columna. Es a propósito: entre tableta y escritorio la ficha deja al bloque un carril angosto.
8. Pon la ventana a **ancho de escritorio** (desde unos **1024 px**), en esa misma ficha: ahí sí el renglón se abre —el rótulo de la categoría a la izquierda y el chip de estado al extremo derecho— y la declaración y su histórico quedan debajo, a todo lo ancho del renglón, sin desbordarse.

**Qué debe verse:**

- A 360 px: sin desplazamiento horizontal, los renglones en una sola columna, el histórico versión por versión en una columna y el cajón a todo lo ancho con sus botones apilados.
- A unos 850 px: los renglones **siguen** en una sola columna, con el chip de estado junto al rótulo.
- Desde unos 1024 px: el renglón se abre con el rótulo a la izquierda y el chip de estado al extremo derecho, y la declaración y el histórico quedan debajo a todo lo ancho.

**Qué significa lo nuevo aquí:**

- **Que a 850 px los renglones sigan en una columna**: dentro de la ficha el bloque vive en un carril más angosto que la ventana; con dos columnas el rótulo y los datos se apretarían, así que el renglón solo se abre cuando la ventana es de escritorio.
- **Que el cajón ocupe todo el ancho en el teléfono**: en un panel lateral angosto la fecha y la cuota no caben sin apretarse.

## 5. Escenarios que resuelven las pruebas automatizadas

Estos no se recorren a mano: el ambiente o el producto no pueden provocarlos desde la pantalla. Se dejaron a las pruebas automatizadas de la historia; cada uno se marca contra su objetivo.

### 5.1 El ajuste con una fecha de vigencia igual o anterior al inicio

Objetivo: comprobar que el ajuste rechaza una fecha de vigencia que no sea posterior al inicio de la declaración vigente, sin abrir ninguna versión nueva.

**Qué debe verse:** el ajuste no se guarda y el cajón muestra el aviso **Datos inválidos** con **La fecha de vigencia debe ser posterior al inicio de la declaración vigente**; la categoría se queda con su única declaración vigente de siempre.

**Qué pasó:** desde la pantalla no se puede provocar: el calendario del ajuste no deja elegir una fecha igual o anterior al inicio de la vigente. Lo cubre la prueba automatizada del ajuste por fecha, que envía la fecha de vigencia igual al inicio y un día antes y comprueba que las dos responden el mismo rechazo y que no nace ninguna versión.

### 5.2 El ajuste sin cambios

Objetivo: comprobar que un ajuste que no cambia nada —misma cuota, misma descripción y mismas condiciones— se rechaza, para no dejar dos versiones gemelas.

**Qué debe verse:** el ajuste no se guarda y el cajón muestra el aviso **Datos inválidos** con **El ajuste no cambia nada: cuota, descripción o condiciones deben diferir de la versión vigente**; la categoría se queda con una sola declaración vigente.

**Qué pasó:** desde la pantalla no se puede provocar: el ajuste precarga los datos de la vigente y quien prueba no tiene por qué saber cuándo la captura quedó idéntica. Lo cubre la prueba automatizada del ajuste sin cambios, que envía la misma cuota y la misma descripción y comprueba el rechazo y que no nace una versión.

### 5.3 El doble ajuste simultáneo

Objetivo: comprobar que dos ajustes de la misma declaración enviados exactamente al mismo tiempo dejan una sola versión vigente.

**Qué debe verse:** una de las dos capturas se guarda con **Declaración ajustada.** y la otra recibe **Declaración de equipo propio no vigente** con **La declaración ya está cerrada; consulta la versión vigente en la ficha del colaborador.**; al recargar la ficha, la categoría muestra un solo renglón vigente.

**Qué pasó:** no se puede provocar a mano: las dos peticiones deben salir al mismo tiempo y la pantalla bloquea el botón mientras guarda. Lo cubre la prueba automatizada del ajuste simultáneo, que lanza dos ajustes en paralelo y comprueba que uno se guarda, el otro se rechaza por no vigente y la base queda con una sola versión nueva.

### 5.4 El término con **Ajuste de cuota** como motivo

Objetivo: comprobar que **Ajuste de cuota** no es un motivo que se pueda elegir al terminar una declaración.

**Qué debe verse:** la lista **Motivo de término** del cajón solo ofrece **Se le asignó equipo de la empresa**, **Dejó el teletrabajo**, **Cambio de condiciones** y **Otro**; **Ajuste de cuota** no está entre las opciones. Enviado por fuera, el término se rechaza con **Datos inválidos** y la declaración se queda vigente.

**Qué pasó:** desde la pantalla no se puede provocar: el motivo se elige de una lista que no incluye **Ajuste de cuota** (ese motivo lo pone el sistema al ajustar). Lo cubre la prueba automatizada del motivo de término, que envía un motivo fuera del catálogo —**Ajuste de cuota** incluido— y comprueba el rechazo y que la declaración no se cierra.

### 5.5 El mismo «no encontrado» para una declaración de otra empresa

Objetivo: comprobar que ajustar o terminar la declaración no deja averiguar qué declaraciones existen: una de otra empresa, una inexistente y una dada de baja en el sistema se rechazan igual.

**Qué debe verse:** los tres casos devuelven el mismo aviso, con el mismo título y el mismo texto —**Declaración de equipo propio no encontrada** con **La declaración no existe o no pertenece a la empresa.**—, sin ninguna pista de cuál de los tres es; y en ninguno se cambia la declaración.

**Qué pasó:** desde el navegador no se puede mandar el ajuste ni el término de una declaración que no sea de la empresa; la declaración solo existe en la ficha de un colaborador vivo al que la sesión puede llegar. Lo cubre la prueba automatizada del aislamiento de la declaración, que manda los tres casos y compara las respuestas completas entre sí.

### 5.6 El rechazo del servidor sin el permiso de escribir

Objetivo: comprobar que el rechazo por falta de permiso lo hace el servidor y no solo la pantalla.

**Qué debe verse:** el alta, el ajuste y el término no se guardan y el aviso es el del sistema para una operación sin permiso —**Sin permiso** con **No tienes permiso para realizar esta operación.**—; en la pantalla esa cuenta no llega ni a ver las acciones (Escenario 4.7).

**Qué pasó:** el backoffice solo oculta los botones: no hay forma de provocar el rechazo del servidor desde el navegador. Lo cubre la prueba automatizada del permiso de la declaración, que con una cuenta sin el permiso de administrar los suministros del colaborador comprueba el rechazo del alta, del ajuste y del término con ese aviso, y que los superusuarios sí pasan.

### 5.7 El bloque y el cajón en inglés

Objetivo: comprobar que el bloque de la matriz, la declaración vigente, su histórico y el cajón tienen sus textos en inglés.

**Qué debe verse:** con el idioma en inglés, la matriz se titula **Telework supplies**, la leyenda de registro preventivo dice **Preventive record: not on the teleworkers list**, las categorías se leen **Ergonomic chair**, **Computing or printing equipment** y **Accessory**, el estado declarado se lee **Own equipment declared**, **Uncovered**, **Delivered**, **Shipping** y **Not delivered**, y la acción **Declare own equipment**; la declaración vigente se lee **Since 01/11/2026** y **$350.00 per month** con el chip **Standard fee** o **Adjusted fee**, el histórico se titula **Previous declarations ({n})** con el periodo **{start} to {end}** y los motivos **Company equipment was assigned**, **Ended telework**, **Conditions changed**, **Other** y **Fee adjustment**, el aviso de sustitución dice **This category is already covered by a company asset: close the declaration.**, la nota de quien no teletrabaja dice **No telework: only active declarations are shown so they can be closed.**, y el cajón se titula **Declare own equipment: Ergonomic chair** / **Adjust declaration: …** / **Close declaration: …** con los campos **Equipment description**, **Agreed conditions**, **Start date**, **Monthly fee (MXN)**, **Effective from**, **End date** y **Close reason**, la ayuda **Company standard fee: {fee}**, la nota del ajuste **The new version starts without evidence or addendum backing**, los botones **Cancel** y **Save**, y los avisos **Declaration saved.**, **Declaration adjusted.** y **Declaration closed.**

**Qué pasó:** no es recorrible en el ambiente entregado: el backoffice opera **solo en español** mientras el cambio de idioma está oculto —cualquier dirección con otro prefijo de idioma se reescribe al español y el selector de idioma no está en la interfaz—, así que desde el navegador no se puede poner la pantalla en inglés. No se inventan pasos para provocarlo: lo cubren la verificación automática que compara clave por clave los textos en español y en inglés de los dos bloques del panel y el chequeo de idioma del propio backoffice, ambos en verde.

**Checklist de los escenarios automatizados** (una casilla por escenario: se marca si su prueba pasó):

- [ ] 5.1 El ajuste con fecha igual o anterior al inicio se rechaza y no nace una versión
- [ ] 5.2 El ajuste sin cambios se rechaza y no nace una versión
- [ ] 5.3 Dos ajustes simultáneos dejan una sola versión vigente
- [ ] 5.4 **Ajuste de cuota** no es un motivo de término seleccionable y su envío se rechaza
- [ ] 5.5 La declaración de otra empresa, la inexistente y la dada de baja responden el mismo «no encontrado»
- [ ] 5.6 Sin el permiso de administrar los suministros del colaborador el servidor rechaza el alta, el ajuste y el término, y los superusuarios pasan
- [ ] 5.7 Los textos en inglés del bloque, del histórico y del cajón están completos y no falta ninguna clave

## 6. Checklist del recorrido manual

Cada casilla se marca **contra el objetivo de su escenario**, no contra «se hicieron los pasos»:

- [ ] 4.1 En la ficha de `QA-TEL-02`, declarar la silla sin tocar la cuota la deja en **Equipo propio declarado** con **$350.00 al mes** y el chip **Cuota estándar**, el histórico **Declaraciones anteriores (1)** sigue, y el resumen pasa de **2 sin cubrir** a **1 sin cubrir**
- [ ] 4.2 Declarar el cómputo con cuota `500` se guarda como **$500.00 al mes** con el chip **Cuota ajustada**, y el resumen queda en **Completo**
- [ ] 4.3 Ajustar la silla a `420` con fecha de vigencia deja la nueva versión vigente (**Desde el 01/12/2026**) y la anterior en **Declaraciones anteriores (2)** con periodo **01/11/2026 a 30/11/2026** y motivo **Ajuste de cuota**
- [ ] 4.4 Ajustar solo la descripción abre una versión nueva y manda la anterior al histórico (**Declaraciones anteriores (3)**) sin duplicar la vigente
- [ ] 4.5 Terminar la silla con fecha y motivo **Dejó el teletrabajo** la cierra, la categoría vuelve a **Sin cubrir**, el resumen pasa a **1 sin cubrir** y el histórico queda en **Declaraciones anteriores (4)**
- [ ] 4.6 Al asignar la silla `QA-TEL-ACT-SILLA-05` a quien tenía silla propia, la categoría queda **Entregado** y aparece el aviso **Esta categoría ya la cubre un activo de la empresa: termina la declaración.** con su botón **Terminar declaración** (sin **Ajustar cuota**), y al devolver el activo la categoría vuelve a **Sin cubrir**
- [ ] 4.7 Con el Usuario B se ven las declaraciones y el histórico de `QA-TEL-02`, y ninguna acción de escritura (**Declarar equipo propio**, **Ajustar cuota**, **Terminar declaración**) aparece
- [ ] 4.8 Con `QA-TEL-09` el bloque trae solo la nota **Sin teletrabajo: solo se muestran las declaraciones vigentes para terminarlas.** y su declaración vigente con **Terminar declaración**, sin chips, categorías ni acción de declarar
- [ ] 4.9 A 360 px no hay desplazamiento horizontal, el histórico va en una columna y el cajón a todo lo ancho con los botones apilados; a unos 850 px los renglones siguen en una columna; desde unos 1024 px el renglón se abre con el chip de estado al extremo derecho y la declaración y su histórico debajo a todo lo ancho

## 7. Hallazgos de otras historias

Ninguno.
