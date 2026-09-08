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
const DIAS_LUN_SAB = ["LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO"];
const DIAS_LUN_VIE = ["LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES"];
const DIAS_MAR_DOM = ["MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO", "DOMINGO"];

function horariosDiarios(dias, apertura, cierre) {
    return dias.map((d) => horario(d, apertura, cierre));
}

export const COMERCIOS = [
    {
        key: "popular",
        nombre: "Pizzería Popular",
        tipoComercio: "PIZZERIA",
        email: "popular@bajonea.com",
        password: "Bajonea2026!",
        telefonoComercio: "+5492964200111",
        direccion: direccion("9 de Julio", 837),
        horarios: horariosDiarios(DIAS_TODOS, "10:00:00", "23:59:00"),
        instagram: "https://www.instagram.com/pizzeriapopular.riogrande/",
        descripcion: "Pizzería de horno de barro con más de una decena de variedades clásicas y de autor, pastas caseras y una carta de tragos de autor.",
        fotoPerfil: "lapopular-foto.jpg",
        personaJuridica: {
            razonSocial: "Popular Gastronomica",
            cuit: cuit("3071111100"),
            condicionIva: "RESPONSABLE_INSCRIPTO",
            tipoSociedad: "EU",
            fechaInicioActividades: "2021-06-01"
        },
        representante: {
            nombre: "Marcelo", apellido: "Fernandez", dni: "25333111",
            telefono: "+5492964111222", fechaNacimiento: "1978-05-12"
        },
        productos: [
            ["Pizza Margherita con Albahaca", "Pizza en horno de barro con salsa de tomate, mozzarella y albahaca fresca. Tamaño grande.", 25900, "Pizzas", ["Al Horno", "Vegetariano"], "lapopularpizzamargheritaconalbahaca.jpg"],
            ["Pizza Napoletana", "Pizza en horno de barro con salsa de tomate, mozzarella, tomate, ajo y orégano. Tamaño grande.", 29100, "Pizzas", ["Al Horno"], "lapopular-pizzanapoletana.jpg"],
            ["Pizza Especial", "Pizza en horno de barro con salsa de tomate, mozzarella, pimientos, jamón cocido, olivas verdes y orégano. Tamaño grande.", 39900, "Pizzas", ["Al Horno"], "lapopular-pizzaespecial.jpg"],
            ["Pizza Pepperoni", "Pizza en horno de barro con salsa de tomate, mozzarella y pepperoni estilo New York. Tamaño grande.", 38500, "Pizzas", ["Al Horno", "Picante"], "lapopular-pizzapepperoni.jpg"],
            ["Pizza Americana", "Pizza en horno de barro con salsa de tomate, mozzarella, pollo a la barbacoa, panceta, cheddar, cebolla morada y verdeo. Tamaño grande.", 36300, "Pizzas", ["Al Horno"], "lapopular-pizzaamericana.jpg"],
            ["Pizza de Peras al Malbec", "Pizza en horno de barro con mozzarella, queso azul, peras al malbec y nueces. Tamaño grande.", 41400, "Pizzas", ["Al Horno", "Vegetariano"], "lapopularpizzadeperasalmalbec.jpg"],
            ["Pizza Fruto di Mare", "Pizza en horno de barro con salsa de tomate, mozzarella, mejillones, camarones, aros de calamar, aceite de ajo, limón y perejil. Tamaño grande.", 46400, "Pizzas", ["Al Horno"], "lapopular-pizzafrutodimare.jpg"],
            ["Pizza Fugazzeta Rellena", "Pizza al horno de barro con salsa de tomate, jamón cocido, mozzarella, provolone, cebolla blanca, morada y verdeo.", 36900, "Pizzas", ["Al Horno"], "lapopularpizzafugazzetarellena.jpg"],
            ["Bastoncitos de Mozzarella", "Bastoncitos empanados con relleno de mozzarella.", 19000, "Para Picar", ["Frito", "Vegetariano"], "lapopularbastoncitosdemozzarella.jpg"],
            ["Papas Fritas", "Clásicas en bastón, con ketchup.", 12100, "Para Picar", ["Frito", "Vegetariano"], "lapopular-papasfritas.jpg"],
            ["Provoleta Clásica con Hierbas", "Provoleta a la parrilla con hierbas frescas.", 16400, "Para Picar", ["A la Parrilla", "Vegetariano"], "lapopularprovoletaclasicaconhierbas.jpg"],
            ["Tabla Popular de Fiambres", "Tabla de jamón cocido, jamón crudo, queso tybo, salame, queso holanda, queso azul, cazuela de lactonesa y pan de la casa. Para 2 personas.", 28300, "Para Picar", ["Para Compartir"], "lapopulartablapopulardefiambres.jpg"],
            ["Sorrentinos de Calabaza", "Sorrentinos caseros rellenos de calabaza y mozzarella.", 26600, "Pastas", ["Vegetariano"], "lapopularsorrentinosdecalabaza.jpg"],
            ["Lasagna de Carne", "Lasagna rellena de salsa bolognesa, ricota fresca, jamón cocido y queso tybo.", 24100, "Pastas", ["Al Horno"], "lapopular-lasagnadecarne.jpg"],
            ["Ñoquis de Papa", "Ñoquis de papa caseros. Vienen en pan de pizza.", 21700, "Pastas", ["Vegetariano"], "lapopular-noquisdepapa.jpg"],
            ["Milanesa La Popular Sur", "Milanesa de ternera con cazuela de lactonesa casera y limón.", 23300, "Milanesas", ["Frito"], "lapopularmilanesalapopularsur.jpg"],
            ["Milanesa Napolitana Sur", "Milanesa de ternera con salsa de tomate, mozzarella gratinada, jamón cocido, cascos de tomate asados y albahaca.", 30400, "Milanesas", ["Frito", "Al Horno"], "lapopularmilanesanapolitanasur.jpg"],
            ["Sandwich de Milanesa", "Pan de pizza, milanesa, jamón cocido, queso tybo, lechuga, tomate y mayonesa, acompañado de papas fritas.", 27900, "Lomitos", ["Frito"], "lapopularsandwichdemilanesa.jpg"],
            ["Empanada de Carne", "Empanada casera de carne.", 3400, "Empanadas", ["Salado"], "lapopular-empanadadecarne.jpg"],
            ["Negroni", "Gin, Campari, vermut Carpano Rosso y rodaja de naranja.", 12700, "Bebidas c/ Alcohol", ["Combos"], "lapopular-negroni.jpg"]
        ]
    },
    {
        key: "corner",
        nombre: "Corner Coffee Shop",
        tipoComercio: "CAFETERIA",
        email: "corner@bajonea.com",
        password: "Bajonea2026!",
        telefonoComercio: "+5492964200222",
        direccion: direccion("Córdoba", 991),
        horarios: horariosDiarios(DIAS_LUN_SAB, "08:00:00", "20:30:00"),
        instagram: "https://www.instagram.com/corner.coffeeshop/",
        descripcion: "Cafetería de especialidad con pastelería y panadería de producción propia, brunch, desayunos y meriendas, sandwiches y brusquetas gourmet.",
        fotoPerfil: "corner-foto.jpg",
        personaJuridica: {
            razonSocial: "Corner Coffee Shop SU",
            cuit: cuit("3071111200"),
            condicionIva: "RESPONSABLE_INSCRIPTO",
            tipoSociedad: "EU",
            fechaInicioActividades: "2023-03-15"
        },
        representante: {
            nombre: "Julieta", apellido: "Gimenez", dni: "33444222",
            telefono: "+5492964111333", fechaNacimiento: "1990-11-03"
        },
        productos: [
            ["Expresso", "Café expresso clásico, en taza chica.", 4500, "Café e Infusiones", ["Desayuno/Merienda"], "corner-expresso.jpg"],
            ["Café con Leche", "Café con leche clásico.", 7500, "Café e Infusiones", ["Desayuno/Merienda"], "corner-cafeconleche.jpg"],
            ["Café Corner", "Café con leche condensada, crema y chocolate.", 10200, "Café e Infusiones", ["Desayuno/Merienda", "Dulce"], "corner-cafecorner.jpg"],
            ["Submarino", "Leche caliente con barra de chocolate para disolver.", 8500, "Café e Infusiones", ["Desayuno/Merienda", "Dulce"], "corner-submarino.jpg"],
            ["Limonada Jarra", "Limonada casera, jarra para compartir.", 17500, "Bebidas s/ Alcohol", ["Para Compartir"], "corner-limonadajarra.jpg"],
            ["Medialuna", "Medialuna clásica de manteca.", 3100, "Panadería", ["Desayuno/Merienda", "Dulce"], "corner-medialuna.jpg"],
            ["Croissant Relleno de Jamón y Queso", "Croissant de manteca relleno de jamón y queso.", 13500, "Panadería", ["Desayuno/Merienda", "Salado"], "cornercroissantrellenodejamonyqueso.jpg"],
            ["Alfajor de Maicena", "Alfajor de maicena relleno de dulce de leche.", 7100, "Pastelería", ["Dulce"], "corner-alfajordemaicena.jpg"],
            ["Torta del Día", "Porción de la torta del día, sujeta a disponibilidad.", 15000, "Pastelería", ["Dulce"], "corner-tortadeldia.jpg"],
            ["Desayuno Clásico", "Café con leche o té, jugo de naranja exprimido, tostadas de pan de campo, queso crema y mermelada.", 17500, "Menú del Día", ["Desayuno/Merienda"], "corner-desayunoclasico.jpg"],
            ["Desayuno Saludable", "Café con leche o té, jugo de naranja exprimido, yogur, frutas de estación, granola, miel y coco.", 21200, "Menú del Día", ["Desayuno/Merienda", "Light"], "corner-desayunosaludable.jpg"],
            ["Brunch Americano", "Jugo de naranja, panceta, huevo revuelto, jamón cocido y tostada de campo.", 23900, "Menú del Día", ["Desayuno/Merienda", "Salado"], "corner-brunchamericano.jpg"],
            ["Waffle Americano", "Jamón cocido, cheddar, huevo revuelto, panceta y barbacoa.", 19800, "Menú del Día", ["Desayuno/Merienda", "Salado"], "corner-waffleamericano.jpg"],
            ["Pancakes Frutal", "Fruta de estación, granola, miel y mantequilla de maní.", 15900, "Pastelería", ["Dulce", "Desayuno/Merienda"], "corner-pancakesfrutal.jpg"],
            ["Brusqueta Avocado Toast", "Queso crema, palta y huevo poché.", 17500, "Menú del Día", ["Vegetariano"], "corner-brusquetaavocadotoast.jpg"],
            ["Sandwich Caesar", "Pan de campo, pollo, lechuga, panceta crocante, parmesano y salsa César.", 21900, "Lomitos", ["Salado"], "corner-sandwichcaesar.jpg"],
            ["Tostado de Campo", "Pan de campo, jamón cocido y queso mozzarella.", 15800, "Lomitos", ["Salado"], "corner-tostadodecampo.jpg"],
            ["Ensalada César", "Lechuga, croutons, parmesano, pollo, cherry y salsa César.", 21900, "Ensaladas y Bowls", ["Salado"], "corner-ensaladacesar.jpg"],
            ["Ensalada Corner", "Mix de hojas verdes, peras confitadas, queso azul, nueces, parmesano y tomates hidratados.", 23500, "Ensaladas y Bowls", ["Vegetariano"], "corner-ensaladacorner.jpg"],
            ["Tarta de Verduras", "Verduras de temporada, con ensalada.", 18300, "Comida Casera", ["Vegetariano", "Al Horno"], "corner-tartadeverduras.jpg"]
        ]
    },
    {
        key: "lostroncos",
        nombre: "Los Troncos",
        tipoComercio: "PARRILLA",
        email: "lostroncos@bajonea.com",
        password: "Bajonea2026!",
        telefonoComercio: "+5492964200333",
        direccion: direccion("Islas Malvinas", 954),
        horarios: horariosDiarios(DIAS_TODOS, "20:00:00", "23:59:00"),
        instagram: "https://www.instagram.com/los.troncos.parrilla/",
        descripcion: "Parrilla y restaurante con tenedor libre, especializada en cortes a la estaca y platos de cocina patagónica.",
        fotoPerfil: "lostroncos-foto.jpg",
        personaJuridica: {
            razonSocial: "Los Troncos Parrilla",
            cuit: cuit("3071111300"),
            condicionIva: "RESPONSABLE_INSCRIPTO",
            tipoSociedad: "EU",
            fechaInicioActividades: "2018-08-10"
        },
        representante: {
            nombre: "Sergio", apellido: "Paredes", dni: "22555333",
            telefono: "+5492964111444", fechaNacimiento: "1975-02-20"
        },
        productos: [
            ["Rabas", "Anillas de calamar rebozadas y fritas.", 18000, "Para Picar", ["Frito"], "lostroncos-rabas.jpg"],
            ["Empanadas", "Empanadas caseras surtidas.", 17000, "Para Picar", ["Salado"], "lostroncos-empanadas.jpg"],
            ["Lengua a la Vinagreta", "Lengua fría en vinagreta de la casa.", 9800, "Para Picar", ["Salado"], "lostroncos-lenguaalavinagreta.jpg"],
            ["Ensalada Mixta", "Lechuga, tomate y cebolla.", 9800, "Ensaladas y Bowls", ["Vegetariano", "Light"], "lostroncos-ensaladamixta.jpg"],
            ["Ensalada Rusa", "Papa, zanahoria, arvejas y mayonesa.", 9800, "Ensaladas y Bowls", ["Vegetariano"], "lostroncos-ensaladarusa.jpg"],
            ["Ensalada de Papa y Huevo", "Papa hervida y huevo duro.", 9800, "Ensaladas y Bowls", ["Vegetariano"], "lostroncos-ensaladadepapayhuevo.jpg"],
            ["Ensalada César", "Lechuga, croutons, parmesano y aderezo César.", 9800, "Ensaladas y Bowls", ["Vegetariano"], "lostroncos-ensaladacesar.jpg"],
            ["Ensalada Caprese", "Tomate, mozzarella y albahaca.", 9800, "Ensaladas y Bowls", ["Vegetariano"], "lostroncos-ensaladacaprese.jpg"],
            ["Ensalada Waldorf", "Manzana, apio, nuez y mayonesa.", 9800, "Ensaladas y Bowls", ["Vegetariano"], "lostroncos-ensaladawaldorf.jpg"],
            ["Cordero a la Estaca", "Cordero fueguino cocido lentamente a la estaca. Porción individual.", 19000, "Parrillas y Asados", ["A la Parrilla"], "lostroncos-corderoalaestaca.jpg"],
            ["Asado de Tira", "Tira de asado a la parrilla. Porción individual.", 18000, "Parrillas y Asados", ["A la Parrilla"], "lostroncos-asadodetira.jpg"],
            ["Asado de Vacío", "Vacío a la parrilla. Porción individual.", 19500, "Parrillas y Asados", ["A la Parrilla"], "lostroncos-asadodevacio.jpg"],
            ["Asado de Matambre", "Matambre a la parrilla. Porción individual.", 18500, "Parrillas y Asados", ["A la Parrilla"], "lostroncos-asadodematambre.jpg"],
            ["Pollo al Espiedo", "Pollo entero cocido al espiedo. Porción individual.", 17000, "Parrillas y Asados", ["A la Parrilla"], "lostroncos-polloalespiedo.jpg"],
            ["Bife de Chorizo", "Bife de chorizo a la parrilla.", 19000, "Parrillas y Asados", ["A la Parrilla"], "lostroncos-bifedechorizo.jpg"],
            ["Salmón Los Troncos", "Salmón grillado con guarnición de la casa.", 26200, "Pescados y Mariscos", ["A la Parrilla"], "lostroncos-salmonlostroncos.jpg"],
            ["Cordero al Romero", "Cordero patagónico cocido con romero fresco.", 19200, "Parrillas y Asados", ["A la Parrilla"], "lostroncos-corderoalromero.jpg"],
            ["Cazuela de Cordero", "Cazuela de cordero patagónico cocido a fuego lento con vegetales de estación.", 19200, "Comida Casera", ["Salado"], "lostroncos-cazueladecordero.jpg"],
            ["Wok de Mariscos y Verduras", "Salteado de mariscos y verduras frescas.", 19800, "Pescados y Mariscos", ["Al Vapor"], "lostroncos-wokdemariscosyverduras.jpg"],
            ["Pollo a la Naranja con Puré de Calabaza", "Pollo a la naranja acompañado de puré de calabaza.", 18400, "Comida Casera", ["Salado"], "lostroncospolloalanaranjaconpuredecalabaza.jpg"]
        ]
    },
    {
        key: "store54",
        nombre: "Store 54",
        tipoComercio: "KIOSCO",
        email: "store54@bajonea.com",
        password: "Bajonea2026!",
        telefonoComercio: "+5492964200444",
        direccion: direccion("Monseñor Fagnano", 785),
        horarios: [
            ...horariosDiarios(DIAS_LUN_VIE, "08:00:00", "23:59:00"),
            ...horariosDiarios(["SABADO", "DOMINGO"], "10:00:00", "23:59:00")
        ],
        instagram: "https://www.instagram.com/store54ok/",
        descripcion: "Kiosco de cercanía con snacks, bebidas, golosinas y panchos al momento. \"Más que un kiosco, un lugar de encuentro.\"",
        fotoPerfil: "store54-foto.jpg",
        personaJuridica: {
            razonSocial: "Store 54",
            cuit: cuit("3071111400"),
            condicionIva: "MONOTRIBUTO",
            tipoSociedad: "EU",
            fechaInicioActividades: "2024-02-01"
        },
        representante: {
            nombre: "Nicolas", apellido: "Aguirre", dni: "31666444",
            telefono: "+5492964111555", fechaNacimiento: "1988-07-15"
        },
        productos: [
            ["Superpancho", "Pancho con salchicha, papas pay, salsas a elección.", 4000, "Para Picar", ["Frito"], "store54-superpancho.jpg"],
            ["Alfajor Oreo", "Alfajor relleno de crema y galleta Oreo.", 2800, "Otros", ["Dulce"], "store54-alfajororeo.jpg"],
            ["Alfajor Milka", "Alfajor de chocolate con leche Milka.", 2900, "Otros", ["Dulce"], "store54-alfajormilka.jpg"],
            ["Alfajor Guaymallén Chocolate", "Alfajor triple de chocolate.", 2200, "Otros", ["Dulce"], "store54-alfajorguaymallenchocolate.jpg"],
            ["Coca Cola 500ml", "Gaseosa cola línea Coca-Cola, botella de 500ml.", 2500, "Bebidas s/ Alcohol", ["Light"], "store54-cocacola500ml.jpg"],
            ["Sprite 500ml", "Gaseosa lima-limón, botella de 500ml.", 2500, "Bebidas s/ Alcohol", ["Light"], "store54-sprite500ml.jpg"],
            ["Pepsi Black 500ml", "Gaseosa cola sin azúcar.", 2500, "Bebidas s/ Alcohol", ["Sin Azúcar"], "store54-pepsiblack500ml.jpg"],
            ["Galletitas Oreo", "Paquete de galletitas Oreo clásicas.", 2300, "Otros", ["Dulce"], "store54-galletitasoreo.jpg"],
            ["Papas Lays Clásicas", "Paquete de papas fritas Lays.", 2800, "Otros", ["Salado"], "store54-papaslaysclasicas.jpg"],
            ["Cheetos", "Paquete de palitos de queso Cheetos.", 2200, "Otros", ["Salado"], "store54-cheetos.jpg"],
            ["Agua Mineral 500ml", "Agua mineral sin gas.", 1800, "Bebidas s/ Alcohol", ["Light"], "store54-aguamineral500ml.jpg"],
            ["Cerveza Corona Extra", "Botella de cerveza Corona Extra, 355ml, servida fría.", 4200, "Bebidas c/ Alcohol", ["Light"], "store54-cervezacoronaextra.jpg"],
            ["Chocolate Cofler", "Tableta de chocolate con leche Cofler.", 3000, "Otros", ["Dulce"], "store54-chocolatecofler.jpg"],
            ["Chicles Beldent", "Paquete de chicles surtidos Beldent.", 1500, "Otros", ["Dulce"], "store54-chiclesbeldent.jpg"],
            ["Café Instantáneo en Vaso", "Vaso de café instantáneo para llevar, ideal para el mostrador.", 2000, "Café e Infusiones", ["Desayuno/Merienda"], "store54-cafeinstantaneoenvaso.jpg"]
        ]
    },
    {
        key: "lasvegas",
        nombre: "Las Vegas Food Truck",
        tipoComercio: "FOOD_TRUCK",
        email: "lasvegas@bajonea.com",
        password: "Bajonea2026!",
        telefonoComercio: "+5492964200555",
        direccion: direccion("Plaza de los Onas", 100),
        horarios: horariosDiarios(DIAS_MAR_DOM, "19:00:00", "23:59:00"),
        instagram: "https://www.instagram.com/lasvegas.sanguches/",
        descripcion: "Food truck especializado en sandwiches de lomo, bondiola y milanesa. \"Cuando el hambre habla, nosotros respondemos.\"",
        fotoPerfil: "lasvegas-foto.jpg",
        personaJuridica: {
            razonSocial: "Las Vegas Food Truck",
            cuit: cuit("3071111500"),
            condicionIva: "MONOTRIBUTO",
            tipoSociedad: "EU",
            fechaInicioActividades: "2025-06-01"
        },
        representante: {
            nombre: "Rocio", apellido: "Benitez", dni: "34777555",
            telefono: "+5492964111666", fechaNacimiento: "1993-09-28"
        },
        productos: [
            ["Bondiola Vegas", "Bondiola, jamón y queso gratinado, lechuga, tomate y huevo frito, con dip de salsa alioli.", 23000, "Lomitos", ["Salado"], "lasvegas-bondiolavegas.jpg"],
            ["Lomo a Caballo", "Lomo, jamón y queso gratinado, lechuga, tomate y huevo frito, con dip de salsa alioli.", 26500, "Lomitos", ["Salado"], "lasvegas-lomoacaballo.jpg"],
            ["Lomo Criollo", "Lomo, jamón y queso provolone gratinado, lechuga, tomate y huevo.", 27500, "Lomitos", ["Salado"], "lasvegas-lomocriollo.jpg"],
            ["Lomo Criminal", "Lomo, jamón y queso gratinado, lechuga, tomate y huevo, versión completa.", 32000, "Lomitos", ["Salado"], "lasvegas-lomocriminal.jpg"],
            ["Lomo Clásico", "Lomo, jamón y queso gratinado, tomate y lechuga.", 26500, "Lomitos", ["Salado"], "lasvegas-lomoclasico.jpg"],
            ["Lomo Las Vegas", "Lomo, jamón y queso gratinado, lechuga, tomate y huevo, con dip de salsa alioli, receta especial de la casa.", 30000, "Lomitos", ["Salado"], "lasvegas-lomolasvegas.jpg"],
            ["Mila Clásica", "Milanesa, jamón y queso gratinado, lechuga y tomate.", 24000, "Milanesas", ["Frito"], "lasvegas-milaclasica.jpg"],
            ["Bondiola Clásica", "Bondiola, jamón y queso gratinado, lechuga y tomate.", 21000, "Lomitos", ["Salado"], "lasvegas-bondiolaclasica.jpg"],
            ["Mila Las Vegas", "Milanesa, jamón y queso gratinado, lechuga, tomate y huevo, receta especial de la casa.", 26000, "Milanesas", ["Frito"], "lasvegas-milalasvegas.jpg"],
            ["Mila a Caballo", "Milanesa con queso gratinado, tomate, lechuga y huevo frito, con dip de salsa alioli.", 24000, "Milanesas", ["Frito"], "lasvegas-milaacaballo.jpg"],
            ["Bondiola a Caballo", "Bondiola con queso gratinado, tomate, lechuga y huevo frito, con dip de salsa alioli.", 21000, "Lomitos", ["Salado"], "lasvegas-bondiolaacaballo.jpg"]
        ]
    },
    {
        key: "bigburger",
        nombre: "Big Burger",
        tipoComercio: "EMPRENDIMIENTO",
        email: "bigburger@bajonea.com",
        password: "Bajonea2026!",
        telefonoComercio: "+5492964200666",
        direccion: direccion("Av. San Martín", 804),
        horarios: horariosDiarios(DIAS_TODOS, "20:30:00", "23:59:00"),
        instagram: "https://www.instagram.com/bigburguer__rg/",
        descripcion: "Emprendimiento de hamburguesas artesanales, delivery y retiro. \"No es comida rápida, es BIG.\"",
        fotoPerfil: "bigburger-foto.jpg",
        personaJuridica: {
            razonSocial: "Big Burger",
            cuit: cuit("3071111600"),
            condicionIva: "MONOTRIBUTO",
            tipoSociedad: "EU",
            fechaInicioActividades: "2024-01-15"
        },
        representante: {
            nombre: "Franco", apellido: "Molina", dni: "36888666",
            telefono: "+5492964111777", fechaNacimiento: "1995-04-10"
        },
        productos: [
            ["Cheese Bacon Simple", "Medallón de carne, queso cheddar, panceta y salsa de la casa.", 9500, "Hamburguesas", ["Salado"], "bigburger-cheesebaconsimple.jpg"],
            ["Cheese Bacon Doble", "Doble medallón de carne, queso cheddar, panceta y salsa de la casa.", 15500, "Hamburguesas", ["Salado"], "bigburger-cheesebacondoble.jpg"],
            ["Cheese Bacon Triple", "Triple medallón de carne, queso cheddar, panceta y salsa de la casa.", 19500, "Hamburguesas", ["Salado"], "bigburger-cheesebacontriple.jpg"],
            ["American Doble", "Doble medallón de carne, queso americano, cebolla y pepinillos.", 14000, "Hamburguesas", ["Salado"], "bigburger-americandoble.jpg"],
            ["Cuarto de Libra", "Medallón smash de 115g, queso cheddar y cebolla.", 10500, "Hamburguesas", ["Salado"], "bigburger-cuartodelibra.jpg"],
            ["Big Flamin Hot", "Doble medallón, queso cheddar picante, jalapeños y salsa picante.", 16000, "Hamburguesas", ["Picante"], "bigburger-bigflaminhot.jpg"],
            ["Big Tasty", "Doble medallón, queso cheddar, panceta, lechuga, tomate y salsa tasty.", 17000, "Hamburguesas", ["Salado"], "bigburger-bigtasty.jpg"],
            ["Hamburguesa Clásica", "Medallón de carne, queso, lechuga, tomate y salsa de la casa.", 11000, "Hamburguesas", ["Salado"], "bigburger-hamburguesaclasica.jpg"],
            ["Papas Fritas Big", "Papas fritas clásicas, porción individual.", 6500, "Para Picar", ["Frito"], "bigburger-papasfritasbig.jpg"],
            ["Combo 2 Cheese Bacon Doble Papas y Gaseosa", "Dos Cheese Bacon Doble, papas fritas para compartir y gaseosa en lata.", 34000, "Hamburguesas", ["Combos", "Para Compartir"], "bigburger-combo2cheesebacondoblepapasgaseosa.jpg"]
        ]
    },
    {
        key: "tantesara",
        nombre: "Tante Sara",
        tipoComercio: "CAFETERIA",
        email: "tantesara@bajonea.com",
        password: "Bajonea2026!",
        telefonoComercio: "+5492964200777",
        direccion: direccion("Av. San Martín", 192),
        horarios: horariosDiarios(DIAS_TODOS, "08:00:00", "23:00:00"),
        instagram: "https://www.instagram.com/tantesarariogrande/",
        descripcion: "Restaurante y cafetería familiar con más de 40 años de trayectoria en Río Grande. Cafetería, pastelería, brunch y cocina de restaurante completa.",
        fotoPerfil: "tantesara-foto.jpg",
        personaJuridica: {
            razonSocial: "Tante Sara",
            cuit: cuit("3071111700"),
            condicionIva: "RESPONSABLE_INSCRIPTO",
            tipoSociedad: "EU",
            fechaInicioActividades: "1985-05-01"
        },
        representante: {
            nombre: "Liliana", apellido: "Kowalski", dni: "20999777",
            telefono: "+5492964111888", fechaNacimiento: "1962-01-18"
        },
        productos: [
            ["Espresso", "Café espresso clásico, en taza chica.", 4800, "Café e Infusiones", ["Desayuno/Merienda"], "tantesara-espresso.jpg"],
            ["Café con Leche Grande", "Café con leche, tamaño grande.", 7900, "Café e Infusiones", ["Desayuno/Merienda"], "tantesara-cafeconlechegrande.jpg"],
            ["Chocolate Tante Sara", "Chocolate caliente de la casa.", 11200, "Café e Infusiones", ["Desayuno/Merienda", "Dulce"], "tantesara-chocolatetantesara.jpg"],
            ["Affogato", "Helado de crema americana con espresso.", 10300, "Café e Infusiones", ["Dulce"], "tantesara-affogato.jpg"],
            ["Desayuno Porteño", "Café con leche o té más 3 medialunas Tante Sara.", 12500, "Menú del Día", ["Desayuno/Merienda"], "tantesara-desayunoporteno.jpg"],
            ["Desayuno Saludable", "Yogur con frutas de estación, granola casera y miel, tostadas con queso crema light y mermelada.", 27900, "Menú del Día", ["Desayuno/Merienda", "Light"], "tantesara-desayunosaludable.jpg"],
            ["Desayuno Americano", "Huevos revueltos, panceta crocante, tostadas en pan brioche.", 24000, "Menú del Día", ["Desayuno/Merienda", "Salado"], "tantesara-desayunoamericano.jpg"],
            ["Medialuna", "Medialuna clásica de manteca.", 2160, "Panadería", ["Desayuno/Merienda", "Dulce"], "tantesara-medialuna.jpg"],
            ["Alfajor de Almendras", "Alfajor artesanal relleno de dulce de leche y almendras.", 8100, "Pastelería", ["Dulce"], "tantesara-alfajordealmendras.jpg"],
            ["Porción de Carrot Cake", "Porción de torta de zanahoria con frosting.", 10800, "Pastelería", ["Dulce"], "tantesara-porciondecarrotcake.jpg"],
            ["Club Sandwich", "Pollo grillado, jamón cocido, queso, lomo ahumado, queso cheddar, panceta crocante, huevo duro, mix de hojas verdes, tomate y mayonesa de palta, en pan de campo.", 27900, "Lomitos", ["Salado"], "tantesara-clubsandwich.jpg"],
            ["Avocado Toast", "Tostada de pan de campo con avocado cream, tomates cherry, queso danbo, huevo poché y mix de semillas.", 19800, "Menú del Día", ["Vegetariano"], "tantesara-avocadotoast.jpg"],
            ["Panzottis de Jamón y Mozzarella", "Panzottis en masa de huevo, rellenos de jamón y mozzarella.", 19800, "Pastas", ["Salado"], "tantesara-panzottisdejamonymozzarella.jpg"],
            ["Ravioles de Espinaca y Ricota", "Ravioles en masa de remolacha, rellenos de espinaca y ricota.", 19800, "Pastas", ["Vegetariano"], "tantesara-raviolesdeespinacayricota.jpg"],
            ["Milanesa Napolitana", "Fileto, tomate, jamón, mozzarella y aceite de ajo.", 31300, "Milanesas", ["Frito", "Al Horno"], "tantesara-milanesanapolitana.jpg"],
            ["Guiso de Lentejas", "Con chorizo colorado, panceta, carne y verduras.", 26000, "Comida Casera", ["Salado"], "tantesara-guisodelentejas.jpg"],
            ["Hamburguesa Tante Sara", "Queso cheddar, cebollas crispy, pepinillos agridulces, lechuga y aderezo especial. Acompañada de papas cuña.", 28500, "Hamburguesas", ["Salado"], "tantesara-hamburguesatantesara.jpg"],
            ["Ensalada César con Pollo", "Hojas verdes, croutons, tomate seco, parmesano, aderezo César y pollo.", 26100, "Ensaladas y Bowls", ["Salado"], "tantesara-ensaladacesarconpollo.jpg"],
            ["Tiramisú", "Postre italiano clásico de la casa.", 10500, "Pastelería", ["Dulce"], "tantesara-tiramisu.jpg"],
            ["Baguette de Jamón Crudo", "Queso brie, tomates confitados, rúcula y mermelada de peras.", 21600, "Lomitos", ["Salado"], "tantesara-baguettedejamoncrudo.jpg"]
        ]
    }
];
