const stripDiacritics = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[œŒ]/g, "oe")
    .replace(/[æÆ]/g, "ae");

const normalizeFoodKey = (value) =>
  stripDiacritics(value)
    .toLowerCase()
    .replace(/[’']/g, " ")
    .replace(/[(),/.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const baseTranslations = {
  "eau gazeuse": {
    en: "Sparkling water",
    es: "Agua con gas",
    de: "Sprudelwasser",
    it: "Acqua frizzante",
    ar: "مياه غازية",
    ru: "Газированная вода",
  },
  "eau minerale": {
    en: "Mineral water",
    es: "Agua mineral",
    de: "Mineralwasser",
    it: "Acqua minerale",
    ar: "مياه معدنية",
    ru: "Минеральная вода",
  },
  "eau de source": {
    en: "Spring water",
    es: "Agua de manantial",
    de: "Quellwasser",
    it: "Acqua di sorgente",
    ar: "مياه نبع",
    ru: "Родниковая вода",
  },
  eau: { en: "Water", es: "Agua", de: "Wasser", it: "Acqua", ar: "ماء", ru: "Вода" },
  "boisson a l avoine": {
    en: "Oat drink",
    es: "Bebida de avena",
    de: "Haferdrink",
    it: "Bevanda all'avena",
    ar: "مشروب الشوفان",
    ru: "Овсяный напиток",
  },
  "boisson a l amande": {
    en: "Almond drink",
    es: "Bebida de almendra",
    de: "Mandeldrink",
    it: "Bevanda alla mandorla",
    ar: "مشروب اللوز",
    ru: "Миндальный напиток",
  },
  "boisson au riz": {
    en: "Rice drink",
    es: "Bebida de arroz",
    de: "Reisdrink",
    it: "Bevanda di riso",
    ar: "مشروب الأرز",
    ru: "Рисовый напиток",
  },
  "boisson a la noix de coco": {
    en: "Coconut drink",
    es: "Bebida de coco",
    de: "Kokosdrink",
    it: "Bevanda al cocco",
    ar: "مشروب جوز الهند",
    ru: "Кокосовый напиток",
  },
  "boisson au soja": {
    en: "Soy drink",
    es: "Bebida de soja",
    de: "Sojadrink",
    it: "Bevanda di soia",
    ar: "مشروب الصويا",
    ru: "Соевый напиток",
  },
  "boisson vegetale": {
    en: "Plant-based drink",
    es: "Bebida vegetal",
    de: "Pflanzendrink",
    it: "Bevanda vegetale",
    ar: "مشروب نباتي",
    ru: "Растительный напиток",
  },
  "muesli aux fruits": {
    en: "Fruit muesli",
    es: "Muesli con frutas",
    de: "Fruchtmüsli",
    it: "Muesli alla frutta",
    ar: "موسلي بالفواكه",
    ru: "Мюсли с фруктами",
  },
  "muesli floconneux aux fruits": {
    en: "Flaked fruit muesli",
    es: "Muesli en copos con frutas",
    de: "Flockenmüsli mit Früchten",
    it: "Muesli in fiocchi alla frutta",
    ar: "موسلي رقائق بالفواكه",
    ru: "Хлопьевое мюсли с фруктами",
  },
  "muesli croustillant aux fruits": {
    en: "Crunchy fruit muesli",
    es: "Muesli crujiente con frutas",
    de: "Knuspermüsli mit Früchten",
    it: "Muesli croccante alla frutta",
    ar: "موسلي مقرمش بالفواكه",
    ru: "Хрустящие мюсли с фруктами",
  },
  "muesli aux graines": {
    en: "Seed muesli",
    es: "Muesli con semillas",
    de: "Körnermüsli",
    it: "Muesli ai semi",
    ar: "موسلي بالبذور",
    ru: "Мюсли с семенами",
  },
  granola: { en: "Granola", es: "Granola", de: "Granola", it: "Granola", ar: "جرانولا", ru: "Гранола" },
  "flocons d avoine": {
    en: "Oat flakes",
    es: "Copos de avena",
    de: "Haferflocken",
    it: "Fiocchi d'avena",
    ar: "رقائق الشوفان",
    ru: "Овсяные хлопья",
  },
  "riz souffle nature": {
    en: "Plain puffed rice",
    es: "Arroz inflado natural",
    de: "Natur-Puffreis",
    it: "Riso soffiato al naturale",
    ar: "أرز منفوش طبيعي",
    ru: "Воздушный рис без добавок",
  },
  "cereales nature sans sucres ajoutes": {
    en: "Plain cereals with no added sugar",
    es: "Cereales naturales sin azúcares añadidos",
    de: "Natur-Cerealien ohne Zuckerzusatz",
    it: "Cereali naturali senza zuccheri aggiunti",
    ar: "حبوب طبيعية بدون سكر مضاف",
    ru: "Натуральные хлопья без добавления сахара",
  },
  "cereales nature sucrees": {
    en: "Sweetened plain cereals",
    es: "Cereales naturales azucarados",
    de: "Gezuckerte Natur-Cerealien",
    it: "Cereali naturali zuccherati",
    ar: "حبوب طبيعية محلاة",
    ru: "Подслащенные натуральные хлопья",
  },
  "cereales nature": {
    en: "Plain cereals",
    es: "Cereales naturales",
    de: "Natur-Cerealien",
    it: "Cereali naturali",
    ar: "حبوب طبيعية",
    ru: "Натуральные хлопья",
  },
  "cereales du petit dejeuner": {
    en: "Breakfast cereals",
    es: "Cereales de desayuno",
    de: "Frühstückscerealien",
    it: "Cereali per la colazione",
    ar: "حبوب الإفطار",
    ru: "Хлопья для завтрака",
  },
  "cereales petit dejeuner tres riches en fibres": {
    en: "Very high-fibre breakfast cereals",
    es: "Cereales de desayuno muy ricos en fibra",
    de: "Sehr ballaststoffreiche Frühstückscerealien",
    it: "Cereali per la colazione molto ricchi di fibre",
    ar: "حبوب إفطار غنية جداً بالألياف",
    ru: "Хлопья для завтрака с очень высоким содержанием клетчатки",
  },
  "cereales petit dejeuner riches en fibres nature": {
    en: "High-fibre plain breakfast cereals",
    es: "Cereales de desayuno naturales ricos en fibra",
    de: "Ballaststoffreiche Natur-Frühstückscerealien",
    it: "Cereali naturali per la colazione ricchi di fibre",
    ar: "حبوب إفطار طبيعية غنية بالألياف",
    ru: "Натуральные хлопья для завтрака с высоким содержанием клетчатки",
  },
  "cereales petit dejeuner riches en fibres": {
    en: "High-fibre breakfast cereals",
    es: "Cereales de desayuno ricos en fibra",
    de: "Ballaststoffreiche Frühstückscerealien",
    it: "Cereali per la colazione ricchi di fibre",
    ar: "حبوب إفطار غنية بالألياف",
    ru: "Хлопья для завтрака с высоким содержанием клетчатки",
  },
  "cereales petit dejeuner nature": {
    en: "Plain breakfast cereals",
    es: "Cereales de desayuno naturales",
    de: "Natur-Frühstückscerealien",
    it: "Cereali naturali per la colazione",
    ar: "حبوب إفطار طبيعية",
    ru: "Натуральные хлопья для завтрака",
  },
  "riz cuit": {
    en: "Cooked rice",
    es: "Arroz cocido",
    de: "Gekochter Reis",
    it: "Riso cotto",
    ar: "أرز مطبوخ",
    ru: "Вареный рис",
  },
  "riz basmati cuit": {
    en: "Cooked basmati rice",
    es: "Arroz basmati cocido",
    de: "Gekochter Basmatireis",
    it: "Riso basmati cotto",
    ar: "أرز بسمتي مطبوخ",
    ru: "Вареный рис басмати",
  },
  "riz complet cuit": {
    en: "Cooked brown rice",
    es: "Arroz integral cocido",
    de: "Gekochter Vollkornreis",
    it: "Riso integrale cotto",
    ar: "أرز بني مطبوخ",
    ru: "Вареный бурый рис",
  },
  "quinoa cuit": {
    en: "Cooked quinoa",
    es: "Quinoa cocida",
    de: "Gekochter Quinoa",
    it: "Quinoa cotta",
    ar: "كينوا مطبوخة",
    ru: "Вареная киноа",
  },
  "pates cuites": {
    en: "Cooked pasta",
    es: "Pasta cocida",
    de: "Gekochte Nudeln",
    it: "Pasta cotta",
    ar: "معكرونة مطبوخة",
    ru: "Вареная паста",
  },
  "semoule cuite": {
    en: "Cooked semolina",
    es: "Sémola cocida",
    de: "Gekochter Grieß",
    it: "Semola cotta",
    ar: "سميد مطبوخ",
    ru: "Вареная манная крупа",
  },
  "boulgour cuit": {
    en: "Cooked bulgur",
    es: "Bulgur cocido",
    de: "Gekochter Bulgur",
    it: "Bulgur cotto",
    ar: "برغل مطبوخ",
    ru: "Вареный булгур",
  },
  "vermicelle de riz": {
    en: "Rice vermicelli",
    es: "Fideos de arroz",
    de: "Reisnudeln",
    it: "Vermicelli di riso",
    ar: "شعيرية الأرز",
    ru: "Рисовая вермишель",
  },
  "vermicelle de riz cuite": {
    en: "Cooked rice vermicelli",
    es: "Fideos de arroz cocidos",
    de: "Gekochte Reisnudeln",
    it: "Vermicelli di riso cotti",
    ar: "شعيرية أرز مطبوخة",
    ru: "Вареная рисовая вермишель",
  },
  "pomme de terre": {
    en: "Potato",
    es: "Patata",
    de: "Kartoffel",
    it: "Patata",
    ar: "بطاطس",
    ru: "Картофель",
  },
  "pois chiche": {
    en: "Chickpeas",
    es: "Garbanzos",
    de: "Kichererbsen",
    it: "Ceci",
    ar: "حمص",
    ru: "Нут",
  },
  "champignons de paris": {
    en: "Button mushrooms",
    es: "Champiñones de París",
    de: "Champignons",
    it: "Champignon",
    ar: "فطر باريس",
    ru: "Шампиньоны",
  },
  "betterave rouge": {
    en: "Beetroot",
    es: "Remolacha roja",
    de: "Rote Bete",
    it: "Barbabietola rossa",
    ar: "شمندر أحمر",
    ru: "Свекла",
  },
  epinard: {
    en: "Spinach",
    es: "Espinaca",
    de: "Spinat",
    it: "Spinaci",
    ar: "سبانخ",
    ru: "Шпинат",
  },
  courgette: {
    en: "Zucchini",
    es: "Calabacín",
    de: "Zucchini",
    it: "Zucchina",
    ar: "كوسة",
    ru: "Кабачок",
  },
  "courgette rotie": {
    en: "Roasted zucchini",
    es: "Calabacín asado",
    de: "Gebratene Zucchini",
    it: "Zucchina arrostita",
    ar: "كوسة مشوية",
    ru: "Запеченный кабачок",
  },
  "poivron rouge": {
    en: "Red bell pepper",
    es: "Pimiento rojo",
    de: "Rote Paprika",
    it: "Peperone rosso",
    ar: "فلفل أحمر",
    ru: "Красный перец",
  },
  "haricot vert": {
    en: "Green beans",
    es: "Judías verdes",
    de: "Grüne Bohnen",
    it: "Fagiolini",
    ar: "فاصوليا خضراء",
    ru: "Зеленая фасоль",
  },
  "haricot mungo": {
    en: "Mung beans",
    es: "Frijol mungo",
    de: "Mungbohnen",
    it: "Fagioli mungo",
    ar: "فاصوليا مونغ",
    ru: "Маш",
  },
  "haricot mungo frais cuit": {
    en: "Cooked fresh mung beans",
    es: "Frijol mungo fresco cocido",
    de: "Gekochte frische Mungbohnen",
    it: "Fagioli mungo freschi cotti",
    ar: "فاصوليا مونغ طازجة مطبوخة",
    ru: "Вареный свежий маш",
  },
  "brocoli cuit": {
    en: "Cooked broccoli",
    es: "Brócoli cocido",
    de: "Gekochter Brokkoli",
    it: "Broccoli cotti",
    ar: "بروكلي مطبوخ",
    ru: "Вареная брокколи",
  },
  brocoli: {
    en: "Broccoli",
    es: "Brócoli",
    de: "Brokkoli",
    it: "Broccoli",
    ar: "بروكلي",
    ru: "Брокколи",
  },
  "chou rave": {
    en: "Kohlrabi",
    es: "Colirrábano",
    de: "Kohlrabi",
    it: "Cavolo rapa",
    ar: "كرنب اللفت",
    ru: "Кольраби",
  },
  carotte: { en: "Carrot", es: "Zanahoria", de: "Karotte", it: "Carota", ar: "جزر", ru: "Морковь" },
  endive: { en: "Endive", es: "Endibia", de: "Endivie", it: "Indivia", ar: "هندباء", ru: "Эндивий" },
  "brocoli ou chou romanesco": {
    en: "Broccoli or Romanesco cabbage",
    es: "Brócoli o col romanesco",
    de: "Brokkoli oder Romanesco",
    it: "Broccoli o cavolo romanesco",
    ar: "بروكلي أو كرنب رومانسكو",
    ru: "Брокколи или романеско",
  },
  "endive rotie": {
    en: "Roasted endive",
    es: "Endibia asada",
    de: "Gebratene Endivie",
    it: "Indivia arrostita",
    ar: "هندباء مشوية",
    ru: "Запеченный эндивий",
  },
  poulet: { en: "Chicken", es: "Pollo", de: "Hähnchen", it: "Pollo", ar: "دجاج", ru: "Курица" },
  "poulet cuisse viande bouillie cuite a l eau": {
    en: "Chicken thigh, boiled/cooked in water",
    es: "Muslo de pollo, hervido/cocido en agua",
    de: "Hähnchenschenkel, gekocht/in Wasser gegart",
    it: "Coscia di pollo bollita/cotta in acqua",
    ar: "فخذ دجاج مسلوق/مطبوخ في الماء",
    ru: "Куриное бедро, вареное/приготовленное в воде",
  },
  dinde: { en: "Turkey", es: "Pavo", de: "Pute", it: "Tacchino", ar: "ديك رومي", ru: "Индейка" },
  agneau: { en: "Lamb", es: "Cordero", de: "Lamm", it: "Agnello", ar: "لحم ضأن", ru: "Баранина" },
  "filet de porc": {
    en: "Pork tenderloin",
    es: "Solomillo de cerdo",
    de: "Schweinefilet",
    it: "Filetto di maiale",
    ar: "فيليه لحم خنزير",
    ru: "Свиная вырезка",
  },
  lieu: { en: "Pollock", es: "Carbonero", de: "Köhler", it: "Merluzzo nero", ar: "سمك بولوك", ru: "Сайда" },
  merlu: { en: "Hake", es: "Merluza", de: "Seehecht", it: "Nasello", ar: "نازلي", ru: "Хек" },
  cabillaud: { en: "Cod", es: "Bacalao", de: "Kabeljau", it: "Merluzzo", ar: "قد", ru: "Треска" },
  colin: { en: "Pollock", es: "Abadejo", de: "Seelachs", it: "Merluzzo carbonaro", ar: "بولاك", ru: "Минтай" },
  saumon: { en: "Salmon", es: "Salmón", de: "Lachs", it: "Salmone", ar: "سلمون", ru: "Лосось" },
  thon: { en: "Tuna", es: "Atún", de: "Thunfisch", it: "Tonno", ar: "تونة", ru: "Тунец" },
  beurre: { en: "Butter", es: "Mantequilla", de: "Butter", it: "Burro", ar: "زبدة", ru: "Сливочное масло" },
  margarine: { en: "Margarine", es: "Margarina", de: "Margarine", it: "Margarina", ar: "مارغرين", ru: "Маргарин" },
  "lait demi ecreme": {
    en: "Semi-skimmed milk",
    es: "Leche semidesnatada",
    de: "Halbfettmilch",
    it: "Latte parzialmente scremato",
    ar: "حليب نصف دسم",
    ru: "Полуобезжиренное молоко",
  },
  "lait entier": { en: "Whole milk", es: "Leche entera", de: "Vollmilch", it: "Latte intero", ar: "حليب كامل الدسم", ru: "Цельное молоко" },
  "lait ecreme": { en: "Skimmed milk", es: "Leche desnatada", de: "Magermilch", it: "Latte scremato", ar: "حليب خالي الدسم", ru: "Обезжиренное молоко" },
  "yaourt vegetal sans soja": {
    en: "Soy-free plant-based yogurt",
    es: "Yogur vegetal sin soja",
    de: "Pflanzlicher Joghurt ohne Soja",
    it: "Yogurt vegetale senza soia",
    ar: "زبادي نباتي بدون صويا",
    ru: "Растительный йогурт без сои",
  },
  "yaourt vegetal au soja": {
    en: "Soy plant-based yogurt",
    es: "Yogur vegetal de soja",
    de: "Pflanzlicher Sojajoghurt",
    it: "Yogurt vegetale di soia",
    ar: "زبادي نباتي بالصويا",
    ru: "Растительный соевый йогурт",
  },
  "omelette aux champignons faite maison": {
    en: "Homemade mushroom omelette",
    es: "Tortilla de champiñones casera",
    de: "Hausgemachtes Pilzomelett",
    it: "Omelette ai funghi fatta in casa",
    ar: "عجة فطر منزلية",
    ru: "Домашний омлет с грибами",
  },
  "omelette norvegienne": {
    en: "Baked Alaska",
    es: "Tortilla noruega",
    de: "Omelette Surprise",
    it: "Omelette norvegese",
    ar: "أومليت نرويجية",
    ru: "Омлет норвежский",
  },
  pomme: { en: "Apple", es: "Manzana", de: "Apfel", it: "Mela", ar: "تفاح", ru: "Яблоко" },
  banane: { en: "Banana", es: "Plátano", de: "Banane", it: "Banana", ar: "موز", ru: "Банан" },
  poire: { en: "Pear", es: "Pera", de: "Birne", it: "Pera", ar: "كمثرى", ru: "Груша" },
  kiwi: { en: "Kiwi", es: "Kiwi", de: "Kiwi", it: "Kiwi", ar: "كيوي", ru: "Киви" },
  orange: { en: "Orange", es: "Naranja", de: "Orange", it: "Arancia", ar: "برتقال", ru: "Апельсин" },
  clementine: { en: "Clementine", es: "Clementina", de: "Clementine", it: "Clementina", ar: "كلمنتين", ru: "Клементин" },
  fraises: { en: "Strawberries", es: "Fresas", de: "Erdbeeren", it: "Fragole", ar: "فراولة", ru: "Клубника" },
  raisin: { en: "Grapes", es: "Uvas", de: "Trauben", it: "Uva", ar: "عنب", ru: "Виноград" },
};

const objectiveTranslations = {
  "reequilibrage alimentaire": {
    en: "Nutritional rebalancing",
    es: "Reequilibrio alimentario",
    de: "Ernährungsumstellung",
    it: "Riequilibrio alimentare",
    ar: "إعادة توازن غذائي",
    ru: "Коррекция питания",
  },
  "perte de poids": {
    en: "Weight loss",
    es: "Pérdida de peso",
    de: "Gewichtsverlust",
    it: "Perdita di peso",
    ar: "فقدان الوزن",
    ru: "Снижение веса",
  },
  "prise de masse": {
    en: "Muscle gain",
    es: "Ganancia de masa",
    de: "Muskelaufbau",
    it: "Aumento di massa",
    ar: "زيادة الكتلة العضلية",
    ru: "Набор массы",
  },
  "maintien": {
    en: "Maintenance",
    es: "Mantenimiento",
    de: "Erhaltung",
    it: "Mantenimento",
    ar: "الحفاظ",
    ru: "Поддержание",
  },
};

export const translateNutritionObjective = (name, language = "fr") => {
  const lang = String(language || "fr").split("-")[0];
  if (!name || lang === "fr") return name;

  const raw = String(name).trim();
  const key = normalizeFoodKey(raw);
  return objectiveTranslations[key]?.[lang] || raw;
};

const suffixTranslations = {
  "sans sel ajoute": { en: "without added salt", es: "sin sal añadida", de: "ohne Salzzusatz", it: "senza sale aggiunto", ar: "بدون ملح مضاف", ru: "без добавления соли" },
  "sans gluten": { en: "gluten-free", es: "sin gluten", de: "glutenfrei", it: "senza glutine", ar: "خالٍ من الغلوتين", ru: "без глютена" },
};

export const translateNutritionFoodName = (name, language = "fr") => {
  const lang = String(language || "fr").split("-")[0];
  if (!name || lang === "fr") return name;

  const raw = String(name).trim();
  const key = normalizeFoodKey(raw);
  const direct = baseTranslations[key]?.[lang];
  if (direct) return direct;

  const suffix = Object.entries(suffixTranslations).find(([source]) => key.endsWith(source));
  if (suffix) {
    const [source, translations] = suffix;
    const baseKey = key.slice(0, -source.length).trim();
    const base = baseTranslations[baseKey]?.[lang];
    if (base && translations[lang]) return `${base} ${translations[lang]}`;
  }

  const partial = Object.entries(baseTranslations)
    .filter(([source]) => source.length >= 6 && key.includes(source))
    .sort((a, b) => b[0].length - a[0].length)[0];

  return partial?.[1]?.[lang] || raw;
};
