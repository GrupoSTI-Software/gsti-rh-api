# Prueba manual — Ver los activos asignados en la ficha del colaborador

**Estado: entregado el 9 de octubre de 2026 y pendiente del recorrido manual de una persona (quien lo escribió no lo camina).**

**Problema:** Recursos Humanos asigna activos, registra devoluciones y firma resguardos en **Activos e insumos**, pero siempre partiendo del activo: para saber qué tiene puesta una persona había que abrir cada activo y buscar en su resguardo. La ficha del colaborador no mostraba nada de sus activos, así que responder "¿qué trae este colaborador y qué devolvió?" obligaba a saltar de pantalla en pantalla.

**Solución:** la ficha del colaborador gana una sección **Activos**, de solo consulta, con dos bloques: **Activos vigentes** (lo que la persona tiene ahora, incluido lo que va en camino) y **Activos devueltos** (su histórico, con fecha y motivo). Cada activo se ve con su folio, su tipo, su serie y sus características, el estado del resguardo (**firmado** o **sin firmar**) y el estado de la asignación (**Asignado** o **En envío**). Pulsar el nombre de un activo que sigue en el catálogo abre ese activo en Activos e insumos, en su pestaña de resguardo.

Ejemplo: es como la mochila de un estudiante. Antes, para saber qué llevaba tenías que abrir cada cuaderno y buscar en su hoja de préstamo. Ahora abres su ficha y ves de un vistazo el equipo que trae hoy, el que está por llegarle y lo que ya devolvió, con la nota de si firmó el vale.

## Glosario

- **Activo:** un bien concreto que la empresa le entregó a una persona (una laptop, un celular, un monitor), con su folio.
- **Folio:** el número que identifica al activo en el inventario (por ejemplo "ACT-0031").
- **Serie:** el número de serie del aparato; algunos activos no lo tienen.
- **Tipo de activo:** la clase de bien de la que cuelga el activo (por ejemplo "Laptop").
- **Resguardo:** el vale con el que la persona recibe el activo. Está **firmado** si ya se subió, y **sin firmar** si todavía no.
- **Vigente:** el activo que la persona tiene ahora, o que va en camino (**En envío**).
- **Devuelto:** el activo que la persona ya regresó; se guarda con su fecha y su motivo.
- **Estado del catálogo:** si el activo del inventario está **Inactivo**, **Extraviado** o **Dañado**, además de la asignación.

## 1. Preparar

Prerrequisito: esta rama del API y la del backoffice están levantadas, y la base ya trae los módulos **Empleados** y **Activos e insumos**.

Este manual se entrega para que una persona lo recorra en el navegador; el agente que lo escribió no lo camina.

Aviso importante sobre los datos: **esta historia no siembra datos de QA** y no trae sembrador propio. El ambiente de pruebas es el que debe traer ya todo lo que el recorrido necesita. Abajo está la lista; el último bloque de la sección (§7) dice qué hacer si algo de esto falta.

**Roles de prueba (ver la tabla de la §2).** Nombra los roles, no los correos: quien prueba entra con las credenciales que el ambiente tenga dadas de alta para cada rol. Un rol debe tener **lectura de Activos e insumos** (y lectura de Empleados, para poder abrir la ficha) y otro debe tener lectura de Empleados **sin** lectura de Activos e insumos.

**Datos que el ambiente debe traer, por escenario.** Reconoce a los colaboradores y activos por las condiciones de esta tabla (no por un prefijo, porque no hay sembrador):

| Escenario | Lo que el ambiente debe traer |
|---|---|
| 4.1 Ficha completa | Un colaborador con una **laptop vigente con resguardo firmado** y un **celular devuelto** con motivo **Cambio de equipo**. Si hay más de un devuelto, que las fechas de devolución permitan ver el orden (el más reciente primero). |
| 4.2 Resguardo sin firmar | Un activo **vigente sin resguardo cargado** (por ejemplo un monitor) asignado al mismo colaborador. |
| 4.3 En envío | Un activo **vigente en envío** (con su asignación en estado "en envío"). |
| 4.4 Extraviado y eliminado | Un activo **vigente con estado de catálogo "Extraviado"** y un activo **eliminado del catálogo** que ya se haya devuelto (que quede en el histórico). |
| 4.5 Enlace al activo | El mismo activo de 4.1 (la laptop), que sí sigue en el catálogo. |
| 4.6 Colaborador nuevo | Un colaborador **sin ninguna asignación** (ni vigentes ni devueltos). |
| 4.7 Colaborador dado de baja | Un colaborador **dado de baja** que conserve activos vigentes y devueltos. |

Si el ambiente no puede traer alguno de estos estados, el escenario que depende de él se reporta como **no verificable aquí** (ver §7), no se inventan pasos.

## 2. Usuarios

Todas las cuentas se usan con las credenciales de prueba del ambiente; **no se fijan correos ni contraseña** en este manual, porque esta historia no siembra datos.

| | Rol | Permisos | Para qué se usa |
|---|---|---|---|
| **A** | Recursos Humanos con acceso a la ficha del colaborador y a Activos e insumos | **lectura de Empleados** y **lectura de Activos e insumos** | Escenarios 4.1 a 4.7 y 6.1 |
| **B** | Recursos Humanos con acceso a la ficha del colaborador **sin** acceso a Activos e insumos | **lectura de Empleados** y **sin** lectura de Activos e insumos | Escenario 5.1 |

## 3. Dónde probar

La sección vive dentro de la ficha del colaborador.

Para entrar: en `http://127.0.0.1:3000`, botón **Continuar con contraseña**, llena **Correo electrónico** y **Contraseña** con las credenciales del rol que toque, botón **Entrar**.

Para elegir la empresa (si el usuario tiene más de una): arriba a la derecha abre **Mi cuenta** (el avatar) y en el campo **Empresa** elige la empresa de pruebas.

Para llegar a la ficha: menú lateral → **Empleados**; busca al colaborador y, en su tarjeta, pulsa **Ver detalles**. La ficha abre en la sección **Información del empleado**.

La sección nueva es **Activos**: está en el submenú lateral de la ficha, **al final, después de Expediente**, con el icono de un portátil.

URL directa de la sección: `http://127.0.0.1:3000/employees/<slug-o-token-del-colaborador>/assets` (la dirección **no** lleva `/es`).

## 4. Con el rol A (lectura de Activos e insumos)

Entra con el Usuario A y elige la empresa de pruebas. Abre la ficha del colaborador que toque en cada escenario.

### 4.1 Ficha completa: vigentes y devueltos

Objetivo: comprobar que en la ficha de un colaborador con activos, la sección **Activos** aparece al final del submenú y muestra cada vigente con sus datos y el estado de su resguardo, y cada devuelto con su fecha y motivo, en el orden correcto.

1. Con el Usuario A, abre la ficha del colaborador que trae la **laptop vigente con resguardo firmado** y el **celular devuelto**.
2. En el submenú de la ficha, al final (después de **Expediente**), está la opción **Activos** con el icono de un portátil. Púlsala.
3. Aparece la card **Activos vigentes** (con su conteo **Total: …**) y, debajo, la card **Activos devueltos**.
4. En **Activos vigentes**, el renglón de la laptop muestra: su nombre, **Folio …**, **Tipo: …**, **Serie …** (solo si el activo tiene serie), cada característica capturada como **Nombre: valor**, **Asignado el …**, el chip **Asignado** y el chip **Resguardo firmado**.
5. En **Activos devueltos**, el renglón del celular muestra: su nombre, **Tipo: …**, **Devuelto el …** (la fecha de devolución), **Motivo: Cambio de equipo** y su chip de resguardo.
6. El orden de **Activos devueltos** va del más reciente al más antiguo **por fecha de devolución**, no por fecha de asignación.

Evidencia: una captura de la sección con las dos cards visibles (donde se lean los textos de los chips y "Motivo: …" en el devuelto) y una captura del orden de **Activos devueltos** si hay más de un renglón.

### 4.2 Resguardo sin firmar

Objetivo: comprobar que un activo vigente al que todavía no se le ha subido el resguardo muestra el chip **Resguardo sin firmar**, en lugar de "Resguardo firmado".

1. Con el Usuario A, abre la ficha del mismo colaborador y entra a **Activos**.
2. En **Activos vigentes**, busca el renglón del activo que **no tiene resguardo cargado** (el monitor del ambiente).
3. Ese renglón muestra el chip **Resguardo sin firmar**; el renglón sigue en **Activos vigentes**, con sus datos y su chip de asignación **Asignado**.

Evidencia: una captura del renglón del monitor donde se lea **Resguardo sin firmar**.

### 4.3 En envío

Objetivo: comprobar que un activo que va en camino aparece entre los vigentes con el chip **En envío**.

1. Con el Usuario A, abre la ficha del colaborador que tiene el activo **en envío** y entra a **Activos**.
2. En **Activos vigentes** (no en devueltos), el renglón de ese activo muestra el chip **En envío**.
3. El mismo renglón trae sus datos (folio, tipo, etc.) como cualquier vigente.

Evidencia: una captura del renglón con el chip **En envío**.

### 4.4 Extraviado y activo eliminado

Objetivo: comprobar que un activo con estado **Extraviado** sigue apareciendo con su chip y conserva su enlace, y que un activo **eliminado del catálogo** aparece con su nombre como texto, sin enlace.

1. Con el Usuario A, abre la ficha del colaborador que toque y entra a **Activos**.
2. En **Activos vigentes**, el renglón del activo **extraviado** muestra, además de su chip de asignación, el chip **Extraviado**. Su nombre sigue siendo un enlace (color y subrayado de enlace al pasar el cursor).
3. En **Activos devueltos**, el renglón del activo **eliminado del catálogo** muestra su nombre como **texto normal**, sin enlace; si pasas el cursor y pulsas, no navega a ninguna parte. El renglón conserva el folio, el tipo y la fecha de devolución que tenía.
4. **Negativo a comprobar a propósito:** el renglón eliminado no se puede abrir; el extraviado sí.

Evidencia: una captura del renglón con **Extraviado** (que se note que el nombre se ve como enlace) y una captura del renglón eliminado (que se note que su nombre es texto, sin enlace).

### 4.5 Enlace al activo

Objetivo: comprobar que al pulsar el nombre de un activo que sigue en el catálogo, se abre **Activos e insumos** con la ficha de ese activo en su pestaña de resguardo.

1. Con el Usuario A, en la ficha del colaborador del escenario 4.1, entra a **Activos**.
2. En **Activos vigentes**, pulsa el nombre de la **laptop**.
3. La app navega a **Activos e insumos** y abre la ficha de ese activo. La pestaña **Resguardo** (junto a **Ficha** y **Valor**) es la que queda seleccionada.
4. En la barra de direcciones se lee la pantalla de activos con el activo y la pestaña en la dirección: `http://127.0.0.1:3000/supplies?activo=<número>&tab=resguardo` (la dirección **no** lleva `/es`).

Evidencia: una captura de la ficha del activo abierta en la pestaña **Resguardo** y una captura de la barra de direcciones con `activo=…&tab=resguardo`.

### 4.6 Colaborador nuevo, sin activos

Objetivo: comprobar que la ficha de un colaborador sin ninguna asignación muestra un solo aviso de que no tiene activos, y ninguna card de devueltos.

1. Con el Usuario A, abre la ficha del colaborador **sin activos**.
2. Entra a **Activos**.
3. Se ve un aviso con **Sin activos asignados** y, debajo, **Los activos se asignan desde Activos e insumos y aparecen aquí.**
4. **Negativo a comprobar a propósito:** no aparece la card **Activos vigentes** ni la card **Activos devueltos**.

Evidencia: una captura de la sección con solo el aviso **Sin activos asignados**.

### 4.7 Colaborador dado de baja

Objetivo: comprobar que la ficha de un colaborador dado de baja sigue mostrando sus activos: lo que no ha devuelto y su histórico.

1. Con el Usuario A, abre la ficha del colaborador **dado de baja**.
2. Entra a **Activos**.
3. La sección aparece igual que en un colaborador vigente: se ven sus **Activos vigentes** (lo que no ha devuelto) y sus **Activos devueltos**.
4. **Negativo a comprobar a propósito:** la baja del colaborador no deja la sección vacía ni con un error.

Evidencia: una captura de la sección del colaborador dado de baja con sus vigentes y devueltos.

## 5. Con el rol B (sin lectura de Activos e insumos)

Cierra la sesión del Usuario A y entra con el Usuario B.

### 5.1 La sección no aparece y la URL directa no monta nada

Objetivo: comprobar que con un rol sin lectura de Activos e insumos la sección **Activos** no aparece en el submenú de la ficha, y que abrir su dirección directa no monta el panel ni pide datos.

1. Con el Usuario B, abre la ficha del colaborador del escenario 4.1 y mira su submenú.
2. **Negativo a comprobar a propósito:** en el submenú **no** está la opción **Activos**. No aparece deshabilitada, ni con un aviso, ni con un candado: simplemente no está (el submenú termina en **Expediente**).
3. Escribe en la barra de direcciones la dirección directa: `http://127.0.0.1:3000/employees/<slug-o-token-del-colaborador>/assets`.
4. La página queda **vacía**: no aparecen las cards **Activos vigentes** ni **Activos devueltos**, ni el aviso **Sin activos asignados**, ni un mensaje de error. No se ve nada dentro de la sección.
5. Abre la pestaña de red del navegador (F12 → Red) y recarga esa dirección: **no sale ninguna petición** al servicio de activos del colaborador. La pantalla no consultó nada.

Evidencia: una captura del submenú sin la opción **Activos** (que se vea que termina en **Expediente**), una captura de la página vacía en la dirección directa y una captura de la pestaña de red al recargar, sin la petición de activos.

## 6. Responsivo

### 6.1 A 360 px

Objetivo: comprobar que a 360 px de ancho la sección no produce desplazamiento horizontal y que cada renglón apila el nombre y los chips en una columna, con los metadatos debajo.

1. Con el Usuario A, en la ficha del colaborador del escenario 4.1, entra a **Activos**.
2. Estrecha la ventana del navegador hasta unos **360 px** de ancho (o usa el modo de dispositivo móvil).
3. La página **no se desplaza en horizontal**: no hay barra inferior de desplazamiento y el contenido no se sale hacia los lados.
4. En cada renglón, el nombre y los chips quedan **apilados en una columna** (el nombre arriba y los chips debajo), y los metadatos (**Folio …**, **Tipo: …**, **Asignado el …**) van **debajo**.
5. **Contraste:** al ensanchar la ventana a un ancho de escritorio, cada renglón pasa a **dos columnas**, los datos a un lado y los chips al otro.

Evidencia: una captura a 360 px de ancho (que se vea la regla o el ancho en el modo dispositivo) y una captura del mismo renglón en ancho de escritorio para el contraste de dos columnas.

## 7. Lo que no se revisa aquí

Se declara no revisable desde el navegador y queda cubierto por las pruebas automatizadas del plan:

- **El rechazo del servidor cuando falta la lectura de Activos e insumos.** En pantalla solo se ve la ausencia de la sección (Escenario 5.1); que el servidor responda con su código y no consulte solo se ve por HTTP.
- **Un colaborador de otra empresa o inexistente.** No se puede provocar desde la ficha (la dirección usa el identificador del colaborador de la empresa en pantalla); que ambos casos den el mismo resultado sin distinguirse lo cubren las pruebas.
- **Una dirección con un identificador de colaborador inválido.** No se provoca desde la URL de la ficha; lo cubren las pruebas.
- **La minimización de la respuesta** (que no viajen el archivo del resguardo, fotos, rutas de almacenamiento ni el identificador de empresa). Por pantalla no se ve; lo cubren las pruebas.
- **Que la sección no escriba ni descargue nada.** Lo cubren las pruebas del código.
- **El estado de error con el botón Reintentar.** Hace falta un fallo del servidor que la base de prueba no produce: no hay pasos para apagar el servidor ni para simular el fallo.
- **Los bordes del orden de devueltos** (cuando la fecha de devolución no existe y se ordena por asignación, y los empates). El orden normal se ve en el Escenario 4.1; los bordes no son provocables desde el cliente.
- **Que un resguardo borrado cuente como sin firmar.** No se puede provocar desde el cliente; lo cubren las pruebas.
- **El formato de las características de tipo Sí/No y de fecha.** Si el ambiente trae esas características se ven en el Escenario 4.1; si no, lo cubren las pruebas.

## 8. Checklist

Cada casilla se marca contra el objetivo de su escenario, no contra "se hicieron los pasos":

- [ ] 4.1 La sección **Activos** está al final del submenú (tras **Expediente**); la laptop vigente muestra folio, tipo, serie, características, **Asignado el …**, **Asignado** y **Resguardo firmado**; el celular devuelto muestra **Devuelto el …**, **Motivo: Cambio de equipo** y su resguardo; el orden de devueltos es por fecha de devolución
- [ ] 4.2 El activo vigente sin resguardo muestra el chip **Resguardo sin firmar**
- [ ] 4.3 El activo en camino aparece en vigentes con el chip **En envío**
- [ ] 4.4 El activo extraviado muestra el chip **Extraviado** y enlaza; el activo eliminado muestra su nombre como texto, sin enlace
- [ ] 4.5 Al pulsar el nombre de la laptop se abre **Activos e insumos** con su ficha en la pestaña **Resguardo** (`activo=…&tab=resguardo`)
- [ ] 4.6 El colaborador sin activos muestra **Sin activos asignados** y ninguna card de devueltos
- [ ] 4.7 El colaborador dado de baja sigue mostrando sus vigentes y devueltos
- [ ] 5.1 Con el rol sin permiso, la opción **Activos** no está en el submenú y la URL directa deja la página vacía, sin petición al servicio
- [ ] 6.1 A 360 px no hay desplazamiento horizontal y nombre y chips se apilan en una columna, con los metadatos debajo

Recorrido completo el ___ de ________ de 2026: cada casilla se marca **contra el objetivo de su escenario**, no contra "se hicieron los pasos".
