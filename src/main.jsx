// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { ChakraProvider, ColorModeScript } from "@chakra-ui/react";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import theme from "./theme.js";
import AppErrorBoundary from "./components/ui/AppErrorBoundary.jsx";

const app = (
  <>
    {/* IMPORTANT: place ce script pour hydrater le mode dès le 1er paint */}
    <ColorModeScript initialColorMode={theme.config.initialColorMode} />
    <ChakraProvider
      theme={theme}
      toastOptions={{
        defaultOptions: {
          position: "bottom",
          duration: 3200,
          isClosable: true,
          variant: "toast",
          containerStyle: {
            maxWidth: "min(92vw, 420px)",
            marginBottom: "1rem",
          },
        },
        toastSpacing: "0.75rem",
      }}
    >
      <BrowserRouter>
        <AppErrorBoundary>
          <App />
        </AppErrorBoundary>
      </BrowserRouter>
    </ChakraProvider>
  </>
);

// StrictMode relance volontairement les effects en développement. Sur cette
// application orientée Firestore cela doublait les lectures de chaque page et
// rendait localhost nettement plus lent que la production. Il reste activable
// explicitement pour les sessions de diagnostic.
const rootTree =
  import.meta.env.DEV && import.meta.env.VITE_REACT_STRICT_MODE === "true"
    ? <React.StrictMode>{app}</React.StrictMode>
    : app;

ReactDOM.createRoot(document.getElementById("root")).render(rootTree);
