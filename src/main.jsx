// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { ChakraProvider, ColorModeScript } from "@chakra-ui/react";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import theme from "./theme.js";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
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
        <App />
      </BrowserRouter>
    </ChakraProvider>
  </React.StrictMode>
);
