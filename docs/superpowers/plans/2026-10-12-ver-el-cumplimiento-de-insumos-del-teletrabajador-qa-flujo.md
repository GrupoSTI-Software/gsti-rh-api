# Prueba manual — Ver el cumplimiento de insumos del teletrabajador en su ficha

**Estado: entregado el 12 de octubre de 2026 y recorrido manualmente ese mismo día; el checklist quedó completo.**

**Problema:** la NOM-037 obliga a la empresa a entregarle a cada teletrabajador una **silla ergonómica**, el **equipo de cómputo o impresión** y los **aditamentos** que hagan falta, y a poder demostrar en una inspección qué le entregó a cada quien. La ficha del colaborador ya mostraba sus activos, pero no decía nada del cumplimiento de la norma: para saber si a una persona le faltaba la silla había que abrir activo por activo y adivinar qué categoría de la norma era cada uno.

**Solución:** la sección **Activos** de la ficha gana, **arriba de la lista de activos**, un bloque **Insumos de teletrabajo** que muestra las tres categorías de la norma con su estado: **Entregado** (la persona ya lo tiene), **En envío** (va en camino), **Equipo propio declarado** (lo cubre con su propio equipo, cuando la empresa lo registra así), **Sin cubrir** (falta y así cuenta la norma) y **Sin entregar** (solo para el Aditamento, que la norma no exige cubrir). El bloque dice además si el registro es **obligatorio** o meramente **preventivo**, resume lo que falta en chips, y cada activo que cubre una categoría aparece con su folio y el estado de su resguardo. Los renglones vigentes de la lista de activos, por su parte, ahora llevan la **etiqueta de la categoría** de la norma a la que pertenece el insumo.

Ejemplo: es como la mochila de un estudiante antes de un campamento. La escuela pide tres cosas: casco, linterna y repelente. Antes, para saber si a un alumno le faltaba algo tenías que abrir su mochila y sacar cosa por cosa a adivinar para qué servía. Ahora ves una lista con el nombre de cada cosa y, enfrente, si ya la lleva, si va en camino o si todavía le falta.

## Glosario

- **Insumo de teletrabajo:** bien que la empresa le entrega a quien trabaja desde casa porque la NOM-037 lo exige (silla ergonómica, equipo de cómputo o impresión, aditamentos).
- **Aditamento:** accesorio que complementa el puesto en casa (monitor, teclado, diadema, reposapiés). La norma no obliga a entregarlo, por eso nunca se marca como un faltante.
- **Resguardo:** el vale con el que la persona recibe un activo. Está **firmado** si ya se subió el documento, y **sin firmar** si todavía no.
- **Folio:** el número que identifica al activo en el inventario (por ejemplo `QA-TEL-ACT-SILLA-01`).
- **Listado de teletrabajadores:** el registro obligatorio de la NOM-037 (apartado 5.1) con los colaboradores cuyo teletrabajo representa el 40% o más de su jornada.
- **Registro preventivo:** la ficha de quien todavía no entra al listado obligatorio (teletrabaja, pero por debajo del 40%).

## 1. Preparar

Prerrequisito: esta rama del API y la del backoffice están levantadas, y la base ya trae el módulo **Empleados**, el módulo **Activos e insumos** y el módulo **Teletrabajadores**.

Este manual se entrega para que una persona lo recorra en el navegador; el agente que lo escribió no lo camina.

Aviso: el archivo que siembra los datos es temporal y **no está versionado** en el repositorio, así que hay que tenerlo presente al armar el ambiente.

Ejecuta una vez el sembrador de QA compartido:

```bash
cd gsti-rh-api
node ace db:seed --files=database/seeders/_tmp_do_not_commit_qa_seeder.ts
```

Qué deja listo para esta prueba:

- **QA Fundadora**: la empresa donde se hace todo el recorrido, con los tres módulos disponibles.
- Los **tipos de activo** con su categoría de la norma: **Silla QA Insumos** (categoría *Silla ergonómica*), **Computo QA Insumos** (categoría *Equipo de cómputo o impresión*), **Celular QA Insumos** (sin categoría) y **Silla QA Reclas** (categoría *Silla ergonómica*; su tipo se usa una sola vez, en el Escenario 7).
- Los **diez colaboradores** de la tabla de abajo (`QA-TEL-01` a `QA-TEL-10`), cada uno con el estado que prueba un escenario.
- Las **tres cuentas** de la §2.

**Señal para reconocer lo nuestro:** los colaboradores de esta prueba tienen código de nómina `QA-TEL-…`; los activos de esta prueba tienen folio `QA-TEL-ACT-…`; los tipos terminan en `QA Insumos` o `QA Reclas`. Cualquier otro colaborador, activo o tipo de la empresa es de otra historia y no se toca.

Estado de cada colaborador (lo que deja el sembrador):

| Código | Nombre | Modalidad y % | Activos sembrados | Escenario |
|---|---|---|---|---|
| `QA-TEL-01` | Tania Robles Vera | Home Office, 100% | Silla `QA-TEL-ACT-SILLA-01` entregada con resguardo firmado | 1 |
| `QA-TEL-02` | Ulises Pardo Gil | Híbrido, 20% | Ninguno | 2 |
| `QA-TEL-03` | Vera Quintero Lira | Híbrido, 40% | Ninguno | 3 |
| `QA-TEL-04` | Walter Rivas Mota | Home Office, 100% | Monitor `QA-TEL-ACT-MON-01` asignado con resguardo firmado + Laptop `QA-TEL-ACT-LAP-01` en envío | 4a |
| `QA-TEL-05` | Ximena Sosa Pena | Home Office, 100% | Laptop `QA-TEL-ACT-LAP-02` solamente, en envío | 4b |
| `QA-TEL-06` | Yamil Teran Ruiz | Home Office, 100% | Laptop `QA-TEL-ACT-LAP-03` devuelta | 5 |
| `QA-TEL-07` | Zaira Uribe Solis | Home Office, 100% | Silla `QA-TEL-ACT-SILLA-02` y Laptop `QA-TEL-ACT-LAP-04` entregadas con resguardo firmado; Celular `QA-TEL-ACT-CEL-01` (sin categoría); Monitor `QA-TEL-ACT-MON-02` devuelto | 6 |
| `QA-TEL-08` | Adan Valdes Neri | Home Office, 100% | Silla `QA-TEL-ACT-SILLA-03` (tipo **Silla QA Reclas**) entregada con resguardo firmado | 7 |
| `QA-TEL-09` | Berta Zamora Cano | Presencial, 50% | Celular `QA-TEL-ACT-CEL-02` (sin categoría) | 8a |
| `QA-TEL-10` | Cesar Alcala Rios | Home Office, 100% **dado de baja** | Silla `QA-TEL-ACT-SILLA-04` entregada con resguardo firmado | 8b |

Orden del recorrido: los escenarios se recorren **en orden**. El bloque es de solo consulta, así que recorrerlo no cambia nada, con una excepción: el **Escenario 7** quita la categoría a un tipo en **Activos e insumos** (solo al tipo **Silla QA Reclas**, que ningún otro escenario usa, así que no estorba). El **Escenario 9** bloquea una petición en el navegador y hay que desbloquearla al terminar.

### Evidencia y hallazgos

Cada escenario se marca **contra su `Objetivo:`**, no contra "se hicieron los pasos". Este manual **no pide capturas ni adjuntos**: el resultado esperado va escrito y quien recorre reporta lo que vio. Los hallazgos que surjan se registran en `qa-valanserh/hallazgos.md`, en su cuadro de **14 campos**; el detalle técnico (código, causa) va en **Comentarios/Historial**, no en Evidencia. Los hallazgos se corrigen en esta misma rama.

## 2. Usuarios

Las tres cuentas entran por el backoffice con el mismo flujo: en `http://127.0.0.1:3000`, botón **Continuar con contraseña**, llena **Correo electrónico** y **Contraseña**, botón **Entrar**. Todas usan la contraseña de prueba `password`.

| | Correo | Contraseña | Login | Permisos (variante) | Para qué se usa |
|---|---|---|---|---|---|
| **A** | `qa-employee-assets-full@gsti-tests.local` | `password` | Backoffice | lectura de **Empleados** y de **Activos e insumos** (ve la sección y el bloque) | Escenarios 1 a 7, 8a, 8b, 9 y 10 |
| **B** | `qa-employee-assets-none@gsti-tests.local` | `password` | Backoffice | lectura de **Empleados**, **sin** lectura de **Activos e insumos** | Escenario 8c (no ve la sección) |
| **C** | `qa-supplies-update@gsti-tests.local` | `password` | Backoffice | **Activos e insumos** con consulta, alta y edición | Escenario 7 (quita la categoría al tipo) |

Las tres cuentas pueden abrir la pantalla con la que arranca el backoffice (**Monitor de asistencia**): el sembrador concede la lectura de ese módulo a todos los roles de QA, así que la sesión no empieza en un aviso de permisos.

## 3. Dónde probar

El bloque vive dentro de la **ficha del colaborador**, en la sección **Activos**.

Para entrar: en `http://127.0.0.1:3000`, botón **Continuar con contraseña**, llena **Correo electrónico** y **Contraseña** con la cuenta que toque, botón **Entrar**. Al entrar, el backoffice abre siempre la pantalla **Monitor de asistencia**, que no es donde se prueba: del menú lateral entra a **Empleados**.

Para elegir la empresa (si el usuario tiene más de una): arriba a la derecha abre **Mi cuenta** (el avatar) y en el campo **Empresa** elige **QA Fundadora**.

Para llegar a la ficha: menú lateral → **Empleados**; busca a la persona por su código de nómina (por ejemplo `QA-TEL-01`) y, en su tarjeta, pulsa **Ver detalles**. La ficha abre en la sección **Información del empleado**.

La sección nueva es **Activos**: está en el submenú lateral de la ficha, **al final, después de Expediente**, con el icono de un portátil. Dentro hay dos tarjetas separadas: arriba el bloque **Insumos de teletrabajo** y, debajo, la lista de **Activos vigentes** / **Activos devueltos**.

Cómo se lee el bloque, de arriba a abajo: el título; la leyenda que dice si el registro es obligatorio o preventivo; y las tres categorías de la norma, **cada una en su renglón** con su chip de estado **al extremo derecho** y, debajo del rótulo, los activos que la cubren (uno por línea, con su folio y sus chips). Las tres categorías salen siempre en el mismo orden: silla, cómputo, aditamento.

URL directa de la sección: `http://127.0.0.1:3000/employees/<slug-o-token-del-colaborador>/assets` (la dirección **no** lleva `/es`).

Para el Escenario 7, la pantalla del catálogo: menú lateral, grupo **Empresa** → **Activos e insumos**; dentro, botón **Tipos y características** (arriba a la derecha). URL directa: `http://127.0.0.1:3000/supplies`.

Para el Escenario 3, el listado obligatorio: menú lateral → **Teletrabajadores**. URL directa: `http://127.0.0.1:3000/telework-workers`.

---

## 4. Con el Usuario A (lectura de Activos e insumos)

Entra con el Usuario A (`qa-employee-assets-full@gsti-tests.local`) y elige la empresa **QA Fundadora**.

### 4.1 Cumplimiento completo con registro obligatorio

Objetivo: comprobar que en la ficha de un teletrabajador obligatorio al que ya se le entregó la silla con resguardo firmado, el bloque **Insumos de teletrabajo** aparece arriba de los activos, marca la silla como **Entregado**, deja cómputo **Sin cubrir** y aditamento **Sin entregar**, lleva la leyenda de obligatorio y resume el faltante en un chip.

1. Con el Usuario A, abre la ficha de **Tania Robles Vera** (`QA-TEL-01`, Home Office al 100%).
2. Entra a la sección **Activos** (submenú de la ficha, al final).
3. Arriba de la lista de activos está la tarjeta **Insumos de teletrabajo**.
4. Bajo el título, la leyenda: **Obligatorio: este colaborador está en el listado de teletrabajadores (NOM-037 5.7, LFT 330-E)**.
5. En el encabezado de la tarjeta, un chip rojo de resumen: **1 sin cubrir**.
6. El renglón **Silla ergonómica** lleva su chip **Entregado** al extremo derecho; debajo, en una sola línea, el activo **Silla de oficina** con su **Folio QA-TEL-ACT-SILLA-01** y el chip **Resguardo firmado**. El nombre del activo es un enlace.
7. El renglón **Equipo de cómputo o impresión** muestra el chip **Sin cubrir** y ningún activo debajo.
8. El renglón **Aditamento** muestra el chip **Sin entregar** y ningún activo debajo.
9. Debajo del bloque, la lista de **Activos vigentes** sigue funcionando: trae la misma **Silla de oficina** (`QA-TEL-ACT-SILLA-01`).

**Qué significa cada cosa que se ve:**

- **Insumos de teletrabajo**: el nombre del bloque; agrupa las tres categorías que la norma obliga a vigilar.
- **Obligatorio: este colaborador está en el listado de teletrabajadores (NOM-037 5.7, LFT 330-E)**: el registro es exigible; la persona aparece en el listado obligatorio porque teletrabaja el 40% o más de su jornada.
- **Silla ergonómica / Equipo de cómputo o impresión / Aditamento**: las tres categorías de la norma, siempre en este orden (silla, cómputo, aditamento).
- **Estado de la categoría** (el chip de cada renglón): puede valer **Entregado** (la empresa ya le entregó cuando menos un activo de esa categoría), **En envío** (lo tiene en camino, todavía no en sus manos), **Equipo propio declarado** (la cubre con su propio equipo porque la empresa así lo registró), **Sin cubrir** (falta y así cuenta como pendiente) o **Sin entregar** (no se le ha entregado; solo aplica al Aditamento, que la norma no exige).
- **Resguardo firmado**: la persona ya subió el vale con el que responde por el activo.
- **Folio …**: el número que identifica al activo en el inventario.
- **Chip de resumen `1 sin cubrir`**: cuántas categorías obligatorias siguen sin cubrirse. Si no falta nada, en su lugar aparece el chip **Completo**.

### 4.2 Registro preventivo (por debajo del 40%)

Objetivo: comprobar que un colaborador híbrido por debajo del umbral ve el mismo bloque, pero con la leyenda de que su registro es preventivo y no obligatorio.

1. Con el Usuario A, abre la ficha de **Ulises Pardo Gil** (`QA-TEL-02`, Híbrido al 20%) y entra a **Activos**.
2. El bloque **Insumos de teletrabajo** aparece igual, arriba de los activos.
3. La leyenda bajo el título dice: **Registro preventivo: no está en el listado de teletrabajadores**.
4. Chip de resumen: **2 sin cubrir**.
5. **Silla ergonómica** → **Sin cubrir**; **Equipo de cómputo o impresión** → **Sin cubrir**; **Aditamento** → **Sin entregar**.
6. Debajo del bloque, la lista de activos muestra el aviso **Sin activos asignados** con la línea **Los activos se asignan desde Activos e insumos y aparecen aquí.** (la persona no tiene activos).

**Qué significa lo nuevo aquí:**

- **Registro preventivo: no está en el listado de teletrabajadores**: la persona teletrabaja, así que su cumplimiento se sigue, pero todavía no entra al listado obligatorio (no llega al 40%); su registro es de seguimiento, no exigible.
- **Chip de resumen `2 sin cubrir`**: las dos categorías obligatorias (silla y cómputo) están pendientes; el aditamento no cuenta como faltante.

### 4.3 El umbral exacto del 40%

Objetivo: comprobar que un colaborador híbrido justo en el 40% ya se marca como obligatorio —la misma frontera que lo mete al listado de teletrabajadores— y que por debajo de ese número no.

1. Con el Usuario A, abre la ficha de **Vera Quintero Lira** (`QA-TEL-03`, Híbrido al 40%) y entra a **Activos**.
2. La leyenda es la de obligatorio: **Obligatorio: este colaborador está en el listado de teletrabajadores (NOM-037 5.7, LFT 330-E)**.
3. (Contraste) Abre también la ficha de **Ulises Pardo Gil** (`QA-TEL-02`, 20%): su leyenda es la de registro preventivo. La diferencia de leyenda depende solo del porcentaje.
4. Cambia de sesión nada: abre el menú lateral → **Teletrabajadores**.
5. Busca **Vera Quintero** en el buscador **Buscar** (placeholder **Nombre del empleado o puesto**).
6. **Vera Quintero Lira** aparece en la tabla, con **Modalidad** *Híbrido* y **% remoto** `40`.
7. **Negativo a comprobar a propósito:** **Ulises Pardo Gil** (20%) **no** aparece en el listado.

(Los datos que se ven son los ya explicados en los Escenarios 4.1 y 4.2.)

### 4.4 En envío

Objetivo: comprobar que un activo que va en camino no cuenta como entregado y que su categoría lo refleja: con un monitor ya entregado y una laptop en camino, la categoría se marca **Entregado** y la laptop lleva su chip **En envío**; con solo la laptop en camino, la categoría entera se marca **En envío**.

1. Con el Usuario A, abre la ficha de **Walter Rivas Mota** (`QA-TEL-04`, Home Office 100%) y entra a **Activos** (Escenario 4.4a).
2. El renglón **Equipo de cómputo o impresión** muestra el chip **Entregado** y **dos** activos debajo:
   - **Monitor secundario** — **Folio QA-TEL-ACT-MON-01** — chip **Resguardo firmado**.
   - **Laptop de trabajo** — **Folio QA-TEL-ACT-LAP-01** — chip **En envío** (y chip **Resguardo sin firmar**).
3. Chip de resumen: **1 sin cubrir** (el computo ya está cubierto; falta la silla).
4. (Escenario 4.4b) Abre la ficha de **Ximena Sosa Pena** (`QA-TEL-05`, Home Office 100%) y entra a **Activos**.
5. El renglón **Equipo de cómputo o impresión** muestra el chip **En envío** y un solo activo: **Laptop de trabajo** — **Folio QA-TEL-ACT-LAP-02** — chip **En envío**.
6. Sus chips de resumen son **1 sin cubrir** y **1 en envío**.

**Qué significa lo nuevo aquí:**

- **Estado de la categoría `En envío`**: todos los activos de esa categoría están en camino; ninguno está todavía en manos de la persona, así que la categoría se cuenta como pendiente.
- **Chip `En envío` en el activo**: ese activo concreto va en camino (aún no llegó).
- **Resguardo sin firmar**: la persona todavía no ha firmado el vale del activo; es normal mientras el activo no llega.
- **Chip de resumen `1 en envío`**: cuántas categorías obligatorias dependen de un activo en camino.

### 4.5 Lo devuelto no cubre

Objetivo: comprobar que un activo que ya fue devuelto no cuenta como entregado, de modo que su categoría obligatoria queda **Sin cubrir** aunque en el historial se vea que la persona sí lo tuvo.

1. Con el Usuario A, abre la ficha de **Yamil Teran Ruiz** (`QA-TEL-06`, Home Office 100%) y entra a **Activos**.
2. El bloque **Insumos de teletrabajo** muestra **Equipo de cómputo o impresión** con el chip **Sin cubrir** y **sin** activos debajo.
3. Chip de resumen: **2 sin cubrir**.
4. Debajo, la tarjeta **Activos devueltos** muestra la **Laptop de trabajo** (`QA-TEL-ACT-LAP-03`) con **Devuelto el 1 de septiembre de 2026** y **Motivo: Cambio de equipo**.
5. **Negativo a comprobar a propósito:** la laptop devuelta **no** aparece como activo que cubre el computo en el bloque de insumos.

**Qué significa lo nuevo aquí:**

- Que la computadora devuelta aparezca en **Activos devueltos** y no cubra la categoría: la norma mira lo que la persona **tiene hoy**; lo devuelto es historial y no cuenta como entrega vigente, por eso el computo queda **Sin cubrir**.
- **Motivo: Cambio de equipo**: se le recogió este activo como parte de un cambio por otro.

### 4.6 Etiquetas de categoría en la lista de activos

Objetivo: comprobar que los renglones **vigentes** de la lista de activos que pertenecen a una categoría de la norma llevan su etiqueta, y que un activo sin categoría y los activos **devueltos** no la llevan.

1. Con el Usuario A, abre la ficha de **Zaira Uribe Solis** (`QA-TEL-07`, Home Office 100%) y entra a **Activos**.
2. En **Activos vigentes**, el renglón de la **Silla de oficina** (`QA-TEL-ACT-SILLA-02`) lleva, junto a sus chips, una etiqueta **Silla ergonómica**.
3. El renglón de la **Laptop de trabajo** (`QA-TEL-ACT-LAP-04`) lleva la etiqueta **Equipo de cómputo o impresión**.
4. El renglón del **Celular corporativo** (`QA-TEL-ACT-CEL-01`) **no** lleva ninguna etiqueta de categoría (su tipo no tiene categoría).
5. En **Activos devueltos**, el renglón del **Monitor secundario** (`QA-TEL-ACT-MON-02`) **no** lleva etiqueta de categoría, aunque su tipo sí es de cómputo.
6. **Negativo a comprobar a propósito:** ninguna etiqueta aparece en los renglones devueltos; solo en los vigentes que cubren una categoría.

**Qué significa lo nuevo aquí:**

- **La etiqueta de categoría en un renglón vigente** (por ejemplo **Silla ergonómica**): ese activo es, además de un activo de la persona, un insumo de la norma de esa categoría; es la señal de que ese renglón está contando en el bloque de arriba.
- **Que un activo devuelto no lleve etiqueta**: lo devuelto es historial; no cuenta como insumo vigente, por eso su renglón no se marca.
- **Que un activo sin categoría no lleve etiqueta**: su tipo no pertenece a ninguna de las tres categorías de la norma (un celular corporativo, por ejemplo), así que no es un insumo de teletrabajo.

### 4.7 Reclasificar un tipo deja de contar la categoría

Objetivo: comprobar que si en **Activos e insumos** se le quita la categoría de la norma al tipo del que cuelga el insumo, la ficha deja de contar esa categoría al reabrirse, sin tocar las asignaciones.

1. Con el Usuario A, abre la ficha de **Adan Valdes Neri** (`QA-TEL-08`, Home Office 100%) y entra a **Activos**. Su **Silla ergonómica** se ve **Entregado** (activo `QA-TEL-ACT-SILLA-03`, resguardo firmado).
2. Cierra la sesión y entra con el **Usuario C** (`qa-supplies-update@gsti-tests.local`). Elige la empresa **QA Fundadora**.
3. Abre **Empresa → Activos e insumos** y pulsa **Tipos y características**.
4. En la tarjeta del tipo **Silla QA Reclas**, en el selector **Categoría de teletrabajo**, elige **Sin categoría**. Aparece el aviso **Categoría actualizada.** y la etiqueta de categoría desaparece de la tarjeta.
5. Cierra la sesión y vuelve a entrar con el **Usuario A**. Abre otra vez la ficha de **Adan Valdes Neri** (`QA-TEL-08`) y entra a **Activos**.
6. El renglón **Silla ergonómica** ahora muestra el chip **Sin cubrir** y **sin** activos debajo; el chip de resumen pasa a **2 sin cubrir**.
7. En la lista, la **Silla reclasificable** (`QA-TEL-ACT-SILLA-03`) sigue en **Activos vigentes**, pero **ya no** lleva la etiqueta de categoría.
8. (Dejar como estaba) Con el **Usuario C**, vuelve a **Silla QA Reclas → Categoría de teletrabajo → Silla ergonómica** para deshacer el cambio.

**Qué significa lo nuevo aquí:**

- **Categoría de teletrabajo** (el selector del tipo): la categoría de la norma a la que pertenece todo activo de ese tipo. **Sin categoría** quiere decir que sus activos no se cuentan como insumo de teletrabajo.
- **Categoría actualizada.**: el aviso de que el cambio se guardó.
- Que la silla siga asignada pero deje de cubrir: quitar la categoría al **tipo** no borra la asignación del activo; solo deja de contarlo como insumo de la norma. Las asignaciones y resguardos no se tocan.

## 5. Escenarios sin bloque y con error

### 5.1 Sin bloque (presencial y dado de baja)

Objetivo: comprobar que el bloque no aparece en quien no es teletrabajador: ni en un colaborador presencial (aunque tenga un porcentaje residual guardado) ni en uno dado de baja, que solo muestran su lista de activos.

1. Con el Usuario A, abre la ficha de **Berta Zamora Cano** (`QA-TEL-09`, Presencial con 50% residual) y entra a **Activos**.
2. **Negativo a comprobar a propósito:** **no** aparece la tarjeta **Insumos de teletrabajo**. La sección muestra solo la lista **Activos vigentes** (con el **Celular corporativo** `QA-TEL-ACT-CEL-02`, sin etiqueta de categoría).
3. Vuelve a **Empleados** y cambia el filtro de estado a **Bajas**.
4. Abre la ficha de **Cesar Alcala Rios** (`QA-TEL-10`, dado de baja) y entra a **Activos**.
5. **Negativo a comprobar a propósito:** tampoco aquí aparece el bloque; se ve solo la lista de activos (la **Silla de oficina** `QA-TEL-ACT-SILLA-04`).

**Qué significa lo nuevo aquí:**

- **Que no aparezca el bloque** en un presencial (aun con porcentaje residual) o en un colaborador dado de baja: el cumplimiento de la norma solo se sigue de quien teletrabaja (Home Office o Híbrido) con teletrabajo mayor que cero; los demás solo ven sus activos.
- Un colaborador dado de baja conserva su lista de activos: lo que no ha devuelto sigue a su nombre.

### 5.2 Sin lectura de Activos e insumos: ni sección ni petición

Objetivo: comprobar que con un rol sin lectura de **Activos e insumos** la sección **Activos** no aparece en la ficha, y que su dirección directa no monta el bloque ni pide datos al servicio.

1. Cierra la sesión y entra con el **Usuario B** (`qa-employee-assets-none@gsti-tests.local`). Elige la empresa **QA Fundadora**.
2. Abre la ficha de **Tania Robles Vera** (`QA-TEL-01`) y mira su submenú.
3. **Negativo a comprobar a propósito:** en el submenú **no** está la opción **Activos** (el submenú termina en **Expediente**). No aparece deshabilitada, ni con aviso, ni con candado: simplemente no está.
4. Escribe en la barra de direcciones la dirección directa: `http://127.0.0.1:3000/employees/<slug-o-token-del-colaborador>/assets`.
5. La página queda **vacía**: no aparece el bloque **Insumos de teletrabajo** ni las listas de activos, ni un mensaje de error.
6. Abre la pestaña de red del navegador (F12 → Red), marca **Conservar registro** y recarga esa dirección: **no sale ninguna petición** que termine en `telework-supplies`. La pantalla no consultó nada.

**Qué significa lo nuevo aquí:**

- **Que no esté la sección** no es un fallo de la pantalla: el rol no tiene la lectura del módulo de activos, así que la sección no se le ofrece y su dirección directa no consulta nada.

### 5.3 Qué pasa cuando la lectura de la matriz no llega a responder

Objetivo: comprobar qué hace el backoffice cuando la petición de la matriz no recibe respuesta del servidor: por su política global, un fallo de red (o un error 500 del servidor) lleva a la **página de error del propio backoffice**, igual que en cualquier otra pantalla, y al reintentar la página completa la ficha vuelve con su bloque cargado.

1. Con el Usuario A, abre la ficha de **Tania Robles Vera** (`QA-TEL-01`) y entra a **Activos**.
2. Abre el navegador en F12 → **Red**.
3. Localiza la petición cuya dirección termina en `telework-supplies`, púlsala con el botón derecho y elige **Block request URL** (Bloquear URL de la petición).
4. Recarga la página (`F5`).
5. Lo que se ve: la **página de error del backoffice** —**500**, **Error interno del servidor**, con **Intentar de nuevo**, **Volver al inicio** y **Cerrar sesión**—. No aparece un error suelto dentro de la ficha, y es correcto: la política del backoffice trata una petición sin respuesta como un problema de la aplicación completa.
6. Quita el bloqueo (mismo botón derecho → **Unblock**) y pulsa **Intentar de nuevo**: la ficha vuelve a cargar y el bloque aparece otra vez con su silla **Entregado**.
7. **Negativo a comprobar a propósito:** en ningún momento se ve medio bloque pintado ni una ficha a medias; o carga la pantalla completa, o se ve la página de error.

**Qué significa lo nuevo aquí:**

- **Que el aviso sea de página y no del bloque**: la política global del backoffice manda a la página de error cuando la petición no recibe respuesta o el servidor falla con 500; ninguna pantalla se salva de eso, y el bloque tampoco inventa un error propio en ese caso.
- **Intentar de nuevo**: vuelve a cargar la pantalla completa, con sus peticiones.
- El error **propio** del bloque (**No se pudo cargar el cumplimiento de insumos.** con **Reintentar**) se ve cuando el servidor sí contesta con un rechazo de negocio (por ejemplo, sin permiso). Desde el navegador no se provoca recortando la petición: ver el apartado 7.

## 6. Responsivo e idiomas

### 6.1 Anchos angostos y anchos intermedios

Objetivo: comprobar que el bloque, dentro del carril angosto de la ficha, no se desborda a lo ancho en un teléfono (360 px) y que en escritorio cada renglón se abre a lo ancho (el rótulo de la categoría con sus activos a la izquierda y el estado al extremo derecho).

1. Con el Usuario A, en la ficha de **Tania Robles Vera** (`QA-TEL-01`), entra a **Activos**.
2. Estrecha la ventana del navegador hasta unos **360 px** de ancho (o usa el modo de dispositivo móvil).
3. La página **no se desplaza en horizontal**: no hay barra inferior de desplazamiento y el contenido del bloque no se sale hacia los lados.
4. En cada renglón, el contenido queda **apilado en una sola columna**, de arriba a abajo: primero el nombre de la categoría, luego su chip de estado y al final sus activos.
5. Ensancha la ventana a un **ancho intermedio, entre tableta y escritorio** (unos **850 px**): el renglón **sigue apilado en una sola columna** (el chip de estado viaja junto al rótulo); la pantalla intermedia no lo parte en dos. Es a propósito: entre tableta y escritorio la ficha deja al bloque un carril angosto.
6. Pon la ventana a **ancho de escritorio** (desde unos **1024 px**): ahí sí el renglón se abre —el rótulo de la categoría con sus activos a la izquierda y el chip de estado al extremo derecho— sin desbordarse.

(Lo que se ve es lo ya explicado en el Escenario 4.1.)

### 6.2 Idiomas — **no revisable en el ambiente entregado**

Objetivo: comprobar que en inglés la leyenda y los rótulos del bloque salen traducidos.

**Este objetivo no es verificable en el ambiente entregado:** el backoffice opera **solo en español** mientras el cambio de idioma está oculto —cualquier dirección con otro prefijo de idioma (`/en/…`) se reescribe a `/es/…` y el selector de idioma no está en la interfaz—, así que desde el navegador no se puede poner la ficha en inglés. No se inventan pasos para provocarlo: la traducción la cubren los archivos de idioma del propio bloque (es/en) y la verificación automática de claves de la historia (`npm run lint:i18n` en el backoffice, en verde). Se marca como **no verificable aquí** con este motivo.

## 7. Lo que no se revisa aquí

Se declara no revisable desde el navegador y queda cubierto por las pruebas automatizadas del plan:

- **El idioma inglés del bloque.** El backoffice fuerza el español y esconde el cambio de idioma (ver el Escenario 6.2): desde el navegador no se provoca. Lo cubren los locales es/en del bloque y `npm run lint:i18n`.
- **El error propio del bloque** (**No se pudo cargar el cumplimiento de insumos.** con **Reintentar**). Por la política global del backoffice, una petición **sin respuesta** o un **500** llevan a la página de error de toda la aplicación (Escenario 5.3), así que desde el navegador no se provoca un error *solo* del bloque: aparece cuando el servidor sí contesta un rechazo de negocio. Lo cubren las pruebas del panel (estado de error y reintento) y las del API.
- **Que el servidor rechace la lectura sin el permiso de Activos e insumos.** En pantalla solo se ve la ausencia de la sección (Escenario 5.2); el rechazo con su código solo se ve por HTTP.
- **Un colaborador de otra empresa o inexistente, y un identificador de colaborador inválido.** No se provocan desde la ficha; lo cubren las pruebas del API.
- **El detalle de la respuesta** (que no viajen datos de más y que el colaborador ajeno y el inexistente respondan igual). Por pantalla no se ve; lo cubren las pruebas del API.
- **El estado `Equipo propio declarado`.** Esta historia no lo produce (llega con otra historia del set), así que no se puede provocar en el ambiente sembrado; se lista en el Escenario 4.1 solo para que se sepa qué quiere decir.
- **Que el bloque no escriba ni descargue nada.** Lo cubren las pruebas del código.

## 8. Checklist

Cada casilla se marca **contra el objetivo de su escenario**, no contra "se hicieron los pasos":

- [x] 4.1 En la ficha de `QA-TEL-01`, el bloque **Insumos de teletrabajo** va arriba de los activos: silla **Entregado** con su activo (`QA-TEL-ACT-SILLA-01`, **Resguardo firmado**), cómputo **Sin cubrir**, aditamento **Sin entregar**, leyenda de **Obligatorio** y chip **1 sin cubrir**
- [x] 4.2 En la ficha de `QA-TEL-02` (Híbrido 20%), el mismo bloque con la leyenda **Registro preventivo** y chip **2 sin cubrir**
- [x] 4.3 En la ficha de `QA-TEL-03` (Híbrido 40%) la leyenda es la de **Obligatorio** (la de `QA-TEL-02` es preventivo) y **Vera Quintero** aparece en el listado **Teletrabajadores** con 40% (Ulises Pardo, 20%, no aparece)
- [x] 4.4 En `QA-TEL-04`, cómputo **Entregado** con los dos activos y la laptop con chip **En envío**; en `QA-TEL-05`, cómputo **En envío** con la sola laptop, chip **1 en envío**
- [x] 4.5 En `QA-TEL-06`, cómputo **Sin cubrir** aunque la laptop devuelta esté en **Activos devueltos**
- [x] 4.6 En `QA-TEL-07`, la silla y la laptop vigentes con su etiqueta de categoría; el celular (sin categoría) y el monitor devuelto sin etiqueta
- [x] 4.7 Tras quitar la categoría al tipo **Silla QA Reclas** con el Usuario C, la ficha de `QA-TEL-08` deja de contar la silla (pasa a **Sin cubrir**) y su renglón pierde la etiqueta, sin perder la asignación
- [x] 5.1 En `QA-TEL-09` (presencial) y `QA-TEL-10` (baja) no aparece el bloque; solo la lista de activos
- [x] 5.2 Con el Usuario B no está la sección **Activos** en el submenú, la dirección directa deja la página vacía y no sale ninguna petición a `telework-supplies`
- [x] 5.3 Con la petición de la matriz bloqueada (sin respuesta), el backoffice cae a su página de error (**500 / Error interno del servidor**) y al desbloquear y pulsar **Intentar de nuevo** la ficha vuelve con el bloque cargado
- [x] 6.1 A 360 px no hay desplazamiento horizontal y los renglones quedan apilados (rótulo, estado, activos); a unos 850 px siguen apilados y desde unos 1024 px el renglón se abre con el estado al extremo derecho
- [x] 6.2 **No verificable aquí** (el backoffice fuerza el español y esconde el cambio de idioma); se declara con su motivo y lo cubren los locales es/en y `npm run lint:i18n`

Recorrido completado: cada casilla se marcó **contra el objetivo de su escenario**.
