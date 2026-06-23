const nutritionStepReadyTestId = (path = "") => {
  if (path.endsWith("/food-survey")) return "nutrition-survey-next";
  if (path.endsWith("/ration")) return "nutrition-ration-next";
  if (path.endsWith("/menu")) return "nutrition-menu-validate-share";
  return "";
};

export const navigateWithDomFallback = (navigate, path, delay = 650) => {
  navigate(path);
  window.setTimeout(() => {
    const currentPath = decodeURI(window.location.pathname);
    const readyTestId = nutritionStepReadyTestId(path);
    const routeReady = readyTestId
      ? Boolean(document.querySelector(`[data-testid="${readyTestId}"]`))
      : true;

    if (currentPath !== path || !routeReady) {
      window.location.assign(path);
    }
  }, delay);
};
