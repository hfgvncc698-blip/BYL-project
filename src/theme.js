// src/theme.js
import { extendTheme } from "@chakra-ui/react";
import { mode } from "@chakra-ui/theme-tools";

const theme = extendTheme({
  config: {
    initialColorMode: "system",  // tu peux laisser "system" ou mettre "light"
    useSystemColorMode: false,   // <-- important: on ignore le système
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

