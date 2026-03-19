// src/theme.js
import { extendTheme } from "@chakra-ui/react";
import { mode } from "@chakra-ui/theme-tools";

const theme = extendTheme({
  config: {
    initialColorMode: "system", // ✅ suit le thème appareil au chargement
    useSystemColorMode: true,   // ✅ écoute le thème système (clair/sombre)
  },
  styles: {
    global: (props) => ({
      "html, body, #root": { height: "100%" },
      body: {
        bg: mode("gray.50", "gray.900")(props),
        color: mode("gray.800", "gray.100")(props),
      },
    }),
  },
});

export default theme;

