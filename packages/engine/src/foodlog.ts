/**
 * Reads what someone ate from everyday text, in Roman Urdu or English:
 *   "2 roti aur ek katori daal, 1 cup chai"  →  2 medium roti, 1 katori daal masoor, 1 cup chai
 *
 * Plain rules, no AI: split the text into items, read the amount ("2", "do", "aadha", "1/2"), the portion
 * ("katori", "plate", "glass") and the size ("bari", "small"), then match the food by its name, its Roman Urdu
 * name and common spellings, longest match first. Small typos are allowed. Anything not recognised is
 * returned as `unknown`, never guessed, so the app can ask the person to pick the food.
 */
import type { Food, MealSlot, Nutrients, Portion, PortionUnit } from "@wellpath/shared";
import { nutrientsFor, sumNutrients } from "./nutrition";

export type LogFood = Pick<Food, "slug" | "name" | "nameRoman" | "per100g" | "portions">;

export type ReadItem = {
  slug: string;
  name: string;
  /** How many of the portion's single unit, such as 2 (roti) or 0.5 (plate). */
  quantity: number;
  portionIndex: number;
  /** Ready to show: "2 medium roti", "½ plate", "10 almonds". */
  amount: string;
  grams: number;
  nutrients: Nutrients;
  /** "close" when a small spelling difference was allowed, so the app can ask "did you mean". */
  match: "exact" | "close";
  /** The words this item was read from. */
  text: string;
  /** Set when the portion word did not fit this food, so its usual portion was used instead. */
  note?: string;
};

/** `water` is glasses of water mentioned ("2 glass pani"), for the water tracker rather than the food log. */
export type FoodTextResult = { items: ReadItem[]; unknown: string[]; slot?: MealSlot; water?: number; totals: Nutrients };

/* ---------- words ---------- */

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, ek: 1, aik: 1, ik: 1,
  two: 2, do: 2, three: 3, teen: 3, tin: 3, four: 4, char: 4, chaar: 4, five: 5, panch: 5, paanch: 5,
  six: 6, chay: 6, chhe: 6, che: 6, seven: 7, saat: 7, sat: 7, eight: 8, aath: 8, ath: 8, nine: 9, nau: 9, no: 9,
  ten: 10, das: 10, eleven: 11, gyarah: 11, twelve: 12, barah: 12,
  half: 0.5, aadha: 0.5, adha: 0.5, aadhi: 0.5, adhi: 0.5, aadhe: 0.5,
  dedh: 1.5, derh: 1.5, dairh: 1.5, dhai: 2.5, dhaai: 2.5, arhai: 2.5, adhai: 2.5, arhaai: 2.5,
  quarter: 0.25, pao: 0.25, paao: 0.25,
};
// "no" counts as nine only before a portion or food ("no roti" is rare); "chai no sugar" is handled as a food name.
delete NUMBER_WORDS.no;

const UNIT_WORDS: Record<string, PortionUnit> = {
  katori: "katori", katoriyan: "katori", katoriyon: "katori", katorey: "katori", katoray: "katori",
  plate: "plate", plates: "plate", pleit: "plate", plet: "plate",
  glass: "glass", glasses: "glass", gilas: "glass", gilaas: "glass", glas: "glass",
  cup: "cup", cups: "cup", kap: "cup", pyali: "cup", piyali: "cup", pyala: "cup", piyala: "cup", mug: "cup",
  bowl: "bowl", bowls: "bowl", pyalay: "bowl",
  slice: "slice", slices: "slice", tukra: "slice", tukray: "slice", tukre: "slice",
  piece: "piece", pieces: "piece", pc: "piece", pcs: "piece", adad: "piece", dana: "piece", daane: "piece", dane: "piece",
  handful: "handful", handfuls: "handful", mutthi: "handful", muthi: "handful", mutthiyan: "handful",
  tbsp: "tbsp", tablespoon: "tbsp", tablespoons: "tbsp", chamach: "tbsp", chamchay: "tbsp", chamche: "tbsp", spoon: "tbsp", spoons: "tbsp",
  g: "gram", gm: "gram", gms: "gram", gram: "gram", grams: "gram", gramm: "gram",
};

/** Portion units that can stand in for each other when a food lacks the one named. */
const UNIT_FAMILY: Partial<Record<PortionUnit, PortionUnit[]>> = {
  katori: ["bowl"], bowl: ["katori"], cup: ["glass"], glass: ["cup"], piece: ["slice", "roti"], slice: ["piece"],
};

const SIZE_WORDS: Record<string, "small" | "medium" | "large"> = {
  small: "small", chota: "small", choti: "small", chotay: "small", chotey: "small", chhota: "small", chhoti: "small",
  medium: "medium", darmiyana: "medium", darmiyani: "medium",
  large: "large", big: "large", bara: "large", bari: "large", baray: "large", baday: "large", bada: "large", badi: "large",
};

const SLOT_WORDS: Record<string, MealSlot> = {
  breakfast: "breakfast", nashta: "breakfast", nashtay: "breakfast", nashte: "breakfast", subah: "breakfast", morning: "breakfast",
  lunch: "lunch", dopahar: "lunch", dophar: "lunch", dopehar: "lunch", dopeher: "lunch",
  snack: "snack", snacks: "snack", shaam: "snack", sham: "snack", evening: "snack",
  dinner: "dinner", raat: "dinner", rat: "dinner", supper: "dinner", night: "dinner",
};

/** Water is tracked in glasses, not logged as food. */
const WATER_WORDS = new Set(["pani", "water", "pany"]);

/** Words that carry no meaning here ("maine 2 roti khayi" → "2 roti"). */
const FILLERS = new Set([
  "ki", "ka", "ke", "ko", "wala", "wali", "wale", "walay", "of", "the", "mein", "me", "mai", "main", "maine", "ne", "aaj", "today",
  "i", "had", "have", "ate", "eat", "drank", "drink", "my", "for", "some", "thora", "thori", "thoda", "thodi", "sirf", "bas", "x",
  "khaya", "khayi", "khaye", "khai", "kha", "liya", "li", "liye", "piya", "pi", "pee", "pia", "kiya", "hai", "tha", "thi", "in", "at",
]);

/** Common spellings and other names, on top of each food's name and Roman Urdu name. */
const ALIASES: Record<string, string[]> = {
  roti: ["rotiyan", "rotian", "chapati", "chapatti", "phulka", "rotis"],
  paratha: ["parathay", "parathe", "parontha"],
  "aloo-paratha": ["aloo ka paratha", "alu paratha"],
  naan: ["nan", "naans"],
  "wholewheat-bread": ["bread", "double roti", "toast", "brown bread"],
  puri: ["poori", "puriyan"],
  "boiled-rice": ["chawal", "chawel", "chaawal", "rice", "white rice", "plain rice", "sada chawal"],
  "brown-rice": ["brown rice"],
  "chicken-biryani": ["biryani", "biriyani"],
  "vegetable-pulao": ["pulao", "pullao", "veg pulao"],
  khichdi: ["khichri"],
  "daal-masoor": ["daal", "dal", "dhal", "masoor", "masoor daal", "lentils", "lentil"],
  "daal-chana": ["chana daal", "chana dal", "chane ki daal"],
  "daal-mash": ["mash daal", "maash", "mash"],
  cholay: ["chole", "chanay", "chane", "chana", "chickpeas", "channay"],
  rajma: ["kidney beans"],
  bhindi: ["okra", "bhindi masala"],
  palak: ["saag", "spinach"],
  "mix-sabzi": ["sabzi", "sabji", "subzi", "mix veg", "mixed vegetables", "vegetables"],
  lauki: ["kaddu", "ghiya"],
  kachumber: ["salad", "cucumber salad"],
  "chicken-karahi": ["karahi", "karhai", "kadai"],
  "chicken-salan": ["salan", "chicken curry", "murgh"],
  "chicken-tikka": ["tikka", "tikkay"],
  "grilled-chicken-breast": ["grilled chicken", "chicken breast"],
  "matar-qeema": ["qeema", "keema", "kima"],
  "shami-kabab": ["kabab", "kebab", "kababs", "shami"],
  "seekh-kabab": ["seekh", "seekh kebab", "seekh kababs"],
  "fish-curry": ["machli", "machhli", "fish"],
  "chicken-corn-soup": ["soup", "corn soup"],
  "boiled-egg": ["anda", "anday", "ande", "egg", "eggs", "boiled egg", "boiled eggs", "ublay anday"],
  omelette: ["omelet", "amlet", "omlet", "aamlait"],
  "anda-bhurji": ["bhurji", "egg bhurji", "scrambled egg", "scrambled eggs"],
  "egg-curry": ["anday ka salan", "anda curry"],
  dahi: ["yogurt", "yoghurt", "curd"],
  milk: ["doodh", "dudh"],
  chai: ["tea", "chae", "chaye", "doodh patti"],
  "chai-no-sugar": ["chai bina cheeni", "bina cheeni chai", "chai no sugar", "chai without sugar", "tea without sugar", "phiki chai", "pheeki chai", "sugar free chai"],
  "lassi-salted": ["lassi", "namkeen lassi"],
  "lassi-sweet": ["meethi lassi", "sweet lassi"],
  "oats-porridge": ["oats", "daliya", "dalia", "porridge"],
  banana: ["kela", "kelay", "kele", "bananas"],
  apple: ["saib", "seb", "apples"],
  guava: ["amrood", "amrud"],
  kinnow: ["kinno", "kinnu", "malta", "orange", "oranges"],
  mango: ["aam", "mangoes"],
  dates: ["khajoor", "khajur"],
  "fruit-chaat": ["chaat"],
  "roasted-chana": ["bhunay chanay", "bhune chane", "roasted chana"],
  almonds: ["badam", "badaam"],
  peanuts: ["moongphali", "mungfali", "mungphali"],
  samosa: ["samosay", "samose", "samosas"],
  pakora: ["pakoray", "pakode", "pakoras", "pakoda"],
};

/** Words in brackets that are not food names ("Milk (whole)", "Chicken tikka (grilled)"). */
const NOT_NAMES = new Set(["whole", "grilled", "curry", "sliced", "with", "no", "sugar"]);

/** Lower case, letters and digits only, doubled letters made single ("daal" and "dal" both become "dal"). */
const norm = (word: string) => word.toLowerCase().replace(/[^a-z0-9]/g, "").replace(/(.)\1+/g, "$1");
const phrase = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).map(norm).filter(Boolean).join(" ");

type Index = { byPhrase: Map<string, string>; longest: number; foods: Map<string, LogFood> };
const cache = new WeakMap<readonly LogFood[], Index>();

function indexFor(foods: readonly LogFood[]): Index {
  const hit = cache.get(foods);
  if (hit) return hit;
  const byPhrase = new Map<string, string>();
  const add = (p: string, slug: string) => {
    const key = phrase(p);
    if (key && !byPhrase.has(key)) byPhrase.set(key, slug);
  };
  // Extra spellings first: they settle clashes such as "anda" (a boiled egg, not an omelette).
  for (const f of foods) for (const a of ALIASES[f.slug] ?? []) add(a, f.slug);
  for (const f of foods) {
    add(f.name.replace(/\(.*?\)/g, ""), f.slug);
    for (const inner of f.name.match(/\((.*?)\)/g) ?? []) {
      const words = inner.slice(1, -1);
      if (!words.split(/\s+/).some((w) => NOT_NAMES.has(w.toLowerCase()))) add(words, f.slug);
    }
    for (const r of f.nameRoman?.split("/") ?? []) add(r, f.slug);
    add(f.slug.replace(/-/g, " "), f.slug);
  }
  const index = { byPhrase, longest: Math.max(...[...byPhrase.keys()].map((k) => k.split(" ").length)), foods: new Map(foods.map((f) => [f.slug, f])) };
  cache.set(foods, index);
  return index;
}

/** Edit distance, for allowing one small typo ("biryni", "chapti"). */
function distance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 1) return 2;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length]!;
}

/** Other forms to try for a word that did not match: plural and oblique endings ("samosay" → "samosa", "rotiyan" → "roti"). */
function stems(word: string): string[] {
  const out: string[] = [];
  if (/(ay|ey|e)$/.test(word)) out.push(word.replace(/(ay|ey|e)$/, "a"));
  if (/(iyan|ian|yan)$/.test(word)) out.push(word.replace(/(iyan|ian|yan)$/, "i"));
  if (word.endsWith("s") && word.length > 3) out.push(word.slice(0, -1));
  return out;
}

/** The longest food name starting at token i: exact, by stem, then with one typo. */
function matchAt(tokens: string[], i: number, index: Index): { slug: string; length: number; match: "exact" | "close" } | null {
  for (let len = Math.min(index.longest, tokens.length - i); len >= 1; len--) {
    const words = tokens.slice(i, i + len);
    const key = words.join(" ");
    const exact = index.byPhrase.get(key);
    if (exact) return { slug: exact, length: len, match: "exact" };
    const last = words[len - 1]!;
    for (const s of stems(last)) {
      const hit = index.byPhrase.get([...words.slice(0, -1), s].join(" "));
      if (hit) return { slug: hit, length: len, match: "exact" };
    }
  }
  // One typo, for single words of 4 letters or more ("biryni", "chapti").
  const word = tokens[i]!;
  if (word.length >= 4) {
    for (const [key, slug] of index.byPhrase) {
      if (!key.includes(" ") && key.length >= 4 && distance(word, key) === 1) return { slug, length: 1, match: "close" };
    }
  }
  return null;
}

/* ---------- amounts ---------- */

/** "1 medium roti" → 1 and "medium roti"; "10 almonds" → 10 and "almonds"; "1-egg omelette" stays whole. */
function splitLabel(label: string): { count: number; rest: string } {
  const m = /^(\d+(?:\.\d+)?)\s+(.*)$/.exec(label);
  return m ? { count: Number(m[1]), rest: m[2]! } : { count: 1, rest: label };
}

const FRACTIONS: Record<string, string> = { "0.25": "¼", "0.5": "½", "0.75": "¾" };
function formatQuantity(q: number): string {
  const whole = Math.floor(q);
  const frac = FRACTIONS[String(Math.round((q - whole) * 100) / 100)];
  if (frac) return whole ? `${whole}${frac}` : frac;
  return String(Math.round(q * 100) / 100);
}

/** The food's portion for this unit and size, its grams for one unit, and a note if the unit did not fit. */
function choosePortion(food: LogFood, unit: PortionUnit | undefined, size: string | undefined): { index: number; note?: string } {
  const fits = (p: Portion) => !size || p.label.toLowerCase().includes(size);
  const pick = (units: PortionUnit[]) => {
    const options = food.portions.map((p, i) => ({ p, i })).filter(({ p }) => units.includes(p.unit));
    return (options.find(({ p }) => fits(p) && splitLabel(p.label).count === 1) ?? options.find(({ p }) => fits(p)) ?? options[0])?.i;
  };
  if (unit && unit !== "gram") {
    const direct = pick([unit]) ?? pick(UNIT_FAMILY[unit] ?? []);
    if (direct !== undefined) return { index: direct };
    const usual = pick([food.portions[0]!.unit]) ?? 0;
    return { index: usual, note: `${food.name} is measured by ${food.portions[usual]!.unit}, so that was used instead of ${unit}.` };
  }
  return { index: pick([food.portions[0]!.unit]) ?? 0 };
}

/**
 * English nouns that take an "s" when there is more than one ("2 eggs", "4 pieces"). Roman Urdu words stay as
 * people say them: "2 roti", "2 katori".
 */
const PLURALS = new Set(["egg", "slice", "piece", "kabab", "banana", "apple", "guava", "kinnow", "samosa", "paratha", "naan", "puri", "breast", "cube", "date", "almond"]);

function pluralise(rest: string, quantity: number): string {
  if (quantity <= 1) return rest;
  const words = rest.split(" ");
  const last = words.at(-1)!;
  if (PLURALS.has(last.toLowerCase())) words[words.length - 1] = `${last}s`;
  return words.join(" ");
}

/** Grams and the "2 medium roti" text for a number of a portion's single unit. */
export function portionAmount(food: Pick<LogFood, "portions">, portionIndex: number, quantity: number): { grams: number; amount: string } {
  const portion = food.portions[portionIndex];
  if (!portion) throw new RangeError(`This food has no portion number ${portionIndex}`);
  if (!(quantity > 0)) throw new RangeError("Quantity must be more than zero");
  const { count, rest } = splitLabel(portion.label);
  return { grams: Math.round((portion.grams / count) * quantity), amount: `${formatQuantity(quantity)} ${pluralise(rest, quantity)}` };
}

/** One item, ready to show and save, from a food, a portion and how many. */
export function foodItem(food: LogFood, portionIndex: number, quantity: number, extra: Partial<ReadItem> = {}): ReadItem {
  const { grams, amount } = portionAmount(food, portionIndex, quantity);
  return { slug: food.slug, name: food.name, quantity, portionIndex, amount, grams, nutrients: nutrientsFor(food, grams), match: "exact", text: "", ...extra };
}

/* ---------- reading ---------- */

/** Splits on commas, "aur", "and", "+", new lines and so on. */
const SEPARATORS = /[,;\n+&]|\b(?:aur|and|or|with|sath|saath|phir|then)\b/gi;

/** Reads quantities like "2", "1.5", "1/2", "½" and "200g". Returns the number and any unit stuck to it. */
function readNumber(token: string): { value: number; unit?: PortionUnit } | null {
  const unicode: Record<string, number> = { "½": 0.5, "¼": 0.25, "¾": 0.75 };
  if (token in unicode) return { value: unicode[token]! };
  const frac = /^(\d+)\/(\d+)$/.exec(token);
  if (frac && Number(frac[2]) > 0) return { value: Number(frac[1]) / Number(frac[2]) };
  const m = /^(\d+(?:\.\d+)?)([a-z]*)$/.exec(token);
  if (!m) return null;
  const unit = m[2] ? UNIT_WORDS[m[2]] : undefined;
  if (m[2] && !unit && m[2] !== "x") return null;
  return { value: Number(m[1]), unit };
}

export function readFoodText(text: string, foods: readonly LogFood[]): FoodTextResult {
  const index = indexFor(foods);
  const items: ReadItem[] = [];
  const unknown: string[] = [];
  let slot: MealSlot | undefined;
  let water = 0;

  for (const chunk of text.replace(SEPARATORS, "|").split("|")) {
    const raw = chunk.toLowerCase().replace(/[^\p{L}\p{N}½¼¾./\s-]/gu, " ").split(/[\s-]+/).filter(Boolean);
    if (!raw.length) continue;

    // Tokens become numbers, units, sizes, meal names, fillers or words (possible food names).
    type Tok = { kind: "qty"; value: number; unit?: PortionUnit } | { kind: "unit"; unit: PortionUnit } | { kind: "size"; size: string } | { kind: "word"; word: string; raw: string };
    const toks: Tok[] = [];
    for (const r of raw) {
      const n = readNumber(r);
      if (n) { toks.push({ kind: "qty", value: n.value, unit: n.unit }); continue; }
      const w = norm(r);
      if (!w) continue;
      if (SLOT_WORDS[w] || SLOT_WORDS[r]) { slot ??= SLOT_WORDS[w] ?? SLOT_WORDS[r]; continue; }
      if (FILLERS.has(r) || FILLERS.has(w)) continue;
      if (NUMBER_WORDS[r] !== undefined) { toks.push({ kind: "qty", value: NUMBER_WORDS[r]! }); continue; }
      const unit = UNIT_WORDS[r] ?? UNIT_WORDS[w];
      if (unit) { toks.push({ kind: "unit", unit }); continue; }
      const size = SIZE_WORDS[r] ?? SIZE_WORDS[w];
      if (size) { toks.push({ kind: "size", size }); continue; }
      toks.push({ kind: "word", word: w, raw: r });
    }

    // Walk the tokens: amounts wait for the next food; one left at the end belongs to the food before it ("chai 2 cup").
    let pending: { qty?: number; unit?: PortionUnit; size?: string; grams?: number } = {};
    let waiting: number | null = null; // index in `items` of a food that had no amount yet
    let lostWords: string[] = [];
    const flushUnknown = () => { if (lostWords.length) unknown.push(lostWords.join(" ")); lostWords = []; };

    let i = 0;
    while (i < toks.length) {
      const t = toks[i]!;
      if (t.kind === "qty") {
        if (t.unit === "gram") pending.grams = t.value;
        else { pending.qty = t.value; if (t.unit) pending.unit = t.unit; }
        i++; continue;
      }
      if (t.kind === "unit") {
        if (t.unit === "gram" && pending.qty !== undefined) { pending.grams = pending.qty; pending.qty = undefined; } else pending.unit = t.unit;
        i++; continue;
      }
      if (t.kind === "size") { pending.size = t.size; i++; continue; }

      // A run of words: find the longest food name starting here.
      let j = i;
      while (j < toks.length && toks[j]!.kind === "word") j++;
      const words = toks.slice(i, j).map((w) => (w as { word: string }).word);
      const raws = toks.slice(i, j).map((w) => (w as { raw: string }).raw);
      let k = 0;
      while (k < words.length) {
        if (WATER_WORDS.has(words[k]!)) {
          flushUnknown();
          if (!pending.unit || pending.unit === "glass" || pending.unit === "cup") water += pending.qty && pending.qty > 0 ? pending.qty : 1;
          pending = {};
          waiting = null;
          k++;
          continue;
        }
        const m = matchAt(words, k, index);
        if (!m) { lostWords.push(raws[k]!); k++; continue; }
        flushUnknown();
        const food = index.foods.get(m.slug)!;
        const { index: portionIndex, note } = choosePortion(food, pending.unit, pending.size);
        const by = raws.slice(k, k + m.length).join(" ");
        let item: ReadItem;
        if (pending.grams !== undefined && pending.grams > 0) {
          const portion = food.portions[portionIndex]!;
          const perUnit = portion.grams / splitLabel(portion.label).count;
          item = foodItem(food, portionIndex, Math.max(0.25, Math.round((pending.grams / perUnit) * 4) / 4), { match: m.match, text: by });
          item.grams = Math.round(pending.grams);
          item.nutrients = nutrientsFor(food, item.grams);
          item.amount = `${item.grams} g`;
        } else {
          item = foodItem(food, portionIndex, pending.qty && pending.qty > 0 ? pending.qty : 1, { match: m.match, text: by, ...(note ? { note } : {}) });
        }
        waiting = pending.qty === undefined && pending.grams === undefined ? items.length : null;
        items.push(item);
        pending = {};
        k += m.length;
      }
      i = j;
    }
    flushUnknown();

    // An amount after the last food ("chai 2 cup", "roti do").
    if ((pending.qty !== undefined || pending.unit) && waiting !== null) {
      const it = items[waiting]!;
      const food = index.foods.get(it.slug)!;
      const { index: portionIndex, note } = choosePortion(food, pending.unit, pending.size);
      items[waiting] = foodItem(food, portionIndex, pending.qty && pending.qty > 0 ? pending.qty : 1, { match: it.match, text: it.text, ...(note ? { note } : {}) });
    }
  }

  return { items, unknown, ...(slot ? { slot } : {}), ...(water ? { water } : {}), totals: sumNutrients(items.map((i) => i.nutrients)) };
}
