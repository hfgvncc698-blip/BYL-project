const MEAL_ORDER = ["breakfast", "morningSnack", "lunch", "afternoonSnack", "dinner", "eveningSnack"];

export const canonicalNutritionMealKey = (meal = {}) => {
  const key = String(meal?.key || meal?.mealKey || "").toLowerCase();
  if (key === "petit_dej" || key === "petit_dejeuner") return "breakfast";
  if (key === "collation_1" || key === "collation_matin") return "morningSnack";
  if (key === "dejeuner") return "lunch";
  if (key === "collation" || key === "collation_2" || key === "collation_apm") return "afternoonSnack";
  if (key === "diner") return "dinner";
  if (key === "collation_3" || key === "collation_soir") return "eveningSnack";
  return "other";
};

export const nutritionMealKeysForDate = (menuDays = [], rationMealKeys = [], date = new Date()) => {
  const detailedMenuAvailable = menuDays.some((day) =>
    (day?.meals || []).some((meal) => Array.isArray(meal?.items) && meal.items.length > 0)
  );
  const dateValue = date instanceof Date ? date : new Date(date);
  const mondayBasedIndex = Number.isNaN(dateValue.getTime()) ? 0 : (dateValue.getDay() + 6) % 7;
  const currentDay = menuDays.length ? menuDays[mondayBasedIndex % menuDays.length] : null;
  const sourceKeys = detailedMenuAvailable
    ? (currentDay?.meals || [])
        .filter((meal) => Array.isArray(meal?.items) && meal.items.length > 0)
        .map((meal) => meal?.mealKey || meal?.key || "")
    : rationMealKeys;

  return [...new Set(
    sourceKeys
      .map((key) => canonicalNutritionMealKey({ key }))
      .filter((key) => MEAL_ORDER.includes(key))
  )];
};

const median = (values = []) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
};

export const inferNutritionMealHabits = (logs = [], minimumOccurrences = 3) => {
  const observations = Object.fromEntries(MEAL_ORDER.map((key) => [key, []]));

  logs.slice(0, 7).forEach((log) => {
    const groups = new Map();
    (log?.entries || []).filter((entry) => entry?.source !== "extra").forEach((entry) => {
      const key = canonicalNutritionMealKey(entry);
      if (!MEAL_ORDER.includes(key)) return;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(entry);
    });

    groups.forEach((entries, key) => {
      if (!entries.length || entries.some((entry) => !entry.eaten || !entry.eatenAtIso)) return;
      const timestamps = entries
        .map((entry) => new Date(entry.eatenAtIso))
        .filter((date) => !Number.isNaN(date.getTime()));
      if (timestamps.length !== entries.length) return;
      const completion = timestamps.sort((a, b) => b.getTime() - a.getTime())[0];
      observations[key].push(completion.getHours() * 60 + completion.getMinutes());
    });
  });

  return Object.fromEntries(
    Object.entries(observations)
      .filter(([, values]) => values.length >= minimumOccurrences)
      .map(([key, values]) => [key, median(values)])
  );
};

export const nutritionMealMoment = (date = new Date(), meals = [], habits = {}) => {
  const minutes = date.getHours() * 60 + date.getMinutes();
  const availableMoments = new Set(meals.map(canonicalNutritionMealKey));
  const hasMorningSnack = availableMoments.has("morningSnack");
  const hasAfternoonSnack = availableMoments.has("afternoonSnack");
  const hasEveningSnack = availableMoments.has("eveningSnack");

  const breakfastEnd = Math.max(hasMorningSnack ? 8 * 60 + 30 : 11 * 60, habits.breakfast || 0);
  const morningSnackEnd = Math.max(11 * 60, habits.morningSnack || 0);
  const lunchEnd = Math.max(14 * 60 + 30, habits.lunch || 0);
  const afternoonSnackEnd = Math.max(17 * 60 + 30, habits.afternoonSnack || 0);
  const dinnerEnd = Math.max(21 * 60 + 30, habits.dinner || 0);

  if (minutes < 4 * 60) return hasEveningSnack ? "eveningSnack" : "dinner";

  if (minutes >= 4 * 60 && minutes < Math.min(breakfastEnd, morningSnackEnd)) {
    return "breakfast";
  }
  if (hasMorningSnack && minutes < Math.max(morningSnackEnd, breakfastEnd + 30)) return "morningSnack";
  if (minutes < lunchEnd) return "lunch";
  if (minutes < afternoonSnackEnd) {
    return hasAfternoonSnack ? "afternoonSnack" : "lunch";
  }
  if (minutes < dinnerEnd) return "dinner";
  return hasEveningSnack ? "eveningSnack" : "dinner";
};

export const selectTimeRelevantMeal = (meals = [], date = new Date(), habits = {}) => {
  if (!meals.length) return null;

  const desired = nutritionMealMoment(date, meals, habits);
  const exact = meals.find((meal) => canonicalNutritionMealKey(meal) === desired);
  if (exact) return exact;

  const desiredIndex = MEAL_ORDER.indexOf(desired);
  const ranked = meals
    .map((meal, originalIndex) => ({
      meal,
      originalIndex,
      mealIndex: MEAL_ORDER.indexOf(canonicalNutritionMealKey(meal)),
    }))
    .filter(({ mealIndex }) => mealIndex >= 0)
    .sort((a, b) => {
      const aDistance = Math.abs(a.mealIndex - desiredIndex);
      const bDistance = Math.abs(b.mealIndex - desiredIndex);
      if (aDistance !== bDistance) return aDistance - bDistance;
      const aIsFuture = a.mealIndex >= desiredIndex;
      const bIsFuture = b.mealIndex >= desiredIndex;
      if (aIsFuture !== bIsFuture) return aIsFuture ? -1 : 1;
      if (a.mealIndex !== b.mealIndex) return a.mealIndex - b.mealIndex;
      return a.originalIndex - b.originalIndex;
    });

  return ranked[0]?.meal || meals[0];
};
