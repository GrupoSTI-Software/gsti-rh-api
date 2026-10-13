# Prueba manual — El estado de insumos en el listado de teletrabajadores

**Estado: entregado el 13 de octubre de 2026; el recorrido manual lo hace quien lo recibe y las casillas del checklist se marcan al caminarlo.**

**Problema:** la NOM-037 obliga a la empresa a llevar el listado de teletrabajadores (apartado 5.1) y a vigilar que a cada uno se le entregue la **silla ergonómica**, el **equipo de cómputo o impresión** y los **aditamentos** (apartado 5.7). El listado ya existía, pero no decía nada de ese cumplimiento: para saber a quién le faltaba un insumo había que abrir la ficha del colaborador, uno por uno, y ahí recién verlo.

**Solución:** el listado **Teletrabajadores** gana una columna **Insumos** a la derecha de **% de teletrabajo**, con chips que resumen el estado de cada uno: **Completo** cuando no falta nada ni hay entregas en camino, y si no **N sin cubrir** y/o **N en envío**, más **N resguardo(s) sin firmar** cuando hay activos entregados sin su vale firmado. Además, el nombre del colaborador es un enlace a la sección **Activos** de su ficha, donde está el detalle. La columna de porcentaje pasó de llamarse **% remoto** a **% de teletrabajo**.

Ejemplo: es como el pizarrón de una escuela en la salida al campamento. La lista dice quién va, y antes para saber quién ya trajo su casco tenías que abrir su mochila uno por uno. Ahora, junto a cada nombre, hay una etiqueta: **Completo** si ya trae todo, o cuántas cosas le faltan y cuántas van en camino; y si tocas el nombre, ves el detalle de lo que lleva.

## Glosario

- **Insumo de teletrabajo:** bien que la empresa le entrega a quien trabaja desde casa porque la NOM-037 lo exige (silla ergonómica, equipo de cómputo o impresión, aditamentos).
- **Aditamento:** accesorio que complementa el puesto en casa (monitor, teclado, diadema, reposapiés). La norma no obliga a entregarlo, por eso nunca se marca como un faltante.
- **Resguardo:** el vale con el que la persona recibe un activo. Está **firmado** si ya se subió el documento, y **sin firmar** si todavía no.
- **Folio:** el número que identifica al activo en el inventario (por ejemplo `QA-LST-ACT-SIL-01`).
- **Listado de teletrabajadores:** el registro obligatorio de la NOM-037 (apartado 5.1) con los colaboradores activos cuyo teletrabajo representa el 40% o más de su jornada.

## 1. Preparar

Prerrequisito: esta rama del API y la del backoffice están levantadas, y la base ya trae el módulo **Empleados**, el módulo **Activos e insumos** y el módulo **Teletrabajadores**.

Este manual se entrega para que una persona lo recorra en el navegador; el agente que lo escribió no lo camina.

Aviso: el archivo que siembra los datos es temporal y **no está versionado** en el repositorio, así que hay que tenerlo presente al armar el ambiente.

Ejecuta una vez el sembrador de QA compartido:

```bash
cd gsti-rh-api && node ace db:seed --files=database/seeders/_tmp_do_not_commit_qa_seeder.ts
```

Qué deja listo para esta prueba:

- **QA Fundadora**: la empresa donde se hace todo el recorrido, con los tres módulos disponibles.
- Los **tipos de activo** con su categoría de la norma: **Silla QA Listado** (categoría *Silla ergonómica*) y **Computo QA Listado** (categoría *Equipo de cómputo o impresión*).
- Los **seis colaboradores** de la tabla de abajo (`QA-LST-01` a `QA-LST-05` y `QA-LST-B`), uno por estado que prueba un escenario.
- La **empresa ajena** **QA Listado Empresa**, con su propio teletrabajador (`QA-LST-B`) y la membresía de la cuenta A en esa empresa, para el Escenario 4.7.
- Las **tres cuentas** de la §2.

**Señal para reconocer lo nuestro:** los colaboradores de esta prueba tienen código de nómina `QA-LST-…`; los activos de esta prueba tienen folio `QA-LST-ACT-…`; los tipos terminan en `QA Listado`. El listado también trae colaboradores de otras historias (por ejemplo los de código `QA-TEL-…`): son de otra prueba, no se tocan, y sus chips no se marcan aquí.

Estado de cada colaborador (lo que deja el sembrador):

| Código | Nombre | Modalidad y % | Activos sembrados | Escenario |
|---|---|---|---|---|
| `QA-LST-01` | Ana Lira Soto | Home Office, 100% | Silla `QA-LST-ACT-SIL-01` y laptop `QA-LST-ACT-LAP-01` entregadas con resguardo firmado | 4.1 |
| `QA-LST-02` | Luis Bravo Cano | Híbrido, 60% | Solo silla `QA-LST-ACT-SIL-02` entregada con resguardo firmado | 4.2 |
| `QA-LST-03` | Marta Espino Gil | Home Office, 100% | Silla `QA-LST-ACT-SIL-03` entregada con resguardo firmado + laptop `QA-LST-ACT-LAP-02` en envío | 4.3 y 4.6 |
| `QA-LST-04` | Pedro Nava Rios | Home Office, 100% | Silla `QA-LST-ACT-SIL-04` entregada **sin** resguardo firmado + laptop `QA-LST-ACT-LAP-03` entregada con resguardo firmado | 4.4 |
| `QA-LST-05` | Sofia Ortega Luna | Híbrido, 40% | Ninguno | 4.5 |
| `QA-LST-B` | Bruno Ajeno Rios | Home Office, 100% (empresa **QA Listado Empresa**) | Ninguno | 4.7 |

Orden del recorrido: los escenarios se recorren **en orden**. El listado es de solo consulta, así que recorrerlo no cambia nada; el único que mueve la sesión es el **Escenario 4.7**, que cambia la empresa activa y hay que devolverla a **QA Fundadora** al terminar.

### Evidencia y hallazgos

Cada escenario se marca **contra su `Objetivo:`**, no contra "se hicieron los pasos". Este manual **no pide capturas ni adjuntos**: el resultado esperado va escrito y quien recorre reporta lo que vio, con la cuenta y la empresa que usó. Los hallazgos que surjan se registran en `qa-valanserh/hallazgos.md`, en su cuadro de **14 campos**; el detalle técnico (código, causa) va en **Comentarios/Historial**, no en Evidencia. Los hallazgos se corrigen en esta misma rama.

## 2. Usuarios

Las tres cuentas entran por el backoffice con el mismo flujo: en `http://127.0.0.1:3000`, botón **Continuar con contraseña**, llena **Correo electrónico** y **Contraseña**, botón **Entrar**. Todas usan la contraseña de prueba `password`.

| | Correo | Contraseña | Login | Permisos (variante) | Para qué se usa |
|---|---|---|---|---|---|
| **A** | `qa-employee-assets-full@gsti-tests.local` | `password` | Backoffice | lectura de **Empleados** y de **Activos e insumos** (ve la columna y el enlace) | Escenarios 4.1 a 4.7, 5 y 6 |
| **B** | `qa-supplies-read@gsti-tests.local` | `password` | Backoffice | lectura de **Activos e insumos**, **sin** lectura de **Empleados** (ve la columna, no el enlace) | Escenario 5.1 |
| **C** | `qa-roles-none@gsti-tests.local` | `password` | Backoffice | **sin** lectura de **Activos e insumos** ni de **Empleados** (no ve la columna) | Escenario 5.2 |

Las tres entran al listado **Teletrabajadores**: el sembrador concede la lectura de ese módulo a todos los roles de QA, así que ninguna se detiene en un aviso de permisos. Las tres pueden abrir la pantalla con la que arranca el backoffice (**Monitor de asistencia**), que no es donde se prueba.

Quién aparece en el listado (no cambia con esta historia): colaboradores **activos** de la **empresa activa**, con modalidad **Home Office** o **Híbrido** y **40% o más** de teletrabajo. Por debajo del 40%, presenciales o dados de baja, no aparecen.

## 3. Dónde probar

Se prueba en el listado **Empresa → Teletrabajadores**.

Para entrar: en `http://127.0.0.1:3000`, botón **Continuar con contraseña**, llena **Correo electrónico** y **Contraseña** con la cuenta que toque, botón **Entrar**. Al entrar, el backoffice abre siempre la pantalla **Monitor de asistencia**, que no es donde se prueba: del menú lateral, grupo **Empresa**, entra a **Teletrabajadores**.

Para elegir la empresa (si el usuario tiene más de una): arriba a la derecha abre **Mi cuenta** (el avatar) y en el campo **Empresa** elige **QA Fundadora**.

URL directa del listado: `http://127.0.0.1:3000/telework-workers` (la dirección **no** lleva `/es`).

Cómo se lee la tabla, de izquierda a derecha: **Empleado**, **Código**, **Puesto**, **Modalidad**, **% de teletrabajo**, **Insumos** y **Lugar donde labora**. La columna **Insumos** va justo a la derecha de **% de teletrabajo** y trae los chips de estado de cada colaborador. El nombre del colaborador es un enlace cuando la cuenta puede abrir su ficha. Arriba de la tabla hay un buscador **Buscar** (placeholder **Nombre del empleado o puesto**) y un contador de teletrabajadores.

---

## 4. Con el Usuario A (lectura de Empleados y de Activos e insumos)

Entra con el Usuario A (`qa-employee-assets-full@gsti-tests.local`) y elige la empresa **QA Fundadora**.

### 4.1 Colaborador con los insumos completos

Objetivo: comprobar que un teletrabajador con la silla y el equipo de cómputo entregados y sus resguardos firmados aparece en el listado con el chip **Completo**, y que la categoría de **Aditamento** —que sigue sin entregarse— no le suma ningún pendiente.

1. Con el Usuario A, abre **Empresa → Teletrabajadores**.
2. Busca en el buscador **Buscar** (placeholder **Nombre del empleado o puesto**) a **Ana Lira Soto** (código de nómina `QA-LST-01`).
3. En su fila, mira la columna **Insumos**.
4. **Negativo a comprobar a propósito:** en su celda **no** aparece ningún chip de **sin cubrir**, **en envío** ni **resguardo sin firmar**.

**Qué debe verse:** la fila de **Ana Lira Soto** trae, en la columna **Insumos**, un único chip **Completo** (verde, de estado positivo). No aparecen los chips **N sin cubrir**, **N en envío** ni **N resguardo(s) sin firmar**. El aditamento, que la empresa no le ha entregado (su ficha lo muestra **Sin entregar**, ver el Escenario 4.6), **no** agrega ningún pendiente.

**Evidencia:** anota el chip que viste en la fila de `QA-LST-01`; adjunta captura solo si el equipo lo pide.

**Qué significa cada cosa que se ve:**

- **Insumos**: el encabezado de la columna nueva; resume el cumplimiento de insumos de teletrabajo del colaborador. Va a la derecha de **% de teletrabajo**.
- **Completo**: el colaborador está al corriente: no falta ninguna categoría obligatoria (silla y equipo de cómputo) ni hay nada en camino.
- **N sin cubrir**: cuántas categorías obligatorias (silla, equipo de cómputo) faltan y así cuentan como pendientes. El aditamento nunca entra en este conteo.
- **N en envío**: cuántas categorías obligatorias dependen de un activo que va en camino (todavía no está en manos de la persona).
- **N resguardo(s) sin firmar**: cuántos activos **ya entregados** tienen el resguardo sin firmar; puede aparecer junto a **Completo**.
- **Valores que la celda puede mostrar (todos):** **Completo**; **N sin cubrir**; **N en envío**; y **N resguardo(s) sin firmar** (este se cuenta aparte y puede acompañar a cualquiera de los otros). Los que llevan número se escriben en singular cuando el conteo es uno (**1 sin cubrir**) y en plural cuando es más (**2 sin cubrir**; **1 resguardo sin firmar** / **N resguardos sin firmar**).

### 4.2 Colaborador con un insumo sin cubrir

Objetivo: comprobar que a un teletrabajador al que se le entregó la silla pero le falta el equipo de cómputo, la columna **Insumos** dice cuántas categorías obligatorias quedan sin cubrir.

1. Con el Usuario A, busca a **Luis Bravo Cano** (código de nómina `QA-LST-02`, Híbrido al 60%) y mira su columna **Insumos**.
2. **Negativo a comprobar a propósito:** su celda **no** dice **Completo** y tampoco trae un chip de **en envío** (no hay nada en camino).

**Qué debe verse:** la celda **Insumos** de **Luis Bravo Cano** trae un solo chip **1 sin cubrir**. No dice **Completo** ni **en envío**.

**Evidencia:** anota el chip de la fila de `QA-LST-02`; adjunta captura solo si el equipo lo pide.

(Lo que se ve es lo ya explicado en el Escenario 4.1: el conteo son las categorías obligatorias sin entregar; aquí el equipo de cómputo es la que falta.)

### 4.3 Colaborador con un insumo en envío

Objetivo: comprobar que un activo que va en camino no cuenta como entregado —se resume en el chip **N en envío**— y que mientras haya algo en camino la columna **nunca** dice **Completo**.

1. Con el Usuario A, busca a **Marta Espino Gil** (código de nómina `QA-LST-03`, Home Office al 100%; su laptop va en camino) y mira su columna **Insumos**.
2. **Negativo a comprobar a propósito:** su celda **no** dice **Completo**; y como la silla ya está entregada, tampoco dice **sin cubrir**.

**Qué debe verse:** la celda **Insumos** de **Marta Espino Gil** trae un solo chip **1 en envío**. No aparece **Completo** ni **sin cubrir**.

**Evidencia:** anota el chip de la fila de `QA-LST-03`; adjunta captura solo si el equipo lo pide.

**Qué significa lo nuevo aquí:**

- **En envío** (el conteo): ese activo va en camino y todavía no está en manos de la persona, así que su categoría se sigue contando como pendiente; por eso, mientras haya algo en camino, **Completo** no aparece.

### 4.4 Resguardo sin firmar sobre insumos entregados

Objetivo: comprobar que un activo **ya entregado** cuyo resguardo todavía no se firma agrega el chip **1 resguardo sin firmar**, y que ese chip se muestra **junto a** **Completo** sin reemplazarlo.

1. Con el Usuario A, busca a **Pedro Nava Rios** (código de nómina `QA-LST-04`, Home Office al 100%; su silla está entregada sin el vale firmado) y mira su columna **Insumos**.

**Qué debe verse:** la celda **Insumos** de **Pedro Nava Rios** trae **dos** chips, uno junto al otro: **Completo** y **1 resguardo sin firmar**. El de resguardo **no** reemplaza a **Completo**: aparecen los dos.

**Evidencia:** anota los dos chips de la fila de `QA-LST-04`; adjunta captura solo si el equipo lo pide.

**Qué significa lo nuevo aquí:**

- **Resguardo sin firmar**: la persona todavía no firmó el vale con el que responde por el activo. El activo **sí** está entregado (por eso no resta cobertura y sigue valiendo **Completo**), pero el papel queda pendiente.

### 4.5 El umbral exacto del 40%

Objetivo: comprobar que un colaborador híbrido justo en el **40%** —la frontera que lo mete al listado obligatorio— aparece en el listado con su estado de insumos.

1. Con el Usuario A, busca a **Sofia Ortega Luna** (código de nómina `QA-LST-05`, Híbrido al 40%, sin insumos) y mírala en la tabla.
2. Revisa su **Modalidad**, su **% de teletrabajo** y su columna **Insumos**.
3. **Negativo a comprobar a propósito:** **Ulises Pardo Gil** (Híbrido al 20%) **no** aparece en el listado, porque no llega al 40%.

**Qué debe verse:** **Sofia Ortega Luna** aparece en la tabla con **Modalidad** *Híbrido*, **% de teletrabajo** `40` y, en **Insumos**, el chip **2 sin cubrir** (no tiene ni silla ni equipo de cómputo entregados; el aditamento no cuenta). **Ulises Pardo Gil** (20%) no está en la lista.

**Evidencia:** anota la fila de `QA-LST-05` y que el 20% no aparece; adjunta captura solo si el equipo lo pide.

**Qué significa lo nuevo aquí:**

- **% de teletrabajo** (el encabezado de la columna): el porcentaje de la jornada que la persona trabaja a distancia. Antes se llamaba **% remoto**. El listado incluye a quien llega **al 40% o más**.

### 4.6 Abrir la ficha del colaborador desde el listado

Objetivo: comprobar que el nombre del colaborador es un enlace que lleva a la sección **Activos** de su ficha, y que los estados que se ven ahí coinciden con el chip que mostraba la columna **Insumos** del listado.

1. Con el Usuario A, en el listado, localiza a **Marta Espino Gil** (código de nómina `QA-LST-03`) y anota su chip: **1 en envío**.
2. Pulsa su **nombre**.
3. La aplicación abre la sección **Activos** de su ficha. La dirección cambia a la de esa sección: empieza con `/employees/`, sigue el identificador del colaborador y termina en `/assets` (no lleva `/es`).
4. Arriba de la lista de activos está la tarjeta **Insumos de teletrabajo**, con sus tres categorías y sus chips de resumen.

**Qué debe verse:** se abre la sección **Activos** de la ficha de **Marta Espino Gil** (el enlace llevó al colaborador correcto, no a otro). En la tarjeta **Insumos de teletrabajo**:

- **Silla ergonómica** → chip **Entregado**, con el activo **Silla de oficina**, su **Folio QA-LST-ACT-SIL-03** y el chip **Resguardo firmado**.
- **Equipo de cómputo o impresión** → chip **En envío**, con el activo **Laptop de trabajo**, su **Folio QA-LST-ACT-LAP-02** y el chip **En envío**.
- **Aditamento** → chip **Sin entregar**, sin activos debajo.
- El resumen de la tarjeta dice **1 en envío**, el mismo estado que la columna **Insumos** del listado.

**Evidencia:** anota el chip del listado y el estado que viste en la ficha; adjunta captura solo si el equipo lo pide.

**Qué significa lo nuevo aquí** (los estados de la categoría que se ven en la ficha):

- **Entregado**: la empresa ya le entregó cuando menos un activo de esa categoría.
- **En envío**: lo tiene en camino; todavía no está en sus manos.
- **Equipo propio declarado**: lo cubre con su propio equipo porque la empresa así lo registró. Este estado **no se puede provocar** en el ambiente sembrado (ver el apartado 7); se lista aquí solo para que se sepa qué quiere decir.
- **Sin cubrir**: falta y así cuenta como pendiente.
- **Sin entregar**: no se le ha entregado; solo aplica al **Aditamento**, que la norma no exige.
- **Resguardo firmado**: la persona ya subió el vale con el que responde por el activo.

### 4.7 Aislamiento entre empresas

Objetivo: comprobar que el listado y sus estados corresponden **solo** a la empresa activa y no mezclan colaboradores ni insumos de otra empresa.

1. Con el Usuario A, en **QA Fundadora**, abre **Empresa → Teletrabajadores** y anota los colaboradores que llevan código `QA-LST-…` y sus chips.
2. Arriba a la derecha abre **Mi cuenta** (el avatar) y en el campo **Empresa** elige **QA Listado Empresa**.
3. Vuelve a entrar a **Empresa → Teletrabajadores**.
4. Al terminar, elige otra vez **QA Fundadora** en el campo **Empresa**.

**Qué debe verse:** con **QA Listado Empresa** activa, el listado trae **solo** colaboradores de esa empresa —el único es **Bruno Ajeno Rios** (código `QA-LST-B`), con el chip **2 sin cubrir**— y **ninguno** de **QA Fundadora** (no aparece Ana Lira Soto ni ningún `QA-LST-01`…`QA-LST-05`). Al volver a **QA Fundadora**, el listado y sus chips vuelven a ser los de esa empresa.

**Evidencia:** anota qué colaboradores viste con cada empresa activa; adjunta captura solo si el equipo lo pide.

**Qué significa lo nuevo aquí:**

- Que el listado dependa de la **empresa activa**: cada empresa lleva su propio listado. Al cambiar de empresa cambia todo el contenido, y el estado de insumos de una nunca se cuela en la otra.

## 5. Con los Usuarios B y C (sin algún permiso)

### 5.1 Sin permiso de Empleados: la columna sí, el enlace no

Objetivo: comprobar que con un rol **sin lectura de Empleados** la columna **Insumos** sigue visible, pero el nombre del colaborador queda como texto y **no** lleva a ninguna ficha.

1. Cierra la sesión y entra con el **Usuario B** (`qa-supplies-read@gsti-tests.local`). Elige la empresa **QA Fundadora**.
2. Abre **Empresa → Teletrabajadores**.
3. Mira la columna **Insumos** y trata de pulsar el **nombre** de un colaborador.

**Qué debe verse:** la columna **Insumos** aparece igual, con sus chips. El **nombre** es texto normal —sin subrayado ni apariencia de enlace— y al pulsarlo **no** navega a ninguna parte. El resto del listado funciona igual.

**Evidencia:** anota que la columna está y el nombre no es enlace; adjunta captura solo si el equipo lo pide.

**Qué significa lo nuevo aquí:**

- Que el nombre deje de ser enlace: abrir la ficha exige la lectura de **Empleados**. Sin ese permiso, la columna de insumos se sigue viendo, pero el nombre se queda como texto.

### 5.2 Sin permiso de Activos e insumos: ni columna ni enlace

Objetivo: comprobar que con un rol **sin lectura de Activos e insumos** el listado se ve como antes de esta historia —sin la columna **Insumos** y sin enlace en el nombre— y que el dato de insumos ni siquiera llega al navegador.

1. Cierra la sesión y entra con el **Usuario C** (`qa-roles-none@gsti-tests.local`). Elige la empresa **QA Fundadora**.
2. Abre la consola del navegador (F12) → pestaña de **red**, marca **Conservar registro**, y recarga **Empresa → Teletrabajadores**.
3. En la respuesta que alimenta el listado, busca las palabras de los chips (**sin cubrir**, **en envío**, **resguardo**) o un identificador de ficha.
4. Mira el listado en pantalla.

**Qué debe verse:** el listado se ve **como antes**: las columnas terminan en **% de teletrabajo** y siguen con **Lugar donde labora** (**no** aparece **Insumos**), y el **nombre** es texto, no enlace. En la pestaña de red, el cuerpo de la respuesta **no** trae ningún resumen de insumos ni un identificador de ficha.

**Evidencia:** anota que no hay columna ni enlace y que la respuesta no traía el resumen; adjunta captura solo si el equipo lo pide.

**Qué significa lo nuevo aquí:**

- Que la columna ni siquiera se arme: sin la lectura del módulo de insumos, el servidor **no manda** el resumen y la pantalla no dibuja columna ni enlace. No aparece deshabilitada ni con candado: simplemente no está, y el dato no viaja al navegador.

## 6. Anchos de pantalla

Objetivo: comprobar que el listado con la columna **Insumos** no se desborda a lo ancho en un teléfono (360 px) ni en un ancho intermedio, y que en escritorio se lee completo.

1. Con el Usuario A, en **QA Fundadora**, abre **Empresa → Teletrabajadores**.
2. Estrecha la ventana del navegador hasta unos **360 px** de ancho (o usa el modo de dispositivo móvil).
3. La página **no se desplaza en horizontal**: no hay barra inferior de desplazamiento y el contenido (tabla y chips) no se sale hacia los lados.
4. Ensancha la ventana a un **ancho intermedio, entre tableta y escritorio** (unos **850 px**).
5. Pon la ventana a **ancho de escritorio** (desde unos **1024 px**).

**Qué debe verse:** a **360 px**, el listado **no** presenta desplazamiento horizontal; los chips de la columna **Insumos** envuelven en varias líneas dentro de su celda y nada se corta. A unos **850 px** tampoco hay desbordamiento y los chips se leen completos. Desde unos **1024 px** se ven todas las columnas, con **Insumos** a la derecha de **% de teletrabajo**.

**Evidencia:** anota en qué anchos no hubo desplazamiento horizontal; adjunta captura solo si el equipo lo pide.

(Lo que se ve es lo ya explicado en el Escenario 4.1.)

## 7. Lo que no se revisa aquí

Se declara no revisable desde el navegador y queda cubierto por las pruebas automatizadas del plan:

- **El chip `Equipo propio declarado`.** La función que declara el equipo propio llega con otra historia, que todavía no está integrada, así que el ambiente sembrado **no produce** ese estado: no hay forma de que ese chip salga en la columna ni en la ficha. Se lista en los Escenarios 4.1 y 4.6 solo para que se sepa qué quiere decir; lo cubren las pruebas automáticas del resumen.
- **El error del listado** (**No se pudo cargar el listado de teletrabajadores.** con **Reintentar**). Por la política global del backoffice, una petición sin respuesta o un error del servidor llevan a la **página de error de toda la aplicación**, así que desde la pantalla no se provoca un error *solo* del listado; y "detener la API" o "manipular la sesión" no son cosas que una persona de RH pueda hacer desde el navegador. Lo cubren las pruebas del backoffice y del API.
- **El idioma inglés del listado.** El backoffice opera **solo en español** y esconde el cambio de idioma: cualquier dirección con otro prefijo de idioma (`/en/…`) se reescribe a español y no hay selector visible. No se inventan pasos para provocarlo; lo cubren los archivos de idioma (es/en) de la pantalla y `npm run lint:i18n` del backoffice, en verde.
- **El detalle de la respuesta sin permiso.** En pantalla solo se ve la ausencia de la columna y del enlace (Escenario 5.2); que el servidor **no** mande el resumen ni el identificador de la ficha solo se comprueba por HTTP. Lo cubren las pruebas del API.

## 8. Checklist

Cada casilla se marca **contra el objetivo de su escenario**, no contra "se hicieron los pasos":

- [ ] 4.1 En `QA-LST-01` la columna **Insumos** trae solo el chip **Completo**, aunque su aditamento siga **Sin entregar** (no suma pendientes)
- [ ] 4.2 En `QA-LST-02` la columna dice **1 sin cubrir** y no **Completo** ni **en envío**
- [ ] 4.3 En `QA-LST-03` la columna dice **1 en envío** y **no** dice **Completo**
- [ ] 4.4 En `QA-LST-04` la columna trae **Completo** **y** **1 resguardo sin firmar**, ambos chips
- [ ] 4.5 `QA-LST-05` (Híbrido 40%) aparece en el listado con **% de teletrabajo** `40` y el chip **2 sin cubrir**; el 20% no aparece
- [ ] 4.6 Pulsar el nombre de `QA-LST-03` abre la sección **Activos** de su ficha y sus estados coinciden con el chip **1 en envío** del listado
- [ ] 4.7 Con **QA Listado Empresa** activa solo aparece `QA-LST-B`, y al volver a **QA Fundadora** reaparecen sus colaboradores
- [ ] 5.1 Con el Usuario B la columna **Insumos** se ve, pero el nombre no es enlace ni navega
- [ ] 5.2 Con el Usuario C no hay columna **Insumos** ni enlace, y la respuesta del listado no trae el resumen de insumos
- [ ] 6 A 360 px y a unos 850 px no hay desplazamiento horizontal y los chips no se salen; a unos 1024 px se ven todas las columnas

Recorrido completado: cada casilla se marcó **contra el objetivo de su escenario**.
