export const API_BASE = "http://localhost:8080/api/v1";

export const CATEGORIA = {
    "Pizzas": 1, "Empanadas": 2, "Hamburguesas": 3, "Milanesas": 4, "Lomitos": 5,
    "Comida Casera": 6, "Menú del Día": 7, "Parrillas y Asados": 8, "Pastas": 9,
    "Comidas Mexicanas": 10, "Comidas Asiáticas": 11, "Sushi": 12, "Pescados y Mariscos": 13,
    "Panadería": 14, "Pastelería": 15, "Helados": 16, "Ensaladas y Bowls": 17,
    "Bebidas c/ Alcohol": 18, "Bebidas s/ Alcohol": 19, "Café e Infusiones": 20,
    "Para Picar": 21, "Otros": 22
};

export const TAG = {
    "Vegano": 1, "Vegetariano": 2, "Sin TACC": 3, "Sin Lactosa": 4, "Apto Diabéticos": 5,
    "Sin Azúcar": 6, "Picante": 7, "Dulce": 8, "Salado": 9, "Para Compartir": 10,
    "Al Horno": 11, "A la Parrilla": 12, "Frito": 13, "Al Vapor": 14, "Combos": 15,
    "Light": 16, "Desayuno/Merienda": 17
};

export function tagIds(nombres) {
    return nombres.map((n) => {
        const id = TAG[n];
        if (!id) throw new Error(`Tag desconocido: ${n}`);
        return id;
    });
}

export function catId(nombre) {
    const id = CATEGORIA[nombre];
    if (!id) throw new Error(`Categoría desconocida: ${nombre}`);
    return id;
}

function calcularDigitoVerificadorCuit(base10) {
    const mult = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
    let suma = 0;
    for (let i = 0; i < 10; i++) suma += Number(base10[i]) * mult[i];
    let dv = 11 - (suma % 11);
    if (dv === 11) dv = 0;
    if (dv === 10) throw new Error(`Base CUIT sin dígito verificador válido: ${base10}`);
    return String(dv);
}

function cuit(base10) {
    return base10 + calcularDigitoVerificadorCuit(base10);
}

const LOCALIDAD_RIO_GRANDE = "94008010";

function direccion(calle, numero, localidadId = LOCALIDAD_RIO_GRANDE) {
    return { calle, numero: String(numero), pisoDepto: "", codigoPostal: "9420", localidadId, principal: true };
}

function horario(diaSemana, horaApertura, horaCierre) {
    return { diaSemana, horaApertura, horaCierre };
}

const DIAS_TODOS = ["LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO", "DOMINGO"];
const DIAS_MAR_DOM = ["MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO", "DOMINGO"];
const DIAS_MIE_LUN = ["MIERCOLES", "JUEVES", "VIERNES", "SABADO", "DOMINGO", "LUNES"];
const DIAS_LUN_JUE = ["LUNES", "MARTES", "MIERCOLES", "JUEVES"];

function horariosDiarios(dias, apertura, cierre) {
    return dias.map((d) => horario(d, apertura, cierre));
}

// NOTA: RegistroService rechaza horaCierre <= horaApertura (no hay soporte de franja que cruce
// medianoche en una sola fila, mismo criterio ya aplicado en la Fase 1). Todo horario de cierre
// real posterior a las 00:00 se capea a "23:59:00" — documentado también en el resumen final.
const CIERRE_MEDIANOCHE = "23:59:00";

export const COMERCIOS = [
    {
        key: "elcuyano",
        nombre: "El Cuyano",
        tipoComercio: "ROTISERIA",
        email: "elcuyano@bajonea.com",
        password: "Bajonea2026!",
        telefonoComercio: "+5492964200811",
        direccion: direccion("Tte. Bernhardt", 516),
        horarios: horariosDiarios(DIAS_MAR_DOM, "10:00:00", CIERRE_MEDIANOCHE),
        instagram: "https://www.instagram.com/elcuyanorotiseria/",
        descripcion: "Rotisería con pizzas, hamburguesas, lomitos, sandwiches de milanesa y empanadas caseras. Comida rica y abundante.",
        fotoPerfil: "elcuyano-foto.jpg",
        personaJuridica: {
            razonSocial: "El Cuyano Rotiseria",
            cuit: cuit("3071111800"),
            condicionIva: "MONOTRIBUTO",
            tipoSociedad: "EU",
            fechaInicioActividades: "2016-03-01"
        },
        representante: {
            nombre: "Ruben", apellido: "Molina", dni: "24555811",
            telefono: "+5492964111811", fechaNacimiento: "1975-04-18"
        },
        productos: [
            ["Pizza Muzzarella", "Salsa de tomate, mozzarella, orégano y aceitunas. Tamaño grande.", 20500, "Pizzas", ["Al Horno", "Vegetariano"], "elcuyano-pizzamuzzarella.jpg"],
            ["Pizza Especial", "Salsa de tomate, mozzarella, jamón y morrón. Tamaño grande.", 21500, "Pizzas", ["Al Horno"], "elcuyano-pizzaespecial.jpg"],
            ["Pizza 4 Quesos", "Salsa de tomate, mozzarella, roquefort, parmesano y provolone.", 27000, "Pizzas", ["Al Horno", "Vegetariano"], "elcuyano-pizza4quesos.jpg"],
            ["Pizza Americana Fueguina", "Salsa de tomate, mozzarella, cebolla caramelizada, panceta, huevo frito y calabresa.", 28500, "Pizzas", ["Al Horno"], "elcuyano-pizzaamericanafueguina.jpg"],
            ["Empanada de Carne Unidad", "Empanada casera de carne cortada a cuchillo.", 3000, "Empanadas", ["Salado"], "elcuyano-empanadadecarne.jpg"],
            ["Empanadas de Carne Docena", "Docena de empanadas de carne.", 32000, "Empanadas", ["Salado", "Para Compartir"], "elcuyano-empanadasdecarne.jpg"],
            ["Empanada Árabe Unidad", "Empanada árabe de carne especiada.", 3000, "Empanadas", ["Salado", "Picante"], "elcuyano-empanadaarabe.jpg"],
            ["Salchipapas", "Papas fritas con salchichas.", 12000, "Para Picar", ["Frito"], "elcuyano-salchipapas.jpg"],
            ["Papas Fritas con Cheddar Panceta y Verdeo", "Papas fritas cubiertas de cheddar, panceta crocante y verdeo.", 13000, "Para Picar", ["Frito"], "elcuyano-papasfritasconcheddarpancetayverdeo.jpg"],
            ["Burger Completa 200g", "Jamón, queso, lechuga, tomate y huevo.", 19000, "Hamburguesas", ["Salado"], "elcuyano-burgercompleta.jpg"],
            ["Burger Cuyano 200g", "Tomate, lechuga, cheddar, panceta y huevo frito.", 21000, "Hamburguesas", ["Salado"], "elcuyano-burgercuyano.jpg"],
            ["Burger Pizza Cuyano", "Queso, tomate, lechuga, huevo frito, cebolla caramelizada y panceta.", 41500, "Hamburguesas", ["Al Horno"], "elcuyano-burgerpizzacuyano.jpg"],
            ["Mila al Plato Napolitana", "Salsa de tomate, mozzarella y tomate. Con papas o ensalada.", 32000, "Milanesas", ["Frito", "Al Horno"], "elcuyano-milaalplatonapolitana.jpg"],
            ["Mila al Plato a Caballo", "Milanesa con huevos fritos. Con papas o ensalada.", 34000, "Milanesas", ["Frito"], "elcuyano-milaalplatoacaballo.jpg"],
            ["Lomito Cuyano XL", "Queso, lechuga, tomate, huevo frito, cebolla caramelizada y panceta.", 29000, "Lomitos", ["Salado"], "elcuyano-lomitocuyanoxl.jpg"],
            ["Lomito Cubano XL", "Tomate, pepino, lechuga y mozzarella.", 30000, "Lomitos", ["Salado"], "elcuyano-lomitocubanoxl.jpg"],
            ["Bajonero XL", "Sanguche de milanesa mega XL con queso, lechuga, tomate, jamón y papas fritas.", 43000, "Lomitos", ["Frito", "Para Compartir"], "elcuyano-bajoneroxl.jpg"],
            ["Sandwich de Milanesa Ranchera XL", "Cheddar, barbacoa, cebolla morada y panceta.", 26500, "Milanesas", ["Frito"], "elcuyano-sandwichdemilanesarancheraxl.jpg"],
            ["Focaccia de Jamón Crudo y Rúcula", "Focaccia casera con jamón crudo, rúcula y roquefort.", 16900, "Panadería", ["Salado"], "elcuyano-focacciadejamoncrudoyrucula.jpg"],
            ["Pizza Champiñones", "Salsa de tomate, mozzarella y champiñones.", 27000, "Pizzas", ["Al Horno", "Vegetariano"], "elcuyano-pizzachampinones.jpg"]
        ]
    },
    {
        key: "frozono",
        nombre: "Frozono",
        tipoComercio: "HELADERIA",
        email: "frozono@bajonea.com",
        password: "Bajonea2026!",
        telefonoComercio: "+5492964200911",
        direccion: direccion("Juan Domingo Perón", 186),
        horarios: [
            ...horariosDiarios(DIAS_LUN_JUE, "10:00:00", CIERRE_MEDIANOCHE),
            horario("VIERNES", "10:00:00", CIERRE_MEDIANOCHE),
            horario("SABADO", "12:00:00", CIERRE_MEDIANOCHE),
            horario("DOMINGO", "13:00:00", CIERRE_MEDIANOCHE)
        ],
        instagram: "https://www.instagram.com/frozono.rg/",
        descripcion: "Heladería artesanal con gran variedad de sabores clásicos y de autor.",
        fotoPerfil: "frozono-foto.jpg",
        personaJuridica: {
            razonSocial: "Frozono Heladeria",
            cuit: cuit("3071111900"),
            condicionIva: "MONOTRIBUTO",
            tipoSociedad: "EU",
            fechaInicioActividades: "2022-11-01"
        },
        representante: {
            nombre: "Carla", apellido: "Benitez", dni: "35222911",
            telefono: "+5492964111911", fechaNacimiento: "1992-07-25"
        },
        productos: [
            ["Helado Cuarto Kilo", "Un cuarto de kilo de helado artesanal, hasta 2 sabores a elección entre la variedad disponible en el local.", 10000, "Helados", ["Dulce"], "frozono-helado14kg.jpg"],
            ["Helado Medio Kilo", "Medio kilo de helado artesanal, hasta 3 sabores a elección entre la variedad disponible en el local.", 15000, "Helados", ["Dulce", "Para Compartir"], "frozono-helado12kg.jpg"],
            ["Helado 1 kg", "Un kilo de helado artesanal, hasta 4 sabores a elección entre la variedad disponible en el local.", 22000, "Helados", ["Dulce", "Para Compartir"], "frozono-helado1kg.jpg"],
            ["Torta Helada Chica", "Torta helada artesanal para 6 a 8 personas, con sabores a elección y decoración de la casa.", 28000, "Helados", ["Dulce", "Para Compartir"], "frozono-tortaheladachica.jpg"],
            ["Torta Helada Grande", "Torta helada artesanal para 12 a 15 personas, con sabores a elección y decoración de la casa.", 45000, "Helados", ["Dulce", "Para Compartir"], "frozono-tortaheladagrande.jpg"]
        ]
    },
    {
        key: "donpepone",
        nombre: "Don Pepone",
        tipoComercio: "RESTAURANTE",
        email: "donpepone@bajonea.com",
        password: "Bajonea2026!",
        telefonoComercio: "+5492964201011",
        direccion: direccion("Perito Moreno", 247),
        horarios: horariosDiarios(DIAS_MIE_LUN, "11:00:00", CIERRE_MEDIANOCHE),
        instagram: "https://www.instagram.com/pizzeria.donpepone/",
        descripcion: "Pizzería y parrilla al estilo italiano, con parrilla libre, pastas caseras y pastelería propia.",
        fotoPerfil: "donpepone-foto.jpg",
        personaJuridica: {
            razonSocial: "Don Pepone Gastronomica",
            cuit: cuit("3071112000"),
            condicionIva: "RESPONSABLE_INSCRIPTO",
            tipoSociedad: "EU",
            fechaInicioActividades: "2010-08-01"
        },
        representante: {
            nombre: "Giuseppe", apellido: "Ferrari", dni: "22111021",
            telefono: "+5492964112011", fechaNacimiento: "1968-02-14"
        },
        productos: [
            ["Pizza Muzzarella", "Salsa de tomate, mozzarella y orégano.", 21000, "Pizzas", ["Al Horno", "Vegetariano"], "donpepone-pizzamuzzarella.jpg"],
            ["Pizza Napolitana", "Salsa de tomate, mozzarella, tomate, ajo y orégano.", 23500, "Pizzas", ["Al Horno"], "donpepone-pizzanapolitana.jpg"],
            ["Pizza Especial", "Salsa de tomate, mozzarella, jamón y morrón.", 24500, "Pizzas", ["Al Horno"], "donpepone-pizzaespecial.jpg"],
            ["Pizza Mitad Rúcula y Mitad Jamón y Morrón", "Mitad rúcula y jamón crudo, mitad jamón cocido y morrón.", 26000, "Pizzas", ["Al Horno"], "donpepone-pizza12ruculay12jamonymorron.jpg"],
            ["Pizza Calabresa", "Salsa de tomate, mozzarella y longaniza.", 23500, "Pizzas", ["Al Horno", "Picante"], "donpepone-pizzacalabresa.jpg"],
            ["Pizza Fugazzeta", "Salsa de tomate, mozzarella y cebolla.", 23000, "Pizzas", ["Al Horno", "Vegetariano"], "donpepone-pizzafugazzeta.jpg"],
            ["Pizza 4 Quesos", "Mozzarella, roquefort, parmesano y provolone.", 27000, "Pizzas", ["Al Horno", "Vegetariano"], "donpepone-pizza4quesos.jpg"],
            ["Bife de Chorizo a la Parrilla", "Bife de chorizo con guarnición a elección.", 34000, "Parrillas y Asados", ["A la Parrilla"], "donpepone-bifedechorizoalaparrilla.jpg"],
            ["Brochete Mixto con Papas a Caballo", "Brochete de carne y pollo con papas a caballo.", 24000, "Parrillas y Asados", ["A la Parrilla"], "donpepone-brochetemixtoconpapasacaballo.jpg"],
            ["Pollo al Limón", "Pollo grillado con salsa de limón, con guarnición.", 19500, "Comida Casera", ["A la Parrilla"], "donpepone-polloallimon.jpg"],
            ["Pollo al Roquefort", "Pollo grillado con salsa de roquefort, con guarnición.", 20500, "Comida Casera", ["A la Parrilla"], "donpepone-polloalroquefort.jpg"],
            ["Salmón con Salsa a Elección", "Salmón grillado con salsa verde, roquefort, crema de limón o a la plancha, con guarnición.", 33000, "Pescados y Mariscos", ["A la Parrilla"], "donpepone-salmonconsalsaaeleccion.jpg"],
            ["Sorrentinos Negros de Salmón con Salsa de Mariscos", "Sorrentinos en masa negra rellenos de salmón, con salsa de mariscos.", 28500, "Pastas", [], "donpepone-sorrentinosnegrosdesalmonconsalsademariscos.jpg"],
            ["Hamburguesa Don Pepone", "Cebolla caramelizada, queso cheddar, panceta, lechuga y tomate.", 16500, "Hamburguesas", ["Salado"], "donpepone-hamburguesadonpepone.jpg"],
            ["Picada Caliente para 2", "Selección de fritos y bocaditos calientes para compartir.", 22000, "Para Picar", ["Para Compartir", "Frito"], "donpepone-picadacalientepara2.jpg"],
            ["Parrilla Libre por Persona", "Tenedor libre de parrilla variada.", 43000, "Parrillas y Asados", ["A la Parrilla", "Para Compartir"], "donpepone-parrillalibre.jpg"],
            ["Pizzas y Empanadas Libres por Persona", "Tenedor libre de pizzas y empanadas.", 15000, "Pizzas", ["Al Horno", "Para Compartir"], "donpepone-pizzasyempanadaslibres.jpg"],
            ["Torta del Día", "Porción de torta de la vitrina de pastelería.", 9500, "Pastelería", ["Dulce"], "donpepone-tortadeldia.jpg"]
        ]
    },
    {
        key: "nn",
        nombre: "NN",
        tipoComercio: "BAR",
        email: "nn@bajonea.com",
        password: "Bajonea2026!",
        telefonoComercio: "+5492964201111",
        direccion: direccion("Rosales", 178),
        horarios: horariosDiarios(DIAS_MAR_DOM, "19:00:00", CIERRE_MEDIANOCHE),
        instagram: "https://www.instagram.com/nn.masqueunbar/",
        descripcion: "Bar de tapeo, pizzas, hamburguesas y milanesas al plato, con carta de tragos y cervezas.",
        fotoPerfil: "nn-foto.jpg",
        personaJuridica: {
            razonSocial: "NN Mas Que Un Bar SU",
            cuit: cuit("3071112100"),
            condicionIva: "RESPONSABLE_INSCRIPTO",
            tipoSociedad: "EU",
            fechaInicioActividades: "2019-05-01"
        },
        representante: {
            nombre: "Nicolas", apellido: "Nunez", dni: "31444121",
            telefono: "+5492964112111", fechaNacimiento: "1988-09-30"
        },
        productos: [
            ["Papas NN", "Ternera desmenuzada, cherry, morrón y huevo estrellado.", 20000, "Para Picar", ["Frito"], "nn-papasnn.jpg"],
            ["Papas Bravas", "Papas fritas con salsa picante de la casa.", 16000, "Para Picar", ["Frito", "Picante"], "nn-papasbravas.jpg"],
            ["Picada Caliente para 4", "Brochettes de pollo, papas cheddar, pinchos de carne, empanaditas de copetín, bastones de muzza y mini milas.", 65000, "Para Picar", ["Para Compartir", "Frito"], "nn-picadacalientepara4.jpg"],
            ["Pizza Muzzarella", "Salsa de tomate, mozzarella y orégano, cocida en horno de piedra.", 25000, "Pizzas", ["Al Horno", "Vegetariano"], "nn-pizzamuzzarella.jpg"],
            ["Pizza Jamón Crudo y Rúcula", "Mozzarella, jamón crudo, rúcula fresca y láminas de parmesano.", 36200, "Pizzas", ["Al Horno"], "nn-pizzajamoncrudoyrucula.jpg"],
            ["Pizza de Vegetales", "Portobellos confitados, vegetales y mozzarella.", 33500, "Pizzas", ["Al Horno", "Vegetariano"], "nn-pizzadevegetales.jpg"],
            ["Pizza Americana", "Con huevos fritos y panceta.", 36200, "Pizzas", ["Al Horno"], "nn-pizzaamericana.jpg"],
            ["Empanada Cortada a Cuchillo Unidad", "Empanada casera cortada a cuchillo.", 4500, "Empanadas", ["Salado"], "nn-empanadacortadaacuchillo.jpg"],
            ["Sandwich Big Lomo", "Lomo, jamón, queso, lechuga, tomate y huevo, en pan de campo.", 25000, "Lomitos", ["Salado"], "nn-sandwichbiglomo.jpg"],
            ["Sandwich Big Palta", "Palta, queso, tomate y hojas verdes, en pan de campo.", 26000, "Lomitos", ["Vegetariano"], "nn-sandwichbigpalta.jpg"],
            ["Hamburguesa Tradicional", "Medallón de carne 130g, lechuga, huevo, mayonesa, jamón, queso y tomate.", 18500, "Hamburguesas", ["Salado"], "nn-hamburguesatradicional.jpg"],
            ["Hamburguesa Bacon", "Medallón de carne 130g, huevo, bacon, cheddar, salsa thousand island y cebolla picada.", 19500, "Hamburguesas", ["Salado"], "nn-hamburguesabacon.jpg"],
            ["Hamburguesa Blue Cheese", "Medallón de carne 130g, tomates deshidratados, queso azul, salsa alioli y rúcula.", 18500, "Hamburguesas", ["Salado"], "nn-hamburguesabluecheese.jpg"],
            ["Milanesa Bacon al Plato", "Milanesa de ternera con panceta crocante y queso gratinado, con guarnición.", 29000, "Milanesas", ["Frito"], "nn-milanesabacon.jpg"],
            ["Milanesa a Caballo al Plato", "Milanesa de ternera con dos huevos fritos, con guarnición.", 26000, "Milanesas", ["Frito"], "nn-milanesaacaballo.jpg"],
            ["Milanesa Napo al Plato", "Milanesa de ternera napolitana, con salsa de tomate, jamón y mozzarella gratinada.", 28000, "Milanesas", ["Frito", "Al Horno"], "nn-milanesanapo.jpg"],
            ["Lasagna de Berenjena", "Sugerencia del mes.", 25000, "Pastas", ["Vegetariano", "Al Horno"], "nn-lasagnadeberenjena.jpg"],
            ["Pinta de Cerveza", "Cerveza artesanal en pinta, tirada al momento.", 6000, "Bebidas c/ Alcohol", ["Light"], "nn-pintadecerveza.jpg"],
            ["Gin Tonic", "Gin con tónica premium y cítricos frescos.", 12000, "Bebidas c/ Alcohol", ["Light"], "nn-gintonic.jpg"],
            ["Trumpeter Malbec", "Vino Malbec Trumpeter, botella.", 22000, "Bebidas c/ Alcohol", [], "nn-trumpetermalbec.jpg"]
        ]
    },
    {
        key: "coiron",
        nombre: "Coirón Restobar",
        tipoComercio: "BAR",
        email: "coiron@bajonea.com",
        password: "Bajonea2026!",
        telefonoComercio: "+5492964201211",
        direccion: direccion("San Martín", 828),
        horarios: [
            ...DIAS_LUN_JUE.flatMap((d) => [horario(d, "11:00:00", "15:00:00"), horario(d, "18:00:00", CIERRE_MEDIANOCHE)]),
            horario("VIERNES", "11:00:00", "15:00:00"),
            horario("VIERNES", "18:00:00", CIERRE_MEDIANOCHE),
            horario("SABADO", "19:00:00", CIERRE_MEDIANOCHE),
            horario("DOMINGO", "19:00:00", CIERRE_MEDIANOCHE)
        ],
        instagram: "https://www.instagram.com/coiron.restobar/",
        descripcion: "Cervecería artesanal fueguina con picadas, hamburguesas, pizzas, platos al plato y carta completa de cócteles.",
        fotoPerfil: "coiron-foto.jpg",
        personaJuridica: {
            razonSocial: "Coiron Restobar SU",
            cuit: cuit("3071112200"),
            condicionIva: "RESPONSABLE_INSCRIPTO",
            tipoSociedad: "EU",
            fechaInicioActividades: "2018-09-01"
        },
        representante: {
            nombre: "Matias", apellido: "Cardenas", dni: "30333221",
            telefono: "+5492964112211", fechaNacimiento: "1986-12-05"
        },
        productos: [
            ["Pichanga Caliente", "Montaña de papas fritas, salteado de salchichas, salchicha parrillera y queso tybo, con palta, cherrys, pepinillos, aceitunas, huevo y salpimentado.", 44000, "Para Picar", ["Para Compartir", "Frito"], "coiron-pichangacaliente.jpg"],
            ["Papas Bravas", "Papas fritas con salsa brava picante de la casa.", 18000, "Para Picar", ["Frito", "Picante"], "coiron-papasbravas.jpg"],
            ["Tequeños", "Bastones de masa rellenos de queso, fritos y crocantes.", 15000, "Para Picar", ["Frito", "Vegetariano"], "coiron-tequenos.jpg"],
            ["Entraña Coirón con Papas", "Entraña a la parrilla acompañada de papas fritas de la casa.", 38500, "Parrillas y Asados", ["A la Parrilla"], "coiron-entranacoironconpapas.jpg"],
            ["Bife de Chorizo con Papas 500g", "Bife de chorizo de 500g a la parrilla, con papas fritas.", 40000, "Parrillas y Asados", ["A la Parrilla"], "coiron-bifedechorizoconpapas.jpg"],
            ["Milanesa a Caballo", "Milanesa de ternera con dos huevos fritos y guarnición.", 30000, "Milanesas", ["Frito"], "coiron-milanesaacaballo.jpg"],
            ["Pizza Muzza Chica", "Salsa de tomate, mozzarella y orégano, tamaño chico.", 16500, "Pizzas", ["Al Horno", "Vegetariano"], "coiron-pizzamuzza.jpg"],
            ["Pizza Napolitana", "Salsa de tomate, mozzarella, rodajas de tomate y ajo.", 19000, "Pizzas", ["Al Horno"], "coiron-pizzanapolitana.jpg"],
            ["Pizza Calabresa", "Salsa de tomate, mozzarella y longaniza calabresa.", 19000, "Pizzas", ["Al Horno", "Picante"], "coiron-pizzacalabresa.jpg"],
            ["Pizza 4 Quesos", "Mozzarella, roquefort, provolone y parmesano.", 20000, "Pizzas", ["Al Horno", "Vegetariano"], "coiron-pizza4quesos.jpg"],
            ["Hamburguesa Completa", "Medallón de carne, jamón, queso, lechuga, tomate y huevo.", 22500, "Hamburguesas", ["Salado"], "coiron-hamburguesacompleta.jpg"],
            ["Hamburguesa Pulled Desmenuzado", "Medallón desmenuzado bondiola desmenuzada con cerveza, cebolla morada y queso cheddar.", 22900, "Hamburguesas", ["Salado"], "coiron-hamburguesapulleddesmenuzado.jpg"],
            ["Sandwich Lomito Completo", "Lomo, jamón, queso, lechuga, tomate, huevo y mayonesa.", 28000, "Lomitos", ["Salado"], "coiron-sandwichlomitocompleto.jpg"],
            ["Sandwich Mila Completo", "Milanesa, jamón, queso, lechuga, tomate y huevo.", 27500, "Lomitos", ["Frito"], "coiron-sandwichmilacompleto.jpg"],
            ["Sandwich Palta", "Lomo, queso, palta y tomate.", 28500, "Lomitos", ["Vegetariano"], "coiron-sandwichpalta.jpg"],
            ["Empanada Casera de Carne a Cuchillo", "Empanada de carne cortada a cuchillo, horneada.", 4800, "Empanadas", ["Salado"], "coiron-empanadacaseradecarneacuchillo.jpg"],
            ["Empanada China de Cerdo 4 Unidades", "Cuatro empanadas fritas rellenas de cerdo estilo oriental.", 15000, "Empanadas", ["Frito", "Salado"], "coiron-empanadachinadecerdo.jpg"],
            ["Postre Copa", "Copa de postre de la casa con crema y dulce de leche.", 6000, "Pastelería", ["Dulce"], "coiron-postrecopa.jpg"],
            ["Cerveza Golden Pinta", "Fresca, bien balanceada, color dorado, leve amargor con predominio de la malta.", 6000, "Bebidas c/ Alcohol", ["Light"], "coiron-cervezagoldenpinta.jpg"],
            ["Cerveza IPA Pinta", "Aroma intenso frutal, cítrica, resinosa, decididamente lupulada, amarga y de final seco.", 6500, "Bebidas c/ Alcohol", ["Picante"], "coiron-cervezaipapinta.jpg"]
        ]
    },
    {
        key: "patiobalto",
        nombre: "Patio Balto",
        tipoComercio: "BAR",
        email: "patiobalto@bajonea.com",
        password: "Bajonea2026!",
        telefonoComercio: "+5492964201311",
        direccion: direccion("Beauvoir", 455),
        horarios: horariosDiarios(DIAS_TODOS, "19:00:00", CIERRE_MEDIANOCHE),
        instagram: "https://www.instagram.com/patiobalto/",
        descripcion: "Burgers caseras, cervezas fueguinas y tragos de autor. Pet friendly, eco bar & patio.",
        fotoPerfil: "patiobalto-foto.jpg",
        personaJuridica: {
            razonSocial: "Patio Balto SU",
            cuit: cuit("3071112300"),
            condicionIva: "RESPONSABLE_INSCRIPTO",
            tipoSociedad: "EU",
            fechaInicioActividades: "2023-02-01"
        },
        representante: {
            nombre: "Lucia", apellido: "Ortega", dni: "37222321",
            telefono: "+5492964112311", fechaNacimiento: "1995-01-22"
        },
        productos: [
            ["Jack Doble", "Burger en pan brioche con queso gratinado, el mejor blend con cheddar, bacon, cebolla crispy y salsa BBQ Jack Daniel's.", 21000, "Hamburguesas", ["Salado"], "patiobalto-jack.jpg"],
            ["Tana Doble", "Doble blend de carne en pan brioche abrazando un medallón de muzza frita, coronado con cherrys confitados, palta y alioli.", 19000, "Hamburguesas", ["Salado"], "patiobalto-tana.jpg"],
            ["Crunchy", "Crujiente pollo frito en pan brioche, queso dambo, tomate, lechuga repollada, cebolla, pickles de pepino y salsa mil islas.", 13000, "Hamburguesas", ["Frito"], "patiobalto-crunchy.jpg"],
            ["Fuegian Fungi Simple", "Medallón crocante de girgolas rebozado en panko, queso dambo, rúcula, cebolla caramelizada y salsa de ajo negro.", 14000, "Hamburguesas", ["Vegetariano", "Frito"], "patiobalto-fuegianfungi.jpg"],
            ["Picantona 20", "Burger de pollo frito con salsa BBQ de jalapeños, pickles de cebolla y lechuga. Picor medio.", 13000, "Hamburguesas", ["Picante", "Frito"], "patiobalto-picantona20.jpg"],
            ["Chacarera Doble", "Burger smash en pan de campo, provoleta gratinada, salsa de morrón asado y chimichurri, chicharrón de cerdo y verdeo confitado.", 18000, "Hamburguesas", ["Salado"], "patiobalto-chacarera.jpg"],
            ["Papas Balto", "Papas fritas con cheddar y pulled pork.", 20000, "Para Picar", ["Frito"], "patiobalto-papasbalto.jpg"],
            ["Batatas con Bacon y Verdeo", "Batatas fritas cubiertas con panceta crocante y verdeo.", 12000, "Para Picar", ["Frito"], "patiobalto-batatasconbaconyverdeo.jpg"],
            ["Crunchitos", "Pollitos fritos rebozados con salsa a elección.", 24000, "Para Picar", ["Frito"], "patiobalto-crunchitos.jpg"],
            ["Tequeños Hechos en Casa", "Mini bastones fritos de queso envueltos en masa levemente dulce, con salsa a elección.", 27000, "Para Picar", ["Frito", "Vegetariano"], "patiobalto-tequenoshechosencasa.jpg"],
            ["Super Bowl de Pollo Frito Individual", "Balde de pollo frito: patas, muslo, drumets y crunchitos, con papas fritas y salsa.", 21000, "Para Picar", ["Frito"], "patiobalto-superbowldepollofrito.jpg"],
            ["Picada Baltera Media", "Sliders de pulled pork, crunchitos, milanesitas, aros de cebolla, drumets fritos, tequeños, papas y batatas con cheddar.", 32000, "Para Picar", ["Para Compartir", "Frito"], "patiobalto-picadabaltera.jpg"],
            ["Empanada de Carne Unidad", "Empanada casera rellena de carne cortada a cuchillo.", 4000, "Empanadas", ["Salado"], "patiobalto-empanadadecarne.jpg"],
            ["Ensalada Lupita", "Mix de hojas verdes, tomates cherry, palta, verdeo, crutones, queso sardo, semillas de sésamo, alioli y vinagreta.", 18000, "Ensaladas y Bowls", ["Vegetariano"], "patiobalto-ensaladalupita.jpg"],
            ["Mila Clásica", "Milanesa frita de bife angosto rebozada en panko, con salsita de alioli.", 24000, "Milanesas", ["Frito"], "patiobalto-milaclasica.jpg"],
            ["Sandwich Ahumado de Carne Alioli", "Tapa de asado ahumado en pan ciabatta, alioli, rúcula, cherrys confitados y queso sardo.", 19000, "Lomitos", ["Salado"], "patiobalto-sandwichahumadodecarnealioli.jpg"],
            ["Flan de Dulce de Leche", "Con crema chantilly y coco rallado.", 6000, "Pastelería", ["Dulce"], "patiobalto-flandedulcedeleche.jpg"],
            ["Negroni de la Casa", "Cinzano especiado, Campari, gin Jeremy Button, macerado en barrica de roble francés y splash de naranja.", 11000, "Bebidas c/ Alcohol", [], "patiobalto-negronidelacasa.jpg"],
            ["Cerveza Pinta Clásica", "Pinta de cerveza artesanal fueguina.", 6000, "Bebidas c/ Alcohol", [], "patiobalto-cervezapintaclasica.jpg"],
            ["Bacon Bleu 20 Doble", "Pan brioche, medallón con dambo, bacon, rúcula, cebolla crispy y crema de queso azul.", 20000, "Hamburguesas", ["Salado"], "patiobalto-baconbleu20.jpg"]
        ]
    },
    {
        key: "grandehotel",
        nombre: "Grande Hotel | Restaurante",
        tipoComercio: "RESTAURANTE",
        email: "grandehotel@bajonea.com",
        password: "Bajonea2026!",
        telefonoComercio: "+5492964201411",
        direccion: direccion("Federico Echelaine", 251),
        horarios: horariosDiarios(DIAS_TODOS, "20:00:00", CIERRE_MEDIANOCHE),
        instagram: "https://www.instagram.com/grandehoteltdf/",
        descripcion: "Restaurante del Grande Hotel con cocina de trattoria y grill: entradas, carnes, pescados, pastas y parrillada de sábados.",
        fotoPerfil: "grandehotelrestaurante-foto.jpg",
        personaJuridica: {
            razonSocial: "Grande Hotel Restaurante SU",
            cuit: cuit("3071112400"),
            condicionIva: "RESPONSABLE_INSCRIPTO",
            tipoSociedad: "EU",
            fechaInicioActividades: "2005-01-01"
        },
        representante: {
            nombre: "Roberto", apellido: "Alvarez", dni: "18666421",
            telefono: "+5492964112411", fechaNacimiento: "1965-06-10"
        },
        productos: [
            ["Empanada de Carne Unidad", "Empanada casera de carne cortada a cuchillo, horneada.", 3500, "Empanadas", ["Salado"], "grandehotelrestaurante-empanadadecarne.jpg"],
            ["Provoleta", "Queso provolone grillado a la parrilla, con orégano y aceite de oliva.", 18500, "Para Picar", ["A la Parrilla", "Vegetariano"], "grandehotelrestaurante-provoleta.jpg"],
            ["Rabas a la Romana", "Anillas de calamar empanizadas.", 27000, "Para Picar", ["Frito"], "grandehotelrestaurante-rabasalaromana.jpg"],
            ["Trío de Mar", "Selección de mariscos.", 33000, "Pescados y Mariscos", ["Para Compartir"], "grandehotelrestaurante-triodemar.jpg"],
            ["Ensalada César de Pollo", "Lechuga, croutons, pollo, queso sardo y salsa César casera.", 15500, "Ensaladas y Bowls", ["Salado"], "grandehotelrestaurante-ensaladacesardepollo.jpg"],
            ["Milanesa Napolitana", "Salsa de tomate, jamón cocido y mozzarella.", 24500, "Milanesas", ["Frito", "Al Horno"], "grandehotelrestaurante-milanesanapolitana.jpg"],
            ["Bife de Chorizo con Guarnición", "Corte típico argentino.", 38000, "Parrillas y Asados", ["A la Parrilla"], "grandehotelrestaurante-bifedechorizoconguarnicion.jpg"],
            ["Bife Grande Hotel", "Corte especial de la casa.", 46500, "Parrillas y Asados", ["A la Parrilla"], "grandehotelrestaurante-bifegrandehotel.jpg"],
            ["Bondiola con Salsa de Frutos Rojos", "Bondiola de cerdo a la parrilla, bañada en salsa de frutos rojos.", 34000, "Parrillas y Asados", ["A la Parrilla"], "grandehotelrestaurante-bondiolaconsalsadefrutosrojos.jpg"],
            ["Parrillada para 2 Personas", "Selección de cortes a la parrilla, sábados.", 74000, "Parrillas y Asados", ["A la Parrilla", "Para Compartir"], "grandehotelrestaurante-parrilladapara2personas.jpg"],
            ["Porción de Cordero", "Porción de cordero patagónico a la parrilla.", 18500, "Parrillas y Asados", ["A la Parrilla"], "grandehotelrestaurante-porciondecordero.jpg"],
            ["Pollo Cubeteado a la Naranja", "Cubos de pechuga de pollo salteados en salsa de naranja.", 27500, "Comida Casera", ["Salado"], "grandehotelrestaurante-pollocubeteadoalanaranja.jpg"],
            ["Salmón Grille", "Salmón grillado.", 37500, "Pescados y Mariscos", ["A la Parrilla"], "grandehotelrestaurante-salmongrille.jpg"],
            ["Trucha al Roquefort", "Trucha grillada bañada en salsa de queso roquefort.", 33000, "Pescados y Mariscos", ["A la Parrilla"], "grandehotelrestaurante-truchaalroquefort.jpg"],
            ["Tallarines Caseros al Huevo", "Tallarines artesanales elaborados con masa de huevo.", 11000, "Pastas", ["Vegetariano"], "grandehotelrestaurante-tallarinescaserosalhuevo.jpg"],
            ["Ravioles Negros con Tinta de Calamar Rellenos de Centolla", "Con salsa de langostinos.", 49000, "Pastas", [], "grandehotelrestauranteraviolesnegroscontintadecalamarrellenosdecentolla.jpg"],
            ["Risotto con Camarones", "Risotto cremoso con camarones salteados.", 25000, "Pastas", [], "grandehotelrestaurante-risottoconcamarones.jpg"],
            ["Flan Casero", "Flan casero con dulce de leche y crema.", 8500, "Pastelería", ["Dulce"], "grandehotelrestaurante-flancasero.jpg"],
            ["Tiramisú", "Postre italiano clásico de la casa.", 11500, "Pastelería", ["Dulce"], "grandehotelrestaurante-tiramisu.jpg"],
            ["Cerveza Patagonia Roja Rubia o Negra", "Botella de cerveza Patagonia, a elección entre Roja, Rubia o Negra.", 11500, "Bebidas c/ Alcohol", ["Light"], "grandehotelrestaurante-cervezapatagonia.jpg"]
        ]
    }
];
