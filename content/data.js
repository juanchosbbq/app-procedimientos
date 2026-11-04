"use strict";
/* ====== CONTENIDO DE LA APP (editar aquí) ======
   Este fichero SOLO se lee en el servidor: cada puesto recibe únicamente
   los grupos que le corresponden según PROFILES. Los códigos de acceso NO
   van aquí: se configuran como variables de entorno (ver README). */
const PROFILES={
  cocina:{label:"Equipo de Cocina",groups:["cocina","burgers"]},
  jefe_cocina:{label:"Jefe de Cocina",groups:["cocina","sup_cocina","burgers"]},
  sala:{label:"Equipo de Sala",groups:["sala","burgers"]},
  jefe_sala:{label:"Encargado de Sala",groups:["sala","sup_sala","burgers"]},
  oficina:{label:"Oficina",groups:["oficina"]}
};
const QUICK_COCINA=[
  {v:"71 °C",k:"Temp. interior mínima hamburguesa"},
  {v:"180 °C",k:"Temp. máxima aceite freidora"},
  {v:"~140 °C",k:"Freidora en mantenimiento (sin actividad)"},
  {v:"11:30",k:"Encendido de parrillas"},
  {v:"20 min",k:"Precalentamiento freidoras antes del servicio"},
  {v:"2-3×/día",k:"Eliminación líquidos de descongelación"},
  {v:"2 × 90 g",k:"Muy hecha: formato dos carnes"},
  {v:"Diario",k:"Filtrado del aceite"}
];
const QUICK_SALA=[
  {v:"<30 s",k:"Saludo desde que entra el cliente"},
  {v:"15 min",k:"Cortesía antes de marcar no-show"},
  {v:"1 h 30",k:"Reserva estándar (Malasaña: 1 h 15)"},
  {v:"1 h",k:"Antelación mínima para confirmar reservas"},
  {v:"Cada 1 h",k:"Revisión de baños durante el servicio"},
  {v:"≥20 €",k:"Pedido mínimo para sumar un gol del FC"},
  {v:"2·4·6 %",k:"Cashback FC: Canterano · Titular · Pichichi"},
  {v:"<5 min",k:"Mesa lista tras la marcha del cliente"}
];
const DATA=[
 {group:"cocina",groupLabel:"Cocina",draft:false,items:[
  {id:"inicio",title:"Inicio de jornada",summary:"Puntualidad, fichaje, uniformidad e higiene",blocks:[
   {t:"warn",x:"La hora de entrada es la hora de estar LISTO para trabajar, no la hora de empezar a cambiarse."},
   {t:"p",x:"Fichar únicamente una vez uniformado y preparado para producción. Prohibido fichar con ropa de calle. El fichaje de salida sí puede hacerse con ropa de calle, una vez completadas las tareas de cierre."},
   {t:"h",x:"Uniformidad obligatoria"},
   {t:"list",x:["Camiseta o uniforme oficial de Juancho's BBQ","Delantal de trabajo limpio","Gorra o protección capilar","Calzado antideslizante"]},
   {t:"h",x:"Higiene personal"},
   {t:"list",x:["Lavado de manos al entrar en cocina","Uñas cortas y limpias","Prohibido anillos, relojes y pulseras"]},
   {t:"h",x:"Primera persona en cocina"},
   {t:"p",x:"Es responsable de recibir al proveedor, verificar pedido contra albarán, comprobar temperaturas de refrigerados y congelados, colocar producto en cámara y realizar la limpieza inicial de la zona de cocinado."},
   {t:"ban",x:"NUNCA aceptar mercancía con envase roto, mal estado, temperatura inadecuada o productos no solicitados."},
   {t:"media",kind:"foto",label:"Ejemplo de uniformidad correcta"}
  ]},
  {id:"apertura",title:"Apertura de cocina",summary:"Parrillas, freidoras y control del aceite",blocks:[
   {t:"p",x:"Parrillas encendidas aproximadamente a las 11:30 h. La panceta al cubata se cocina solo en horas de mañana y siempre en su parrilla específica — nunca en las parrillas principales de hamburguesas."},
   {t:"p",x:"Freidoras: encender 20 minutos antes del servicio. Mantener alrededor de 140 °C sin actividad."},
   {t:"ban",x:"NUNCA superar los 180 °C. Deteriora el aceite y la calidad del producto."},
   {t:"h",x:"Cubas según volumen"},
   {t:"split",a:{h:"LUN – JUE",x:["Solo cuba izquierda activa","Entrantes en freidora pequeña"]},b:{h:"VIE – DOM y festivos",x:["Ambas cubas operativas","Izquierda: patatas · Derecha: entrantes"]}},
   {t:"h",x:"Filtrado diario del aceite"},
   {t:"steps",x:["Apagar la freidora y dejar bajar la temperatura","Filtrar el aceite con colador adecuado","Retirar restos sólidos de la cuba","Devolver el aceite limpio a la freidora"]},
   {t:"warn",x:"El cambio de aceite requiere aviso al supervisor y medición de polaridad. Nunca por iniciativa propia."},
   {t:"media",kind:"video",label:"Filtrado de aceite paso a paso"}
  ]},
  {id:"produccion",title:"Producción y descongelación",summary:"Control de la carne antes de la parrilla",blocks:[
   {t:"p",x:"La calidad de la hamburguesa empieza mucho antes de la parrilla: estado visual del producto, almacenamiento correcto en cámara, descongelación controlada y rotación adecuada."},
   {t:"ban",x:"PROHIBIDO descongelar a temperatura ambiente, bajo agua caliente o acelerando el proceso."},
   {t:"steps",x:["Colocar la carne en recipiente adecuado","Situarla sobre rejilla de goteo dentro del recipiente","Introducir el recipiente en refrigeración"]},
   {t:"p",x:"La rejilla evita que la carne toque los líquidos que suelta. Eliminar esos líquidos 2-3 veces al día y devolver el recipiente a refrigeración."},
   {t:"warn",x:"Ante cualquier duda sobre el estado del producto: avisar INMEDIATAMENTE al responsable de cocina."},
   {t:"media",kind:"foto",label:"Recipiente con rejilla de goteo"}
  ]},
  {id:"coccion",title:"Cocción en parrilla",summary:"Puntos, sazonado, queso y seguridad",blocks:[
   {t:"warn",x:"Temperatura interior mínima obligatoria: 71 °C. Nunca servir sin alcanzarla."},
   {t:"ban",x:"TERMINANTEMENTE PROHIBIDO aplastar la hamburguesa durante el cocinado. Pierde jugos, textura y calidad."},
   {t:"h",x:"Sazonado"},
   {t:"steps",x:["Colocar la hamburguesa en zona de trabajo","Sal en ambas caras","A la parrilla inmediatamente (la sal justo antes, para no quitar humedad)"]},
   {t:"h",x:"Queso"},
   {t:"steps",x:["Cocinar la primera cara","Girar la hamburguesa","Colocar el queso inmediatamente","Tapar para fundir"]},
   {t:"h",x:"Zonas de parrilla"},
   {t:"split",a:{h:"◀ Izquierda",x:["Poco hecha"]},b:{h:"Centro / Derecha ▶",x:["Al punto · Punto+","Muy hecha"]}},
   {t:"warn",x:"Muy hecha: siempre 2 carnes de 90 g para cocción homogénea. Atención: suelen pedirla personas embarazadas — cocción completa obligatoria."},
   {t:"media",kind:"video",label:"Técnica de volteo y fundido de queso"},
   {t:"media",kind:"foto",label:"Parrilla dividida por puntos de cocción"}
  ]},
  {id:"puntas",title:"Parrilla en horas punta",summary:"Sistema de tandas y coordinación",blocks:[
   {t:"p",x:"No sobrecargar la parrilla: provoca caída de temperatura, cocción irregular y retrasos. Prioridades del parrillero: punto de cada carne, orden de salida y parrilla organizada por zonas."},
   {t:"h",x:"Tanda tipo"},
   {t:"steps",x:["Entran 6 hamburguesas en parrilla","Control del primer lado de cocción","Giro de todas en orden","Queso","Cierre de tanda y entrega a montaje"]},
   {t:"p",x:"Anticipar producción mirando la pantalla de pedidos, sin cocinar en exceso sin pedido. Comunicación constante con montaje: «Salen tres al punto en 30 segundos», «Marchando dos muy hechas»."}
  ]},
  {id:"montaje",title:"Montaje",summary:"Pan, ingredientes y coordinación con parrilla",blocks:[
   {t:"p",x:"Montaje y parrilla funcionan como un solo equipo: cuando la carne sale de parrilla, pan e ingredientes deben estar ya listos."},
   {t:"h",x:"Pan"},
   {t:"p",x:"Golpe de calor de aproximadamente 1 minuto. Resultado: caliente, ligeramente tostado. No quemarlo — da sabor amargo."},
   {t:"h",x:"Verduras y frescos"},
   {t:"list",x:["Tomate, lechuga y cebolla lavados y desinfectados","En recipientes limpios, repuestos durante el servicio","Nunca usar verdura deteriorada"]},
   {t:"media",kind:"foto",label:"Estación de montaje organizada"}
  ]},
  {id:"patatas",title:"Patatas y freidoras",summary:"Fritura, escurrido y sazonado",blocks:[
   {t:"steps",x:["Cantidad adecuada en la cesta — no sobrecargar","Cesta al aceite caliente","Respetar el tiempo de fritura establecido","Retirar y escurrir bien","Salar INMEDIATAMENTE al salir"]},
   {t:"warn",x:"En horas punta: tandas pequeñas continuas. Las patatas se sirven SIEMPRE recién hechas."}
  ]},
  {id:"pedidos",title:"Pedidos: sala, takeaway y delivery",summary:"Prioridad y verificación antes de cerrar",blocks:[
   {t:"p",x:"Los pedidos salen siempre por orden de entrada en el sistema, salvo indicación del responsable de cocina."},
   {t:"h",x:"Antes de cerrar un delivery"},
   {t:"list",x:["Todos los productos incluidos","Salsas añadidas","Packaging correctamente cerrado"]},
   {t:"warn",x:"Un error en delivery = reclamación o mala valoración. Comprobar siempre antes de cerrar."}
  ]},
  {id:"cierre",title:"Limpieza y cierre",summary:"Equipos, superficies y cámaras",blocks:[
   {t:"list",x:["Parrilla: retirar restos y limpiar superficie","Freidoras: filtrar aceite, retirar sólidos, limpiar exterior","Superficies con desinfectante, secas y sin restos","Carne y verduras bien guardadas en refrigeración","Papeleras vaciadas y zona de basura limpia","Apagar los equipos que corresponda"]},
   {t:"warn",x:"Si el aceite necesita cambio: avisar al supervisor para medición de polaridad."}
  ]},
  {id:"check-apertura",title:"Checklist de apertura",summary:"Revisión interactiva antes del servicio",blocks:[
   {t:"check",title:"Personal",x:["Llegada puntual","Uniformidad completa y limpia","Fichaje una vez uniformados","Lavado de manos"]},
   {t:"check",title:"Equipos",x:["Parrillas encendidas (~11:30)","Panceta en parrilla específica","Freidoras encendidas 20 min antes","Nivel de aceite correcto","Cubas según día de la semana"]},
   {t:"check",title:"Producto",x:["Carne descongelada en refrigeración sobre rejilla","Líquidos de descongelación revisados","Stock suficiente para el servicio","Verduras lavadas y desinfectadas","Pan disponible"]},
   {t:"media",kind:"foto",label:"Cocina lista antes del servicio"}
  ]},
  {id:"check-cierre",title:"Checklist de cierre",summary:"Revisión interactiva al terminar",blocks:[
   {t:"check",title:"Equipos",x:["Parrilla limpia y preparada","Aceite filtrado con colador","Restos sólidos retirados de cubas","Estado del aceite revisado"]},
   {t:"check",title:"Zona y producto",x:["Mesas y zona de montaje limpias","Utensilios limpios","Carne guardada en refrigeración","Verduras tapadas"]},
   {t:"check",title:"Final",x:["Papeleras vaciadas","Zona de basura limpia","Equipos apagados si corresponde"]}
  ]},
  {id:"errores",title:"Errores comunes",summary:"Los cinco fallos que más se repiten",blocks:[
   {t:"grid",x:[
    {e:"Aplastar la hamburguesa",c:"Pérdida de jugos y textura",s:"Nunca presionar la carne"},
    {e:"Sobrecargar la parrilla",c:"Cocción irregular, retrasos",s:"Trabajar por tandas"},
    {e:"Quemar el pan",c:"Sabor amargo",s:"Máximo ~1 minuto de calor"},
    {e:"Freidoras sobrecargadas",c:"Patatas blandas",s:"Respetar capacidad de cesta"},
    {e:"Montaje desorganizado",c:"Retrasos y caos",s:"Todo preparado ANTES del servicio"}
   ]}
  ]}
 ]},
 {group:"sup_cocina",groupLabel:"Supervisión de cocina",draft:false,items:[
  {id:"sup-aceite",title:"Autorización de cambio de aceite",summary:"Medición de polaridad y criterio",blocks:[
   {t:"p",x:"El aceite no se cambia nunca por iniciativa del personal. Al recibir el aviso del equipo:"},
   {t:"steps",x:["Realizar medición de polaridad con el dispositivo correspondiente","Si supera los niveles recomendados: autorizar el cambio","Si no los supera: mantener aceite y reforzar el filtrado diario"]}
  ]},
  {id:"sup-calidad",title:"Control de calidad e incidencias",summary:"Producto, estándares y coordinación con sala",blocks:[
   {t:"p",x:"Resolver de inmediato cualquier duda del equipo sobre el estado del producto. Verificar que cada hamburguesa cumple los estándares: carne al punto solicitado y ≥71 °C, queso fundido tras el giro, pan tostado sin quemar, verduras frescas y presentación con estructura."},
   {t:"p",x:"Mantener comunicación fluida con sala cuando se acumulen pedidos, haya esperas elevadas o se produzca una incidencia en cocina."}
  ]}
 ]},
 {group:"sala",groupLabel:"Sala",draft:false,items:[
  {id:"sala-filosofia",title:"Filosofía y presencia",summary:"Puntualidad, imagen y conocimiento de carta",blocks:[
   {t:"p",x:"La sala es donde el cliente vive la experiencia de marca. Amabilidad, rapidez y conocimiento del producto son los tres pilares. Un buen producto puede arruinarse con un mal servicio — y un error de cocina puede salvarse con una buena gestión en sala."},
   {t:"warn",x:"La hora de entrada = hora de estar LISTO en sala, uniformado y preparado para recibir clientes."},
   {t:"h",x:"Uniformidad e imagen"},
   {t:"list",x:["Camiseta o uniforme oficial y delantal limpio","Calzado cómodo y antideslizante","Aspecto limpio, sin exceso de accesorios","Actitud positiva y energía desde el primer momento"]},
   {t:"h",x:"Conocimiento del producto"},
   {t:"p",x:"Conocer la carta en profundidad: ingredientes de cada plato, alérgenos, personalizaciones, bebidas, postres y promociones vigentes."},
   {t:"warn",x:"Un camarero que no conoce la carta transmite inseguridad al cliente. Estudiar la carta es parte del trabajo."}
  ]},
  {id:"sala-journey",title:"Atención al cliente",summary:"De la bienvenida a la despedida",blocks:[
   {t:"p",x:"Con reserva: acompañar a su mesa. Sin reserva: buscar mesa o informar de la hora más cercana disponible y ofrecer reservar en el momento. Siempre: explicar el funcionamiento y cómo acceder a la carta, dejando claro que estáis disponibles."},
   {t:"warn",x:"El cliente debe sentirse visto desde el primer segundo. Ignorar a alguien que acaba de entrar es el primer error del servicio."},
   {t:"h",x:"Secuencia de servicio"},
   {t:"steps",x:["Tomar primero las bebidas, dando tiempo a elegir la comida","Servir bebidas y tomar el resto del pedido","Principal: preguntar el punto de cocción y recordar que la salsa de patatas está incluida","Ofrecer 2-3 entrantes (guacamole, tequeños, croquetas...)","Doble check tras servir: ¿está todo a su gusto?","Al recoger: ofrecer postres o cafés — si están llenos, existen los minipostres"]},
   {t:"h",x:"Cobro y despedida"},
   {t:"p",x:"Presentar la cuenta solo cuando la pidan, confirmar el importe, contar el cambio delante del cliente y entregar siempre el ticket. Pagos: Visa, Mastercard, American Express, Sodexo y efectivo."},
   {t:"warn",x:"La despedida es tan importante como la bienvenida: misma educación y énfasis que al recibir."},
   {t:"media",kind:"foto",label:"Bienvenida y acomodo en mesa"}
  ]},
  {id:"sala-quejas",title:"Gestión de quejas",summary:"Voltear la situación con amabilidad",blocks:[
   {t:"steps",x:["Evaluar la queja preguntando para entender bien lo sucedido","Contrastar la información con cocina y el camarero asignado","Actuar según el caso: punto incorrecto → cocinar de nuevo · objeto ajeno al plato → disculpas, rehacer y prevenir · tiempo de reserva insuficiente por culpa nuestra → reubicar o retrasar la siguiente","Si no podéis resolverlo, contactar con el supervisor"]},
   {t:"ban",x:"NUNCA discutir con el cliente ante una queja: escalada asegurada y mala valoración."},
   {t:"warn",x:"El objetivo siempre es reducir al máximo la frustración del cliente, hablando con amabilidad y educación."}
  ]},
  {id:"sala-tpv",title:"Pedidos y TPV (Revo)",summary:"Introducción, modificaciones y alérgenos",blocks:[
   {t:"steps",x:["Introducir el pedido inmediatamente después de tomarlo","Verificar que modificaciones y alergias están reflejadas","Confirmar el número de mesa","Revisar el pedido en pantalla antes de confirmarlo"]},
   {t:"warn",x:"Un pedido mal introducido genera retrasos, confusión en cocina y mala experiencia para el cliente."},
   {t:"h",x:"Modificaciones y alérgenos"},
   {t:"list",x:["Toda modificación va al sistema — nunca solo de palabra","Si el sistema no la permite: avisar directamente a cocina y al responsable","Los alérgenos quedan siempre registrados por escrito","Ninguna anulación ni descuento sin autorización del responsable"]},
   {t:"warn",x:"Ante cualquier discrepancia en el cobro, avisar al responsable. No resolver errores de caja por cuenta propia."},
   {t:"media",kind:"video",label:"Introducir un pedido con modificación y alérgeno en Revo"}
  ]},
  {id:"sala-cocina",title:"Coordinación con cocina",summary:"Un mismo equipo, comunicación fluida",blocks:[
   {t:"p",x:"El sistema de pedidos es el canal principal. Para urgencias o cambios de última hora, comunicación directa con el responsable de cocina, evitando interrupciones en los picos de servicio."},
   {t:"h",x:"Sala transmite a cocina"},
   {t:"list",x:["Comensales por mesa y posibles alergias","Modificaciones en pedidos ya enviados","Peticiones especiales de última hora","Aviso cuando una mesa va a pedir postre o segundo"]},
   {t:"h",x:"Sala recibe de cocina"},
   {t:"list",x:["Productos agotados o no disponibles","Tiempos estimados cuando el servicio está cargado","Aviso de salida de pedidos para recogerlos al momento"]},
   {t:"warn",x:"Los platos no salen de cocina si el camarero no está listo para llevarlos. Un plato esperando en barra se enfría y pierde calidad."},
   {t:"p",x:"Coordinar que todos los platos de una mesa salgan a la vez, y consultar el estado a cocina antes de que el cliente pregunte por una espera larga."}
  ]},
  {id:"sala-delivery",title:"Delivery y takeaway",summary:"El cliente no está delante: revisar todo",blocks:[
   {t:"p",x:"Revisar las plataformas activas al inicio de cada turno y gestionar los pedidos por orden de llegada, igual que en sala."},
   {t:"warn",x:"Pausar las plataformas cuando el volumen no permita mantener los tiempos. Mejor pausar que acumular retrasos y malas valoraciones."},
   {t:"h",x:"Antes de cerrar un pedido"},
   {t:"steps",x:["Todos los productos incluidos","Salsas y complementos añadidos","Packaging correctamente cerrado y sellado","En caso de duda, revisar dirección o nombre del cliente"]},
   {t:"ban",x:"Un error en delivery no se puede corregir una vez sale el repartidor. Revisar SIEMPRE antes de cerrar."},
   {t:"p",x:"Takeaway: saludar con la misma atención que en sala, confirmar el nombre del pedido, informar de retrasos y entregar completo y cerrado. Reclamaciones: escuchar y disculparse, registrar el error, avisar al responsable y aplicar el protocolo de compensación."}
  ]},
  {id:"sala-reservas",title:"Reservas — TheFork Manager",summary:"Mapa de sala, no-shows y esperas",blocks:[
   {t:"p",x:"TheFork Manager (pestaña superior del navegador) permite ver, crear y modificar reservas y gestionar el mapa de sala en tiempo real. El mapa se observa continuamente: sois vosotros quienes ubicáis a los clientes en la mesa que más convenga al restaurante, no al revés."},
   {t:"h",x:"No-shows y retrasos"},
   {t:"steps",x:["Si la reserva no llega: 15 minutos de cortesía y llamar al cliente","Si no contestan: cancelar, liberar la mesa y marcar como no-show (rojo)","Si contestan: informar con educación del tiempo disponible hasta el final de su reserva"]},
   {t:"h",x:"Crear y cancelar"},
   {t:"p",x:"Crear: seleccionar mesa(s) y pedir hora, comensales, nombre y apellidos, teléfono y email. Cancelar solo si lo pide el cliente, está duplicada por error confirmado o lo pide Dirección — siempre indicando el motivo."},
   {t:"h",x:"Walk-ins y esperas"},
   {t:"p",x:"En walk-in, priorizar mesas con reserva que empiece cuando terminaría el walk-in (1 h 30 desde su llegada) y las visibles desde la calle. Sin mesa: informar del tiempo estimado con honestidad (mejor pasarse que quedarse corto), ofrecer barra o zona de espera, actualizar si se alarga y acompañar en cuanto haya mesa."},
   {t:"p",x:"Duración estándar de la reserva: 1 h 30 (1 h 15 en Malasaña). Avisar al cliente cuando se acerque el final para que pida postre o café sin agobios. Si el retraso fue del restaurante, reubicar o retrasar la siguiente reserva."},
   {t:"warn",x:"Si TheFork se congela o va lento: foto a las reservas para no perder la información y avisar al supervisor. Suele volver solo a la normalidad."},
   {t:"media",kind:"foto",label:"Mapa de sala en TheFork Manager"}
  ]},
  {id:"sala-limpieza",title:"Limpieza continua de sala",summary:"No es tarea de cierre: es todo el servicio",blocks:[
   {t:"list",x:["Limpiar y reponer cada mesa en cuanto el cliente la abandone","Barra y zonas de paso despejadas y limpias","Retirar vasos, platos y utensilios sucios de forma continua","Baños cada hora: papel, jabón, ambientador y papelera con bolsa","Suelos y manchas: en el momento, no solo al cierre","Reponer servilletas, salsas y complementos durante el servicio","Retirar cartas deterioradas y avisar si el stock de vajilla va bajo"]},
   {t:"warn",x:"Una mesa sucia visible para otros clientes transmite dejadez. La limpieza entre clientes es tan importante como el propio servicio."}
  ]},
  {id:"sala-fc",title:"Juanchonistas FC",summary:"Fidelización: preguntar en cada mesa",blocks:[
   {t:"p",x:"Programa de fidelización por cashback. Registro en juanchosbbq.com/juanchonistas. Cada pedido de 20 € o más suma un GOL (los pedidos de Uber Eats no suman). Por registrarse: bebida gratis, regalo de cumpleaños y promociones exclusivas."},
   {t:"split",a:{h:"Niveles",x:["Canterano (hasta 6 goles): 2%","Titular (7-12 goles): 4%","Pichichi (13+ goles): 6%"]},b:{h:"Vuestra obligación",x:["Preguntar en cada mesa si son del FC","Si no: explicar beneficios y registro","Si sí: dar el gol y canjear su cashback"]}},
   {t:"warn",x:"Es obligación del equipo de sala preguntar SIEMPRE al cliente si es del Juanchonistas FC, en cada visita."},
   {t:"h",x:"Cobro con cashback en Revo"},
   {t:"steps",x:["En formas de pago, seleccionar 'Cheerfy Cashback'","Pulsar 'Allow' (si aparece un error, cerrarlo con la X)","Escanear el QR de la tarjeta con la trasera de la tablet, o pedir el teléfono de registro","Salvo que indique una cantidad concreta, asumir que gasta todo lo acumulado"]},
   {t:"h",x:"Incidencias frecuentes"},
   {t:"list",x:["No tiene la tarjeta: se descarga desde el correo de registro (Wallet en iPhone, favorito en Android o web)","El teléfono no aparece: se registró con otro o nunca — ofrecerle registrarse","Goles o cashback que no cuadran (u otras incidencias): el cliente escribe a juancho@equipojuanchos.com y se avisa al supervisor con los detalles"]},
   {t:"media",kind:"video",label:"Cobro con Cheerfy Cashback en Revo paso a paso"}
  ]},
  {id:"sala-estandares",title:"Estándares de sala",summary:"Lo que debe cumplir cada servicio",blocks:[
   {t:"list",x:["Bienvenida: saludo en menos de 30 segundos, acompañamiento, carta entregada y bebida ofrecida","Pedido: alérgenos preguntados, punto confirmado, pedido repetido antes de introducir","Servicio: atención sin invadir, vasos repuestos antes de vaciarse, platos retirados con agilidad","Entrega: todos los platos de la mesa a la vez, correctos y a temperatura","Cierre: cuenta sin demora, despedida amable, mesa lista en menos de 5 minutos","Delivery: revisado, packaging sellado y tiempos respetados"]}
  ]},
  {id:"sala-check-cierre",title:"Checklist de cierre",summary:"Revisión interactiva al terminar",blocks:[
   {t:"check",title:"Cierre del servicio",x:["Todas las mesas cerradas y cobradas","Arqueo realizado y comunicado al supervisor","Incidencias del turno comunicadas"]},
   {t:"check",title:"Limpieza",x:["Mesas y sillas limpias y ordenadas","Suelos barridos y fregados","Barra y superficies limpias","Baños limpios y con material repuesto"]},
   {t:"check",title:"Sistemas y final",x:["Plataformas de delivery pausadas o cerradas","TPV apagado correctamente","Sin pedidos pendientes","Servilletas, salsas y cartas repuestas","Puertas y ventanas cerradas","Luces y equipos apagados si corresponde"]}
  ]},
  {id:"sala-errores",title:"Errores comunes",summary:"Los siete fallos que más se repiten",blocks:[
   {t:"grid",x:[
    {e:"No saludar al entrar",c:"El cliente se siente ignorado desde el inicio",s:"Contacto visual y saludo inmediato"},
    {e:"Pedido mal introducido en TPV",c:"Error en cocina, retraso, cliente insatisfecho",s:"Revisar siempre antes de confirmar"},
    {e:"No informar de esperas",c:"Cliente frustrado sin información",s:"Comunicar tiempos reales antes de que pregunte"},
    {e:"Platos esperando en barra",c:"Comida fría, mala calidad",s:"Estar pendiente y recoger al momento"},
    {e:"Delivery cerrado sin revisar",c:"Error sin posibilidad de corrección",s:"Revisar siempre antes de cerrar"},
    {e:"Mesa sucia visible",c:"Imagen descuidada del local",s:"Limpiar en cuanto se marche el cliente"},
    {e:"Discutir ante una queja",c:"Escalada y mala valoración",s:"Escuchar, disculparse y buscar solución"}
   ]}
  ]}
 ]},
 {group:"sup_sala",groupLabel:"Encargado de turno",draft:false,items:[
  {id:"enc-apertura",title:"Apertura de sala",summary:"Reservas, caja, plataformas y puesta a punto",blocks:[
   {t:"warn",x:"La apertura de sala es responsabilidad del encargado de turno. El checklist de apertura es obligatorio, completado y firmado — si no lo está al inicio del turno, el encargado será avisado."},
   {t:"h",x:"TheFork: confirmación de reservas (primera tarea)"},
   {t:"list",x:["Llamar con mínimo 1 h de antelación, siempre desde el teléfono del local","Rosa y amarillo: llamar a todas sin excepción · Naranja: solo grupos de 6+ o indicación especial","Confirmar nombre, hora, personas y peticiones; anotar todo en comentarios (alergias, sillas de bebé...)","Revisar anotaciones de Dirección y etiquetas del cliente (VIP, Periodista, Familiar...)","Si no contestan: comentario de 'no contesta' — una reserva no confirmada NO es una cancelada","Al editar, desmarcar 'enviar email al cliente' (es solo informativo interno)","Organizar combinaciones de mesas por horas para maximizar la capacidad"]},
   {t:"h",x:"Apertura de caja"},
   {t:"steps",x:["Contar el efectivo total incluido el fondo: debe ser 200 € más los sobres de días anteriores","Cualquier varianza respecto al cierre anterior: reportar al supervisor ANTES de abrir","En Revo: R (arriba a la izquierda) → Control de caja → Abrir turno → introducir la cantidad contada"]},
   {t:"warn",x:"Desde la apertura de turno, la caja es responsabilidad del encargado que la ha abierto."},
   {t:"media",kind:"foto",label:"Pantalla de Revo en 'Abrir turno'"},
   {t:"h",x:"Plataformas y puesta a punto"},
   {t:"list",x:["Abrir Uber y Cheerfy, confirmar stock con cocina y revisar promociones activas","Barra organizada: solo lo necesario visible, cristalería y cafetera limpias","Cámaras: caducidades revisadas y stock de refrescos y cerveza suficiente","Limpieza de fuera a dentro: cubos recogidos, cristales, suelo, mesas, espejos y lámparas","Mesas montadas con cubertería y QRs en buen estado","Música: playlist de Juancho's en Spotify (especiales en Navidad, San Valentín, San Isidro...) a volumen que permita conversar","Iluminación de leds y lámparas; exterior obligatoria de noche","Briefing de equipo: reservas, sin-stocks, zonas asignadas y revisión de uniformidad"]},
   {t:"media",kind:"foto",label:"Setup de mesa correcto (cubertería, QR, servilletas)"}
  ]},
  {id:"enc-check-apertura",title:"Checklist de apertura (obligatorio)",summary:"Completar y firmar antes de abrir",blocks:[
   {t:"check",title:"Apertura del encargado",x:["TheFork: llamadas hechas, comentarios y etiquetas revisados, mesas combinadas","Caja: cierre anterior revisado, fondo contado, turno abierto en Revo","Uber / Cheerfy abiertas, stock confirmado con cocina, promos revisadas","Barra organizada, cubertería, cristalería y cafetera limpias","Caducidades revisadas: ningún producto fuera de fecha","Stock de refrescos y cerveza suficiente para el turno","Limpieza: cristales, suelo, mesas, espejos y lámparas","Mesas montadas, QRs en buen estado, servilletas y salsas repuestas","Baños: papel, jabón, ambientador, papelera de pedal con bolsa","Playlist de Juancho's activa a volumen adecuado","Iluminación interior operativa y exterior preparada","Uniformidad completa y limpia de todo el equipo","Incidencias estructurales, de electrodomésticos o sistemas revisadas"]}
  ]},
  {id:"enc-cierre-caja",title:"Cierre de caja",summary:"Arqueo, Reporte Z y sobres",blocks:[
   {t:"p",x:"Realizarlo solo con TODAS las mesas cerradas y TODOS los pedidos de delivery (Uber y Cheerfy) gestionados."},
   {t:"steps",x:["Contar el efectivo total: la base se queda en 200 € — el resto va a un sobre con fecha, cantidad y local escritos en el frontal, grapado solo por el lateral superior","Cerrar sesión de los datáfonos: se imprime el cierre automáticamente — revisar el total de la remesa","Imprimir el Reporte Z: R → Control de caja → Reporte Z → icono impresora","Cotejar: las diferencias de efectivo y tarjeta deben ser 0 — si no, reportar al supervisor antes de cerrar","Cierre de turno en Revo: R → Control de caja → Cierre de turno → introducir las cantidades cotejadas manualmente → Tick","Grapar el cierre de caja con los de datáfono, guardar en el cajón, foto y enviar al grupo de cierres de caja"]},
   {t:"ban",x:"Las cantidades introducidas son SIEMPRE las contabilizadas manualmente por el encargado. NUNCA las que dé el sistema."},
   {t:"media",kind:"foto",label:"Sobre de efectivo cumplimentado correctamente"},
   {t:"h",x:"Entradas y salidas de caja"},
   {t:"p",x:"Cualquier movimiento (compras de aceite, compras autorizadas por dirección...): R → Control de caja → Entradas/Salidas → tipo, motivo y cantidad. En las salidas, adjuntar siempre la factura del establecimiento."}
  ]}
 ]},
  {group:"burgers",groupLabel:"Montaje de hamburguesas",menu:true,summary:"Listado completo: ingredientes y alérgenos de las 12 hamburguesas",draft:false,items:[
  {id:"burger-bacon-juancheeseburger",title:"La Bacon Juancheeseburger",summary:"Ingredientes y alérgenos",blocks:[
   {t:"media",kind:"foto",label:"Vista explosionada de La Bacon Juancheeseburger con sus capas",img:"assets/burgers/bacon-juancheeseburger.jpg"},
   {t:"h",x:"Ingredientes"},
   {t:"list",x:["Carne de vaca","Cheddar fundido","Panceta ibérica macerada al cubata","Salsa barbacoa (en el pan)"]},
   {t:"h",x:"Alérgenos"},
   {t:"split",a:{h:"Contiene",x:["Gluten, huevos, pescado, soja, lácteos, mostaza, sulfitos"]},b:{h:"Puede contener trazas",x:["Frutos secos, sésamo"]}},
   {t:"p",x:"Con pan sin gluten cambian los alérgenos: consultar la tabla oficial."}
  ]},
  {id:"burger-piccolo",title:"La Piccolo",summary:"Ingredientes y alérgenos",blocks:[
   {t:"media",kind:"foto",label:"Vista explosionada de La Piccolo con sus capas",img:"assets/burgers/piccolo.jpg"},
   {t:"h",x:"Ingredientes"},
   {t:"list",x:["Carne de vaca","Tomate","Cebolla dulce","Lechuga","Cheddar fundido","Salsa Smoked Mayo (en el pan)"]},
   {t:"h",x:"Alérgenos"},
   {t:"split",a:{h:"Contiene",x:["Gluten, huevos, soja, lácteos, mostaza, sulfitos"]},b:{h:"Puede contener trazas",x:["Crustáceos, pescado, sésamo, moluscos"]}},
   {t:"p",x:"Con pan sin gluten cambian los alérgenos: consultar la tabla oficial."}
  ]},
  {id:"burger-vegeta",title:"La Vegeta",summary:"Ingredientes y alérgenos",blocks:[
   {t:"warn",x:"Opción ovolacteovegetariana."},
   {t:"media",kind:"foto",label:"Vista explosionada de La Vegeta con sus capas",img:"assets/burgers/vegeta.jpg"},
   {t:"h",x:"Ingredientes"},
   {t:"list",x:["Patty vegetal Heura","Tomate fresco","Cebolla dulce","Lechuga","Cheddar fundido","Salsa Smoked Mayo (en el pan)"]},
   {t:"h",x:"Alérgenos"},
   {t:"split",a:{h:"Contiene",x:["Gluten, huevos, soja, lácteos, sulfitos"]},b:{h:"Puede contener trazas",x:["Crustáceos, pescado, mostaza, sésamo, moluscos"]}},
   {t:"p",x:"Con pan sin gluten cambian los alérgenos: consultar la tabla oficial."}
  ]},
  {id:"burger-juanita",title:"La Juanita",summary:"Ingredientes y alérgenos",blocks:[
   {t:"media",kind:"foto",label:"Vista explosionada de La Juanita con sus capas",img:"assets/burgers/juanita.jpg"},
   {t:"h",x:"Ingredientes"},
   {t:"list",x:["Carne de vaca","Cheddar","Pico de gallo con habanero","Aguacate","Salsa Juanchopotle"]},
   {t:"h",x:"Alérgenos"},
   {t:"split",a:{h:"Contiene",x:["Gluten, huevos, lácteos"]},b:{h:"Puede contener trazas",x:["Soja, mostaza, sésamo"]}},
   {t:"p",x:"Con pan sin gluten cambian los alérgenos: consultar la tabla oficial."}
  ]},
  {id:"burger-carbonara",title:"La Carbonara",summary:"Ingredientes y alérgenos",blocks:[
   {t:"warn",x:"Edición limitada en colaboración con Negrini."},
   {t:"media",kind:"foto",label:"Vista explosionada de La Carbonara con sus capas",img:"assets/burgers/carbonara.jpg"},
   {t:"h",x:"Ingredientes"},
   {t:"list",x:["Carne de vaca","Salsa de yemas curadas, pecorino romano y pimienta","Guanciale de cerdo italiano","Parmesano rallado (corona)"]},
   {t:"h",x:"Alérgenos"},
   {t:"split",a:{h:"Contiene",x:["Gluten, huevos, lácteos"]},b:{h:"Puede contener trazas",x:["—"]}},
   {t:"p",x:"Con pan sin gluten cambian los alérgenos: consultar la tabla oficial."}
  ]},
  {id:"burger-trufada",title:"La Trufada",summary:"Ingredientes y alérgenos",blocks:[
   {t:"media",kind:"foto",label:"Vista explosionada de La Trufada con sus capas",img:"assets/burgers/trufada.jpg"},
   {t:"h",x:"Ingredientes"},
   {t:"list",x:["Carne de vaca","Queso raclette","Salsa de brandy con trufa","Trufa recién rallada (corona)"]},
   {t:"h",x:"Alérgenos"},
   {t:"split",a:{h:"Contiene",x:["Gluten, huevos, lácteos, sulfitos"]},b:{h:"Puede contener trazas",x:["Soja, mostaza, sésamo"]}},
   {t:"p",x:"Con pan sin gluten cambian los alérgenos: consultar la tabla oficial."}
  ]},
  {id:"burger-federer",title:"La Federer",summary:"Ingredientes y alérgenos",blocks:[
   {t:"warn",x:"NO apta para celíacos: el guiso lleva harina de trigo, no existe versión sin gluten."},
   {t:"media",kind:"foto",label:"Vista explosionada de La Federer con sus capas",img:"assets/burgers/federer.jpg"},
   {t:"h",x:"Ingredientes"},
   {t:"list",x:["Carne de vaca","Queso raclette","Guiso de champiñón y cebolla al oloroso"]},
   {t:"h",x:"Alérgenos"},
   {t:"split",a:{h:"Contiene",x:["Gluten, huevos, lácteos, sulfitos"]},b:{h:"Puede contener trazas",x:["Soja, mostaza, sésamo"]}},
   {t:"p",x:"Con pan sin gluten cambian los alérgenos: consultar la tabla oficial."}
  ]},
  {id:"burger-blt",title:"La BLT",summary:"Ingredientes y alérgenos",blocks:[
   {t:"warn",x:"Opción sin gluten: pan sin gluten y SIN salsa en el pan."},
   {t:"media",kind:"foto",label:"Vista explosionada de La BLT con sus capas",img:"assets/burgers/blt.jpg"},
   {t:"h",x:"Ingredientes"},
   {t:"list",x:["Burger de pollo a la parrilla","Panceta ibérica al cubata","Cheddar fundido","Lechuga","Tomate","Cebolla fresca","Salsa Smoked Mayo"]},
   {t:"h",x:"Alérgenos"},
   {t:"split",a:{h:"Contiene",x:["Gluten, huevos, soja, lácteos, mostaza, sésamo, sulfitos"]},b:{h:"Puede contener trazas",x:["Crustáceos, pescado, frutos secos, apio, moluscos"]}},
   {t:"p",x:"Con pan sin gluten cambian los alérgenos: consultar la tabla oficial."}
  ]},
  {id:"burger-caprichosa",title:"La Caprichosa",summary:"Ingredientes y alérgenos",blocks:[
   {t:"warn",x:"Edición limitada."},
   {t:"media",kind:"foto",label:"Vista explosionada de La Caprichosa con sus capas",img:"assets/burgers/caprichosa.jpg"},
   {t:"h",x:"Ingredientes"},
   {t:"list",x:["Cortes seleccionados de buey de El Capricho","Havarti fundente","Cecina de Wagyu A5 japonés"]},
   {t:"h",x:"Alérgenos"},
   {t:"split",a:{h:"Contiene",x:["Gluten, huevos, lácteos"]},b:{h:"Puede contener trazas",x:["—"]}},
   {t:"p",x:"Con pan sin gluten cambian los alérgenos: consultar la tabla oficial."}
  ]},
  {id:"burger-junior",title:"La Junior",summary:"Ingredientes y alérgenos",blocks:[
   {t:"warn",x:"Versión sencilla y pequeña de nuestras burgers (Juancho's for Kids)."},
   {t:"media",kind:"foto",label:"Vista explosionada de La Junior con sus capas",img:"assets/burgers/junior.jpg"},
   {t:"h",x:"Ingredientes"},
   {t:"list",x:["Carne de vaca","Cheddar fundido","Un poco de kétchup"]},
   {t:"h",x:"Alérgenos"},
   {t:"split",a:{h:"Contiene",x:["Gluten, huevos, lácteos, apio"]},b:{h:"Puede contener trazas",x:["Soja, mostaza, sésamo"]}},
   {t:"p",x:"Con pan sin gluten cambian los alérgenos: consultar la tabla oficial."}
  ]},
  {id:"burger-bacon-juniorburger",title:"La Bacon Juniorburger",summary:"Ingredientes y alérgenos",blocks:[
   {t:"warn",x:"Es la Bacon Juancheeseburger con 90 g de carne. Alérgenos heredados de la Bacon Juancheeseburger: no figura en la tabla oficial, validar."},
   {t:"media",kind:"foto",label:"Vista explosionada de La Bacon Juniorburger con sus capas",img:"assets/burgers/bacon-juniorburger.jpg"},
   {t:"h",x:"Ingredientes"},
   {t:"list",x:["Carne de vaca (90 g)","Cheddar","Salsa barbacoa (en el pan)","Panceta ibérica macerada al cubata"]},
   {t:"h",x:"Alérgenos"},
   {t:"split",a:{h:"Contiene",x:["Gluten, huevos, pescado, soja, lácteos, mostaza, sulfitos"]},b:{h:"Puede contener trazas",x:["Frutos secos, sésamo"]}},
   {t:"p",x:"Con pan sin gluten cambian los alérgenos: consultar la tabla oficial."}
  ]},
  
  {id:"burger-margarita-pagana",title:"La Margarita Pagana",summary:"Ingredientes y alérgenos",blocks:[
   {t:"warn",x:"No figura en la tabla oficial de alérgenos: pendiente de validar."},
   {t:"media",kind:"foto",label:"Vista explosionada de La Margarita Pagana con sus capas",img:"assets/burgers/margarita-pagana.jpg"},
   {t:"h",x:"Montaje (de abajo arriba)"},
   {t:"steps",x:["Pan inferior","Tomate en rodaja","Carne de vaca (180 g)","Mozzarella fiordilatte fundida sobre la carne","Confitura de tomate","Gremolata","Salsa de tomate en 2 círculos","Pan superior"]},
   {t:"h",x:"Ingredientes"},
   {t:"list",x:["Carne de vaca (180 g)","Mozzarella fiordilatte","Confitura de tomate","Gremolata","Salsa de tomate","Tomate en rodaja"]},
   {t:"h",x:"Alérgenos"},
   {t:"p",x:"Pendiente de incorporar a la tabla oficial de alérgenos."}
  ]}
 ]},
 {group:"oficina",groupLabel:"Oficina",draft:true,items:[
  {id:"oficina-wip",title:"Procedimientos de oficina",summary:"En preparación",blocks:[
   {t:"p",x:"Esta sección se incorporará en una fase posterior."}
  ]}
 ]}
];

module.exports={PROFILES,QUICK_COCINA,QUICK_SALA,DATA};
