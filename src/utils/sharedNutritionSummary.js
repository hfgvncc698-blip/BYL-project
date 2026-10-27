const millis = (value) => value?.toMillis?.() || value?.toDate?.()?.getTime?.() || new Date(value || 0).getTime() || 0;
export const sortSharedNutrition = (rows) => rows.sort((a, b) =>
  millis(b.clientShare?.sharedAt || b.updatedAt || b.createdAt) - millis(a.clientShare?.sharedAt || a.updatedAt || a.createdAt)
);
export function buildSharedNutritionSummary(nutritionRows) {
  const latestNutrition = nutritionRows[0] || null;
          const snapshotMenuDays = latestNutrition?.clientShare?.snapshot?.menuDays || [];
          const snapshotMealKeys = snapshotMenuDays
            .flatMap((day) => day?.meals || [])
            .map((meal) => meal?.mealKey || meal?.key || "")
            .filter(Boolean);
          const rationLines = latestNutrition?.ration?.selected?.lines || latestNutrition?.ration?.lines || [];
          const rationMealKeys = rationLines.flatMap((line) =>
            Object.entries(line?.meals || {})
              .filter(([, quantity]) => Number(quantity) > 0)
              .map(([mealKey]) => mealKey)
          );
          return latestNutrition ? {
            id: latestNutrition.id,
            sourceClientId: latestNutrition.sourceClientId,
            objective: latestNutrition.inputs?.objectif || latestNutrition.inputs?.objective || "Plan nutrition",
            kcal: latestNutrition.computed?.kcalTarget || latestNutrition.ration?.selected?.computed?.totals?.day?.kcal || null,
            sharedCount: nutritionRows.length,
            sharedAt: latestNutrition.clientShare?.sharedAt || latestNutrition.updatedAt || latestNutrition.createdAt || null,
            mealKeys: [...new Set([...snapshotMealKeys, ...rationMealKeys])],
            menuDays: snapshotMenuDays,
            rationMealKeys: [...new Set(rationMealKeys)],
          } : null;
}
