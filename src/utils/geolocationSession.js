export const GEO_PAGE_LOAD_ID =
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const GEO_PAGE_LOAD_STORAGE_KEY = "BYL_GEO_PAGE_LOAD_ID";
