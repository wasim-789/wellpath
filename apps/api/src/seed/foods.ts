/**
 * Starter foods, focused on everyday Pakistani meals. Values are per 100 g as eaten (cooked).
 * Every item starts unverified: a person must check it against a trusted source in the admin panel.
 */
import type { Food, Nutrients, Portion } from "@wellpath/shared";

const BASIC = {
  name: "Approximate, based on USDA FoodData Central values for the same food",
  note: "Check against the exact USDA entry before marking it verified.",
};
const HOME = {
  name: "WellPath estimate for a typical home recipe",
  note: "Recipes vary a lot, especially in oil and ghee. Check against a Pakistani food composition table or a dietitian.",
};

const n = (kcal: number, proteinG: number, carbsG: number, fatG: number, fiberG: number): Nutrients => ({ kcal, proteinG, carbsG, fatG, fiberG });
const p = (unit: Portion["unit"], label: string, grams: number): Portion => ({ unit, label, grams });

type Draft = Omit<Food, "source" | "verified" | "treat"> & { treat?: boolean; basic?: boolean };
const food = ({ basic, treat = false, ...f }: Draft): Food => ({ ...f, treat, source: basic ? BASIC : HOME, verified: false });

export const SEED_FOODS: Food[] = [
  // Breads
  food({ slug: "roti", name: "Roti (chapati)", nameRoman: "roti", category: "bread", dietCategory: "vegetarian", mealSlots: ["breakfast", "lunch", "dinner"], per100g: n(297, 11, 46, 7.5, 4.9), portions: [p("roti", "1 medium roti", 40), p("roti", "1 large roti", 60)], basic: true }),
  food({ slug: "paratha", name: "Plain paratha", nameRoman: "paratha", category: "bread", dietCategory: "vegetarian", mealSlots: ["breakfast"], per100g: n(326, 6.4, 45.4, 13.2, 3.5), portions: [p("piece", "1 paratha", 80)], basic: true }),
  food({ slug: "aloo-paratha", name: "Aloo paratha", nameRoman: "aloo paratha", category: "bread", dietCategory: "vegetarian", mealSlots: ["breakfast"], per100g: n(260, 5.5, 35, 11, 3), portions: [p("piece", "1 aloo paratha", 120)] }),
  food({ slug: "naan", name: "Naan", nameRoman: "naan", category: "bread", dietCategory: "vegetarian", mealSlots: ["lunch", "dinner"], per100g: n(291, 9.6, 50.4, 5.7, 2.2), portions: [p("piece", "1 naan", 90)], basic: true }),
  food({ slug: "wholewheat-bread", name: "Whole wheat bread", nameRoman: "brown bread", category: "bread", dietCategory: "vegetarian", mealSlots: ["breakfast"], per100g: n(254, 12.3, 43, 3.5, 6), portions: [p("slice", "1 slice", 30), p("slice", "2 slices", 60)], basic: true }),
  food({ slug: "puri", name: "Puri", nameRoman: "poori", category: "bread", dietCategory: "vegetarian", mealSlots: ["breakfast"], per100g: n(340, 6.5, 42, 16.5, 2.5), portions: [p("piece", "1 puri", 35)], treat: true }),

  // Rice
  food({ slug: "boiled-rice", name: "Boiled white rice", nameRoman: "chawal", category: "rice", dietCategory: "vegetarian", mealSlots: ["lunch", "dinner"], per100g: n(130, 2.7, 28.2, 0.3, 0.4), portions: [p("katori", "1 katori", 150), p("plate", "1 plate", 250)], basic: true }),
  food({ slug: "brown-rice", name: "Boiled brown rice", nameRoman: "brown chawal", category: "rice", dietCategory: "vegetarian", mealSlots: ["lunch", "dinner"], per100g: n(123, 2.7, 25.6, 1, 1.6), portions: [p("katori", "1 katori", 150)], basic: true }),
  food({ slug: "chicken-biryani", name: "Chicken biryani", nameRoman: "chicken biryani", category: "rice", dietCategory: "non_vegetarian", mealSlots: ["lunch", "dinner"], per100g: n(170, 9, 20, 6, 1), portions: [p("plate", "1 plate", 300), p("katori", "1 katori", 150)] }),
  food({ slug: "beef-biryani", name: "Beef biryani", nameRoman: "beef biryani", category: "rice", dietCategory: "non_vegetarian", mealSlots: ["lunch", "dinner"], per100g: n(185, 9.5, 20, 7.3, 1), portions: [p("plate", "1 plate", 300), p("katori", "1 katori", 150)], variantOf: "chicken-biryani" }),
  food({ slug: "vegetable-pulao", name: "Vegetable pulao", nameRoman: "sabzi pulao", category: "rice", dietCategory: "vegetarian", mealSlots: ["lunch", "dinner"], per100g: n(150, 3.5, 24, 4.5, 1.5), portions: [p("plate", "1 plate", 250), p("katori", "1 katori", 150)] }),
  food({ slug: "khichdi", name: "Khichdi", nameRoman: "khichri", category: "rice", dietCategory: "vegetarian", mealSlots: ["lunch", "dinner"], per100g: n(120, 4.5, 19, 3, 2), portions: [p("katori", "1 katori", 200)] }),

  // Lentils and beans
  food({ slug: "daal-masoor", name: "Daal masoor", nameRoman: "masoor ki daal", category: "lentils", dietCategory: "vegetarian", mealSlots: ["lunch", "dinner"], per100g: n(110, 7, 15, 2.5, 3.5), portions: [p("katori", "1 katori", 200)] }),
  food({ slug: "daal-chana", name: "Daal chana", nameRoman: "chane ki daal", category: "lentils", dietCategory: "vegetarian", mealSlots: ["lunch", "dinner"], per100g: n(140, 8, 19, 3.5, 5), portions: [p("katori", "1 katori", 200)] }),
  food({ slug: "daal-mash", name: "Daal mash", nameRoman: "maash ki daal", category: "lentils", dietCategory: "vegetarian", mealSlots: ["lunch", "dinner"], per100g: n(135, 8, 15, 4.8, 4), portions: [p("katori", "1 katori", 200)] }),
  food({ slug: "cholay", name: "Cholay (chickpea curry)", nameRoman: "cholay", category: "lentils", dietCategory: "vegetarian", mealSlots: ["breakfast", "lunch", "dinner"], per100g: n(140, 7, 18, 4.5, 5.5), portions: [p("katori", "1 katori", 200)] }),
  food({ slug: "lobia", name: "Lobia (black-eyed peas curry)", nameRoman: "lobia", category: "lentils", dietCategory: "vegetarian", mealSlots: ["lunch", "dinner"], per100g: n(125, 7, 17, 3.2, 5), portions: [p("katori", "1 katori", 200)] }),
  food({ slug: "rajma", name: "Rajma (kidney bean curry)", nameRoman: "rajma", category: "lentils", dietCategory: "vegetarian", mealSlots: ["lunch", "dinner"], per100g: n(130, 7, 18, 3.4, 5.5), portions: [p("katori", "1 katori", 200)] }),
  food({ slug: "chana-chaat", name: "Chana chaat", nameRoman: "chana chaat", category: "snacks", dietCategory: "vegetarian", mealSlots: ["breakfast", "snack"], per100g: n(130, 6, 20, 3, 5), portions: [p("bowl", "1 small bowl", 150)] }),

  // Vegetables
  food({ slug: "aloo-gobi", name: "Aloo gobi", nameRoman: "aloo gobi", category: "vegetables", dietCategory: "vegetarian", mealSlots: ["lunch", "dinner"], per100g: n(95, 2.5, 12, 4.3, 2.5), portions: [p("katori", "1 katori", 150)] }),
  food({ slug: "bhindi", name: "Bhindi masala", nameRoman: "bhindi", category: "vegetables", dietCategory: "vegetarian", mealSlots: ["lunch", "dinner"], per100g: n(90, 2.2, 9, 5, 3.2), portions: [p("katori", "1 katori", 150)] }),
  food({ slug: "palak", name: "Palak (spinach curry)", nameRoman: "palak", category: "vegetables", dietCategory: "vegetarian", mealSlots: ["lunch", "dinner"], per100g: n(80, 3, 6, 5, 2.5), portions: [p("katori", "1 katori", 150)] }),
  food({ slug: "palak-paneer", name: "Palak paneer", nameRoman: "palak paneer", category: "vegetables", dietCategory: "vegetarian", mealSlots: ["lunch", "dinner"], per100g: n(140, 7, 5, 10.5, 2), portions: [p("katori", "1 katori", 150)] }),
  food({ slug: "mix-sabzi", name: "Mixed vegetables", nameRoman: "mix sabzi", category: "vegetables", dietCategory: "vegetarian", mealSlots: ["lunch", "dinner"], per100g: n(85, 2.5, 10, 4, 3), portions: [p("katori", "1 katori", 150)] }),
  food({ slug: "aloo-matar", name: "Aloo matar", nameRoman: "aloo matar", category: "vegetables", dietCategory: "vegetarian", mealSlots: ["lunch", "dinner"], per100g: n(105, 3, 14, 4.2, 3), portions: [p("katori", "1 katori", 150)] }),
  food({ slug: "lauki", name: "Lauki (bottle gourd curry)", nameRoman: "kaddu / lauki", category: "vegetables", dietCategory: "vegetarian", mealSlots: ["lunch", "dinner"], per100g: n(55, 1.2, 6, 3, 1.5), portions: [p("katori", "1 katori", 150)] }),
  food({ slug: "kachumber", name: "Kachumber salad", nameRoman: "salad", category: "salad", dietCategory: "vegetarian", mealSlots: ["lunch", "dinner"], per100g: n(25, 1, 5, 0.2, 1.5), portions: [p("katori", "1 katori", 100)] }),

  // Meat and fish
  food({ slug: "chicken-karahi", name: "Chicken karahi", nameRoman: "chicken karahi", category: "meat", dietCategory: "non_vegetarian", mealSlots: ["lunch", "dinner"], per100g: n(170, 17, 3, 10, 0.5), portions: [p("katori", "1 katori", 150), p("plate", "1 plate", 250)] }),
  food({ slug: "mutton-karahi", name: "Mutton karahi", nameRoman: "mutton karahi", category: "meat", dietCategory: "non_vegetarian", mealSlots: ["lunch", "dinner"], per100g: n(215, 16, 3, 15.3, 0.5), portions: [p("katori", "1 katori", 150)], variantOf: "chicken-karahi" }),
  food({ slug: "chicken-salan", name: "Chicken salan (curry)", nameRoman: "chicken salan", category: "meat", dietCategory: "non_vegetarian", mealSlots: ["lunch", "dinner"], per100g: n(140, 14, 4, 7.6, 0.8), portions: [p("katori", "1 katori", 200)] }),
  food({ slug: "chicken-tikka", name: "Chicken tikka (grilled)", nameRoman: "chicken tikka", category: "meat", dietCategory: "non_vegetarian", mealSlots: ["lunch", "dinner"], per100g: n(165, 25, 2, 6.5, 0.3), portions: [p("piece", "1 piece", 40), p("plate", "4 pieces", 160)] }),
  food({ slug: "grilled-chicken-breast", name: "Grilled chicken breast", nameRoman: "grilled chicken", category: "meat", dietCategory: "non_vegetarian", mealSlots: ["lunch", "dinner"], per100g: n(165, 31, 0, 3.6, 0), portions: [p("piece", "1 small breast", 120)], basic: true }),
  food({ slug: "matar-qeema", name: "Matar qeema", nameRoman: "qeema matar", category: "meat", dietCategory: "non_vegetarian", mealSlots: ["lunch", "dinner"], per100g: n(190, 15, 5, 12.3, 2), portions: [p("katori", "1 katori", 150)] }),
  food({ slug: "nihari", name: "Nihari", nameRoman: "nihari", category: "meat", dietCategory: "non_vegetarian", mealSlots: ["breakfast", "lunch", "dinner"], per100g: n(200, 14, 4, 14.4, 0.5), portions: [p("katori", "1 katori", 200)], treat: true }),
  food({ slug: "haleem", name: "Haleem", nameRoman: "haleem", category: "meat", dietCategory: "non_vegetarian", mealSlots: ["lunch", "dinner"], per100g: n(160, 10, 14, 7, 3), portions: [p("katori", "1 katori", 200)] }),
  food({ slug: "shami-kabab", name: "Shami kabab", nameRoman: "shami kabab", category: "meat", dietCategory: "non_vegetarian", mealSlots: ["breakfast", "lunch", "dinner", "snack"], per100g: n(230, 14, 12, 14, 2), portions: [p("piece", "1 kabab", 50)] }),
  food({ slug: "seekh-kabab", name: "Seekh kabab", nameRoman: "seekh kabab", category: "meat", dietCategory: "non_vegetarian", mealSlots: ["lunch", "dinner"], per100g: n(250, 17, 4, 18.5, 0.5), portions: [p("piece", "1 seekh kabab", 60)], treat: true }),
  food({ slug: "fish-curry", name: "Fish curry", nameRoman: "machli ka salan", category: "fish", dietCategory: "non_vegetarian", mealSlots: ["lunch", "dinner"], per100g: n(130, 15, 3, 6.5, 0.5), portions: [p("katori", "1 katori", 200)] }),
  food({ slug: "chicken-corn-soup", name: "Chicken corn soup", nameRoman: "chicken corn soup", category: "soup", dietCategory: "non_vegetarian", mealSlots: ["dinner", "snack"], per100g: n(60, 4, 7, 1.8, 0.5), portions: [p("bowl", "1 bowl", 250)] }),

  // Eggs
  food({ slug: "boiled-egg", name: "Boiled egg", nameRoman: "ubla anda", category: "eggs", dietCategory: "eggetarian", mealSlots: ["breakfast", "snack"], per100g: n(155, 12.6, 1.1, 10.6, 0), portions: [p("piece", "1 egg", 50), p("piece", "2 eggs", 100)], basic: true }),
  food({ slug: "omelette", name: "Desi omelette", nameRoman: "anda / omelette", category: "eggs", dietCategory: "eggetarian", mealSlots: ["breakfast"], per100g: n(180, 11, 2, 14.5, 0.5), portions: [p("piece", "1-egg omelette", 70), p("piece", "2-egg omelette", 130)] }),
  food({ slug: "anda-bhurji", name: "Anda bhurji", nameRoman: "anda bhurji", category: "eggs", dietCategory: "eggetarian", mealSlots: ["breakfast"], per100g: n(175, 11, 3, 13.2, 0.5), portions: [p("katori", "1 katori (2 eggs)", 130)], variantOf: "omelette" }),
  food({ slug: "egg-curry", name: "Egg curry", nameRoman: "anday ka salan", category: "eggs", dietCategory: "eggetarian", mealSlots: ["lunch", "dinner"], per100g: n(150, 9, 4, 11, 1), portions: [p("katori", "1 katori (2 eggs)", 200)] }),

  // Dairy and drinks
  food({ slug: "dahi", name: "Plain yogurt (dahi)", nameRoman: "dahi", category: "dairy", dietCategory: "vegetarian", mealSlots: ["breakfast", "lunch", "dinner", "snack"], per100g: n(61, 3.5, 4.7, 3.3, 0), portions: [p("katori", "1 katori", 150)], basic: true }),
  food({ slug: "raita", name: "Raita", nameRoman: "raita", category: "dairy", dietCategory: "vegetarian", mealSlots: ["lunch", "dinner"], per100g: n(55, 3, 5, 2.6, 0.3), portions: [p("katori", "1 katori", 100)] }),
  food({ slug: "milk", name: "Milk (whole)", nameRoman: "doodh", category: "drinks", dietCategory: "vegetarian", mealSlots: ["breakfast", "snack"], per100g: n(61, 3.2, 4.8, 3.3, 0), portions: [p("glass", "1 glass", 250)], basic: true }),
  food({ slug: "chai", name: "Doodh patti chai (with sugar)", nameRoman: "chai", category: "drinks", dietCategory: "vegetarian", mealSlots: ["breakfast", "snack"], per100g: n(60, 1.8, 8, 2.2, 0), portions: [p("cup", "1 cup", 150)] }),
  food({ slug: "lassi-salted", name: "Salted lassi", nameRoman: "namkeen lassi", category: "drinks", dietCategory: "vegetarian", mealSlots: ["breakfast", "lunch", "snack"], per100g: n(40, 2.5, 3.5, 1.8, 0), portions: [p("glass", "1 glass", 250)] }),
  food({ slug: "lassi-sweet", name: "Sweet lassi", nameRoman: "meethi lassi", category: "drinks", dietCategory: "vegetarian", mealSlots: ["breakfast", "snack"], per100g: n(75, 2.8, 11, 2.2, 0), portions: [p("glass", "1 glass", 250)], variantOf: "lassi-salted", treat: true }),
  food({ slug: "paneer", name: "Paneer", nameRoman: "paneer", category: "dairy", dietCategory: "vegetarian", mealSlots: ["breakfast", "lunch", "dinner"], per100g: n(265, 18, 3, 20.5, 0), portions: [p("piece", "4 cubes", 60)], basic: true }),

  // Breakfast
  food({ slug: "oats-porridge", name: "Oats porridge with milk", nameRoman: "daliya / oats", category: "breakfast", dietCategory: "vegetarian", mealSlots: ["breakfast"], per100g: n(95, 4, 13, 3, 1.5), portions: [p("bowl", "1 bowl", 250)] }),

  // Fruit
  food({ slug: "banana", name: "Banana", nameRoman: "kela", category: "fruit", dietCategory: "vegetarian", mealSlots: ["breakfast", "snack"], per100g: n(89, 1.1, 22.8, 0.3, 2.6), portions: [p("piece", "1 medium banana", 118)], basic: true }),
  food({ slug: "apple", name: "Apple", nameRoman: "saib", category: "fruit", dietCategory: "vegetarian", mealSlots: ["breakfast", "snack"], per100g: n(52, 0.3, 13.8, 0.2, 2.4), portions: [p("piece", "1 medium apple", 180)], basic: true }),
  food({ slug: "guava", name: "Guava", nameRoman: "amrood", category: "fruit", dietCategory: "vegetarian", mealSlots: ["snack"], per100g: n(68, 2.6, 14.3, 1, 5.4), portions: [p("piece", "1 guava", 100)], basic: true }),
  food({ slug: "kinnow", name: "Kinnow (orange)", nameRoman: "kinno / malta", category: "fruit", dietCategory: "vegetarian", mealSlots: ["breakfast", "snack"], per100g: n(47, 0.9, 11.8, 0.1, 2.4), portions: [p("piece", "1 kinnow", 130)], basic: true }),
  food({ slug: "mango", name: "Mango", nameRoman: "aam", category: "fruit", dietCategory: "vegetarian", mealSlots: ["snack"], per100g: n(60, 0.8, 15, 0.4, 1.6), portions: [p("katori", "1 katori, sliced", 165)], basic: true }),
  food({ slug: "dates", name: "Dates", nameRoman: "khajoor", category: "fruit", dietCategory: "vegetarian", mealSlots: ["breakfast", "snack"], per100g: n(282, 2.5, 75, 0.4, 8), portions: [p("piece", "3 dates", 24)], basic: true }),
  food({ slug: "fruit-chaat", name: "Fruit chaat", nameRoman: "fruit chaat", category: "fruit", dietCategory: "vegetarian", mealSlots: ["snack"], per100g: n(70, 0.8, 17, 0.3, 2), portions: [p("bowl", "1 bowl", 200)] }),

  // Snacks
  food({ slug: "roasted-chana", name: "Roasted chana", nameRoman: "bhunay chanay", category: "snacks", dietCategory: "vegetarian", mealSlots: ["snack"], per100g: n(370, 20, 58, 6, 17), portions: [p("handful", "1 handful", 30)] }),
  food({ slug: "almonds", name: "Almonds", nameRoman: "badam", category: "snacks", dietCategory: "vegetarian", mealSlots: ["snack"], per100g: n(579, 21, 22, 50, 12.5), portions: [p("handful", "10 almonds", 12)], basic: true }),
  food({ slug: "peanuts", name: "Roasted peanuts", nameRoman: "moongphali", category: "snacks", dietCategory: "vegetarian", mealSlots: ["snack"], per100g: n(585, 24, 21, 50, 8), portions: [p("handful", "1 handful", 28)], basic: true }),
  food({ slug: "samosa", name: "Aloo samosa", nameRoman: "samosa", category: "snacks", dietCategory: "vegetarian", mealSlots: ["snack"], per100g: n(260, 4, 28, 14.5, 2.5), portions: [p("piece", "1 samosa", 80)], treat: true }),
  food({ slug: "pakora", name: "Pakora", nameRoman: "pakoray", category: "snacks", dietCategory: "vegetarian", mealSlots: ["snack"], per100g: n(300, 7, 28, 18, 3.5), portions: [p("piece", "4 pakoray", 80)], treat: true }),
];
