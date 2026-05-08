import { PrismaClient, Role, RecipeState, MenuStyle, IdeaStatus } from "@prisma/client";

const prisma = new PrismaClient();

const RESTAURANT_NAME = "Ristorante Marche";
const INVITE_CODE = "MARCHE-A7K2";
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "andrea@ristorantemarche.it";
const ADMIN_NAME = process.env.SEED_ADMIN_NAME ?? "Andrea Conti";

async function main() {
  console.log("Seeding Ristorante Marche…");

  // Idempotency: wipe the demo restaurant if it already exists.
  const existing = await prisma.restaurant.findUnique({ where: { inviteCode: INVITE_CODE } });
  if (existing) {
    console.log("  Found existing demo restaurant, wiping it first.");
    await prisma.menuItem.deleteMany({ where: { menuFolder: { restaurantId: existing.id } } });
    await prisma.menuFolder.deleteMany({ where: { restaurantId: existing.id } });
    await prisma.message.deleteMany({ where: { conversation: { restaurantId: existing.id } } });
    await prisma.conversation.deleteMany({ where: { restaurantId: existing.id } });
    await prisma.idea.deleteMany({ where: { restaurantId: existing.id } });
    await prisma.recipe.deleteMany({ where: { restaurantId: existing.id } });
    await prisma.user.updateMany({ where: { restaurantId: existing.id }, data: { restaurantId: null } });
    await prisma.restaurant.delete({ where: { id: existing.id } });
  }

  // Restaurant ───────────────────────────────────────────────────────
  const restaurant = await prisma.restaurant.create({
    data: {
      name: RESTAURANT_NAME,
      identityLine: "Cocina mediterránea de raíz, técnica francesa, mano japonesa.",
      languageDefault: "es",
      inviteCode: INVITE_CODE,
    },
  });

  // Users ────────────────────────────────────────────────────────────
  const andrea = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: { restaurantId: restaurant.id, role: Role.admin },
    create: {
      email: ADMIN_EMAIL,
      name: ADMIN_NAME,
      bio: "Cocina mediterránea de raíz, técnica francesa.",
      role: Role.admin,
      languagePref: "es",
      defaultModel: "sonnet",
      restaurantId: restaurant.id,
    },
  });
  const marco = await prisma.user.upsert({
    where: { email: "marco@ristorantemarche.it" },
    update: { restaurantId: restaurant.id, role: Role.chef_executive },
    create: {
      email: "marco@ristorantemarche.it",
      name: "Marco Rossi",
      role: Role.chef_executive,
      restaurantId: restaurant.id,
    },
  });
  const luca = await prisma.user.upsert({
    where: { email: "luca@ristorantemarche.it" },
    update: { restaurantId: restaurant.id, role: Role.sous_chef },
    create: {
      email: "luca@ristorantemarche.it",
      name: "Luca Bianchi",
      role: Role.sous_chef,
      restaurantId: restaurant.id,
    },
  });
  await prisma.user.upsert({
    where: { email: "sofia@ristorantemarche.it" },
    update: { restaurantId: restaurant.id, role: Role.viewer },
    create: {
      email: "sofia@ristorantemarche.it",
      name: "Sofia Marchetti",
      role: Role.viewer,
      restaurantId: restaurant.id,
    },
  });

  // Recipes ──────────────────────────────────────────────────────────
  // The five originales de project/data.jsx + tres "stub" para que los
  // platos de m2/m3 puedan referenciar recetas reales (decisión sec. 4
  // del brief: una receta vive solo en Recipe; los menús referencian).
  const pichon = await prisma.recipe.create({
    data: {
      restaurantId: restaurant.id,
      authorId: andrea.id,
      title: "Pichón con espuma de café y rábano negro",
      state: RecipeState.draft,
      version: 1,
      priority: false,
      contentJson: {
        ingredients: [
          "1 pichón entero, madurado 4 días",
          "60 g café arábica recién molido (extracción cold brew, 14 h)",
          "1 rábano negro, en láminas 1 mm",
          "Manteca clarificada, 30 g",
          "Sal Maldon, pimienta de Sichuan tostada",
        ],
        method: [
          "Sellar la pechuga sobre la piel con manteca clarificada, 2 min, retirar y reposar.",
          "Para la espuma: cargar el sifón con 200 ml de cold brew + 80 ml de nata 35% + 1 hoja gelatina hidratada. Dos cargas N₂O.",
          "Asar el pichón a 58 °C 18 min, glasear los últimos 90 s con jugo reducido.",
          "Montar: pétalos de rábano, pechuga laminada, espuma de café tibia, sal Maldon.",
        ],
        notes: "El cold brew aporta amargor sin astringencia: el café hervido lo arruina. Probar con arábica de Etiopía para nota de cítrico.",
      },
    },
  });

  const tartar = await prisma.recipe.create({
    data: {
      restaurantId: restaurant.id,
      authorId: andrea.id,
      title: "Tartar de gamba roja, dashi de tomate verde",
      state: RecipeState.in_test,
      version: 1,
      priority: true,
      contentJson: {
        ingredients: [
          "Gamba roja de Dénia, 4 unidades",
          "Tomate verde, 300 g (clarificado en frío 12 h)",
          "Alga kombu, 8 g",
          "Bonito seco, 12 g",
          "Aceite de oliva arbequina",
        ],
        method: [
          "Clarificar el tomate verde en cámara, agar al 0.2%.",
          "Hacer dashi tradicional con kombu y bonito; mezclar 1:1 con tomate clarificado.",
          "Tartar a cuchillo, sazonar con sal y oliva.",
          "Servir el dashi templado al lado, ratio 30 ml por comensal.",
        ],
        notes: "El dashi-tomate no debe pasar 50 °C o pierde el aroma vegetal.",
      },
    },
  });

  const risotto = await prisma.recipe.create({
    data: {
      restaurantId: restaurant.id,
      authorId: marco.id,
      title: "Risotto al limón quemado",
      state: RecipeState.approved,
      version: 1,
      priority: false,
      approvedById: andrea.id,
      approvedAt: new Date(),
      contentJson: {
        ingredients: [
          "Arroz Carnaroli, 320 g",
          "Limón Amalfi, 3 unidades (piel quemada al binchotan)",
          "Bottarga di Cabras, c/n",
          "Manteca de cacao desodorizada, 30 g",
          "Caldo de pescado de roca, 1.2 L",
        ],
        method: [
          "Tostar el arroz en seco, mojar con caldo en 4 tandas (mantecar al final con manteca de cacao).",
          "Quemar la piel de limón con soplete hasta caramelo oscuro, infusionar 8 min en aceite tibio.",
          "Rallar bottarga al pase, finalizar con aceite de limón quemado.",
        ],
        notes: "La manteca de cacao da brillo sin lácteo; el plato resiste vegano si se ajusta el caldo.",
      },
    },
  });

  const cordero = await prisma.recipe.create({
    data: {
      restaurantId: restaurant.id,
      authorId: marco.id,
      title: "Cordero lechal a la sal de hierbas",
      state: RecipeState.approved,
      version: 1,
      priority: false,
      approvedById: andrea.id,
      approvedAt: new Date(),
      contentJson: { ingredients: [], method: [], notes: "" },
    },
  });

  await prisma.recipe.create({
    data: {
      restaurantId: restaurant.id,
      authorId: andrea.id,
      title: "Helado de pan tostado y miel de romero",
      state: RecipeState.draft,
      version: 1,
      priority: false,
      contentJson: { ingredients: [], method: [], notes: "" },
    },
  });

  // Recetas auxiliares para los platos del prototipo en m2 y m3.
  const brodetto = await prisma.recipe.create({
    data: {
      restaurantId: restaurant.id,
      authorId: marco.id,
      title: "Brodetto del puerto",
      state: RecipeState.approved,
      version: 1,
      approvedById: andrea.id,
      approvedAt: new Date(),
      contentJson: { ingredients: [], method: [], notes: "Pescados de roca, tomate confit, pan de pueblo." },
    },
  });
  const olivas = await prisma.recipe.create({
    data: {
      restaurantId: restaurant.id,
      authorId: luca.id,
      title: "Olivas all'ascolana",
      state: RecipeState.approved,
      version: 1,
      approvedById: andrea.id,
      approvedAt: new Date(),
      contentJson: { ingredients: [], method: [], notes: "Carne de ternera, parmigiano 24 meses." },
    },
  });
  const pastaDelDia = await prisma.recipe.create({
    data: {
      restaurantId: restaurant.id,
      authorId: luca.id,
      title: "Pasta del día",
      state: RecipeState.approved,
      version: 1,
      approvedById: andrea.id,
      approvedAt: new Date(),
      contentJson: { ingredients: [], method: [], notes: "Según mercado." },
    },
  });

  // Ideas ────────────────────────────────────────────────────────────
  await prisma.idea.createMany({
    data: [
      {
        restaurantId: restaurant.id,
        authorId: andrea.id,
        text: "Pichón con espuma de café y rábano negro",
        status: IdeaStatus.open,
      },
      {
        restaurantId: restaurant.id,
        authorId: andrea.id,
        text: "Tartar de gamba roja con dashi de tomate verde",
        status: IdeaStatus.in_chat,
      },
      {
        restaurantId: restaurant.id,
        authorId: andrea.id,
        text: "Risotto al limón quemado, raspadura de bottarga",
        status: IdeaStatus.open,
      },
    ],
  });

  // Menus ────────────────────────────────────────────────────────────
  const m1 = await prisma.menuFolder.create({
    data: {
      restaurantId: restaurant.id,
      name: "Menú degustación",
      season: "Otoño 2026",
      presentationStyle: MenuStyle.elegant,
    },
  });
  await prisma.menuItem.createMany({
    data: [
      {
        menuFolderId: m1.id,
        recipeId: tartar.id,
        customDesc: "Gamba de Dénia, dashi tibio, oliva arbequina",
        price: 2800,
        order: 0,
      },
      {
        menuFolderId: m1.id,
        recipeId: risotto.id,
        customDesc: "Carnaroli, manteca de cacao, bottarga di Cabras",
        price: 2400,
        order: 1,
      },
      {
        menuFolderId: m1.id,
        recipeId: pichon.id,
        customName: "Pichón, espuma de café, rábano negro",
        customDesc: "Cold brew de Etiopía, glaseado al pase",
        price: 3600,
        order: 2,
      },
      {
        menuFolderId: m1.id,
        recipeId: cordero.id,
        customDesc: "Costra de tomillo y romero, jugo reducido",
        price: 3200,
        order: 3,
      },
    ],
  });

  const m2 = await prisma.menuFolder.create({
    data: {
      restaurantId: restaurant.id,
      name: "Cocina del Adriático",
      season: "Carta",
      presentationStyle: MenuStyle.rustic,
    },
  });
  await prisma.menuItem.createMany({
    data: [
      {
        menuFolderId: m2.id,
        recipeId: brodetto.id,
        customDesc: "Pescados de roca, tomate confit, pan de pueblo",
        price: 2200,
        order: 0,
      },
      {
        menuFolderId: m2.id,
        recipeId: olivas.id,
        customDesc: "Carne de ternera, parmigiano 24 meses",
        price: 900,
        order: 1,
      },
    ],
  });

  const m3 = await prisma.menuFolder.create({
    data: {
      restaurantId: restaurant.id,
      name: "Menú de mediodía",
      season: "Servicio del día",
      presentationStyle: MenuStyle.minimal,
    },
  });
  await prisma.menuItem.create({
    data: {
      menuFolderId: m3.id,
      recipeId: pastaDelDia.id,
      customDesc: "Según mercado",
      price: 1400,
      order: 0,
    },
  });

  console.log("Seed complete:");
  console.log(`  ${restaurant.name} (invite code: ${restaurant.inviteCode})`);
  console.log(`  4 users, 8 recipes, 3 ideas, 3 menus.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
