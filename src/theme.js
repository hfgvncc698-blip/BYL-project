// src/theme.js
import { extendTheme } from "@chakra-ui/react";
import { alertAnatomy } from "@chakra-ui/anatomy";
import { createMultiStyleConfigHelpers } from "@chakra-ui/styled-system";
import { mode } from "@chakra-ui/theme-tools";

const isNeutralAccentScheme = (scheme) => !scheme || scheme === "blue" || scheme === "brand";
const brandProgressGradient = "linear-gradient(90deg, #1F5EFF 0%, #257CFF 52%, #00B8FF 100%)";
const { definePartsStyle, defineMultiStyleConfig } = createMultiStyleConfigHelpers(alertAnatomy.keys);

const alertVariantToast = definePartsStyle((props) => {
  const c = props.colorScheme || "blue";

  return {
    container: {
      bg: mode("rgba(255,255,255,0.96)", "rgba(11,16,27,0.96)")(props),
      color: mode("#111827", "#F8FAFC")(props),
      border: "1px solid",
      borderColor: mode("rgba(15,23,42,0.08)", "rgba(255,255,255,0.10)")(props),
      borderRadius: "18px",
      boxShadow: mode(
        "0 18px 40px rgba(15,23,42,0.12)",
        "0 18px 40px rgba(0,0,0,0.35)"
      )(props),
      backdropFilter: "blur(16px)",
      px: "3.5",
      py: "3",
      position: "relative",
      overflow: "hidden",
      _before: {
        content: '""',
        position: "absolute",
        right: "-18px",
        bottom: "-22px",
        w: "110px",
        h: "110px",
        borderRadius: "full",
        bg: `${c}.200`,
        opacity: mode(0.22, 0.18)(props),
        filter: "blur(28px)",
      },
    },
    title: {
      fontWeight: "900",
      letterSpacing: "-0.01em",
      lineHeight: "1.2",
      color: mode("#111827", "#F8FAFC")(props),
    },
    description: {
      color: mode("rgba(17,24,39,0.72)", "rgba(248,250,252,0.70)")(props),
      lineHeight: "1.4",
      fontSize: "sm",
      marginTop: "2px",
    },
    icon: {
      color: mode(`${c}.600`, `${c}.200`)(props),
      bg: mode(`${c}.50`, "rgba(255,255,255,0.08)")(props),
      border: "1px solid",
      borderColor: mode(`${c}.100`, "rgba(255,255,255,0.10)")(props),
      borderRadius: "999px",
      p: "1.5",
      boxSize: "9",
      marginEnd: "3",
      flexShrink: 0,
    },
    spinner: {
      color: mode(`${c}.600`, `${c}.200`)(props),
      marginEnd: "3",
      flexShrink: 0,
    },
  };
});

const alertTheme = defineMultiStyleConfig({
  variants: {
    toast: alertVariantToast,
  },
});

const theme = extendTheme({
  config: {
    initialColorMode: "system",
    useSystemColorMode: true,
  },
  fonts: {
    heading: "'Inter', 'Segoe UI', sans-serif",
    body: "'Inter', 'Segoe UI', sans-serif",
  },
  radii: {
    panel: "24px",
    card: "22px",
    control: "18px",
    pill: "999px",
  },
  colors: {
    brand: {
      50: "#EFF6FF",
      100: "#DBEAFE",
      200: "#BFDBFE",
      300: "#93C5FD",
      400: "#60A5FA",
      500: "#3B82F6",
      600: "#2563EB",
      700: "#1D4ED8",
      800: "#1E40AF",
      900: "#1E3A8A",
    },
    mint: {
      400: "#34D399",
      500: "#10B981",
      600: "#059669",
    },
  },
  shadows: {
    glass: "0 20px 50px rgba(15,23,42,0.08)",
    glassDark: "0 20px 60px rgba(0,0,0,0.35)",
    soft: "0 12px 30px rgba(15,23,42,0.08)",
    softDark: "0 12px 30px rgba(0,0,0,0.30)",
  },
  semanticTokens: {
    colors: {
      appBg: { default: "#F6F9FC", _dark: "#0B1120" },
      surface: { default: "rgba(255,255,255,0.78)", _dark: "rgba(15,23,42,0.78)" },
      surfaceStrong: { default: "#FFFFFF", _dark: "#111827" },
      surfaceMuted: { default: "rgba(15,23,42,0.04)", _dark: "rgba(255,255,255,0.06)" },
      borderSubtle: { default: "rgba(15,23,42,0.08)", _dark: "rgba(255,255,255,0.10)" },
      borderAccent: { default: "rgba(15,23,42,0.14)", _dark: "rgba(255,255,255,0.18)" },
      textPrimary: { default: "#111827", _dark: "#F8FAFC" },
      textMuted: { default: "rgba(17,24,39,0.64)", _dark: "rgba(248,250,252,0.64)" },
      hoverAccent: { default: "rgba(15,23,42,0.06)", _dark: "rgba(255,255,255,0.10)" },
    },
  },
  layerStyles: {
    appShell: {
      bg: "appBg",
      backgroundImage:
        "radial-gradient(circle at 10% 8%, rgba(59,130,246,0.10), transparent 28%), radial-gradient(circle at 88% 12%, rgba(16,185,129,0.08), transparent 26%), radial-gradient(circle at 64% 86%, rgba(245,158,11,0.06), transparent 30%)",
      color: "textPrimary",
    },
    glassPanel: {
      bg: "surface",
      backgroundImage:
        "radial-gradient(circle at 88% 14%, rgba(59,130,246,0.14), transparent 28%), radial-gradient(circle at 12% 100%, rgba(16,185,129,0.10), transparent 30%), linear-gradient(135deg, rgba(255,255,255,0.10), rgba(255,255,255,0.02))",
      border: "1px solid",
      borderColor: "borderSubtle",
      borderRadius: "panel",
      boxShadow: "glass",
      backdropFilter: "blur(16px)",
      position: "relative",
      overflow: "hidden",
    },
    glassCard: {
      bg: "surfaceStrong",
      backgroundImage: "none",
      border: "1px solid",
      borderColor: "borderSubtle",
      borderRadius: "card",
      boxShadow: "glass",
      backdropFilter: "blur(14px)",
      position: "relative",
      overflow: "hidden",
    },
    glassTile: {
      bg: "surfaceMuted",
      backgroundImage:
        "radial-gradient(circle at 100% 100%, rgba(59,130,246,0.08), transparent 30%), linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02))",
      border: "1px solid",
      borderColor: "borderSubtle",
      borderRadius: "20px",
      position: "relative",
      overflow: "hidden",
    },
    menuItem: {
      borderRadius: "control",
      border: "1px solid",
      borderColor: "borderSubtle",
      transition: "all 0.2s ease",
      _hover: {
        bg: "hoverAccent",
        color: "textPrimary",
        transform: "translateX(2px)",
        boxShadow: "inset 0 0 0 1px rgba(15,23,42,0.10)",
      },
    },
  },
  styles: {
    global: (props) => ({
      "html, body, #root": { minHeight: "100%" },
      "html, body": {
        overflowX: "clip",
      },
      "#root": {
        position: "relative",
        minHeight: "100%",
        // Keep the app root out of the scroll-container chain so viewport
        // sticky panels (notably the nutrition live summary) can follow the
        // page. The html/body rule above still clips horizontal overflow.
        overflowX: "visible",
        overflowY: "visible",
      },
      body: {
        bg: mode("#F6F9FC", "#0B1120")(props),
        backgroundImage: mode(
          [
            "radial-gradient(circle at 12% 8%, rgba(59,130,246,0.10), transparent 28%)",
            "radial-gradient(circle at 88% 12%, rgba(16,185,129,0.08), transparent 26%)",
            "radial-gradient(circle at 64% 86%, rgba(245,158,11,0.06), transparent 30%)",
          ].join(", "),
          [
            "radial-gradient(circle at 12% 8%, rgba(59,130,246,0.14), transparent 28%)",
            "radial-gradient(circle at 88% 12%, rgba(16,185,129,0.10), transparent 28%)",
            "radial-gradient(circle at 64% 86%, rgba(245,158,11,0.08), transparent 32%)",
          ].join(", ")
        )(props),
        backgroundAttachment: "fixed",
        color: mode("#111827", "#F8FAFC")(props),
      },
      "*::placeholder": {
        color: mode("rgba(17,24,39,0.42)", "rgba(248,250,252,0.38)")(props),
      },
      "::selection": {
        background: mode("rgba(15,23,42,0.16)", "rgba(255,255,255,0.22)")(props),
      },
    }),
  },
  components: {
    Button: {
      baseStyle: {
        fontWeight: "800",
        borderRadius: "14px",
      },
      variants: {
        solid: (props) => ({
          bg:
            props.colorScheme === "red"
              ? mode("red.500", "red.400")(props)
              : mode("#111827", "rgba(255,255,255,0.16)")(props),
          color: "white",
          boxShadow: mode("soft", "softDark")(props),
          _hover: {
            bg:
              props.colorScheme === "red"
                ? mode("red.600", "red.300")(props)
                : mode("#1F2937", "rgba(255,255,255,0.22)")(props),
          },
          _active: {
            bg:
              props.colorScheme === "red"
                ? mode("red.700", "red.200")(props)
                : mode("#374151", "rgba(255,255,255,0.28)")(props),
          },
        }),
        outline: (props) => ({
          bg: mode("rgba(15,23,42,0.04)", "rgba(255,255,255,0.06)")(props),
          border: "1px solid",
          borderColor: mode("rgba(15,23,42,0.08)", "rgba(255,255,255,0.10)")(props),
          color: mode("gray.900", "white")(props),
          _hover: {
            bg: mode("rgba(15,23,42,0.07)", "rgba(255,255,255,0.10)")(props),
            borderColor: mode("rgba(15,23,42,0.12)", "rgba(255,255,255,0.16)")(props),
          },
        }),
        ghost: (props) => ({
          color: mode("gray.900", "white")(props),
          _hover: {
            bg: mode("rgba(15,23,42,0.06)", "rgba(255,255,255,0.10)")(props),
            color: mode("gray.900", "white")(props),
          },
        }),
      },
      defaultProps: {
        colorScheme: "brand",
      },
    },
    Heading: {
      baseStyle: {
        color: "textPrimary",
        fontWeight: "900",
        letterSpacing: "-0.02em",
      },
    },
    Card: {
      baseStyle: {
        container: {
          bg: "surfaceStrong",
          backgroundImage: "none",
          border: "1px solid",
          borderColor: "borderSubtle",
          borderRadius: "card",
          boxShadow: "glass",
          backdropFilter: "blur(14px)",
          overflow: "hidden",
        },
      },
    },
    Alert: alertTheme,
    Menu: {
      baseStyle: {
        list: {
          bg: "surfaceStrong",
          borderColor: "borderSubtle",
          borderRadius: "panel",
          boxShadow: "glass",
          backdropFilter: "blur(16px)",
        },
        item: {
          borderRadius: "control",
          fontWeight: "800",
        },
      },
    },
    Modal: {
      baseStyle: {
        dialog: {
          borderRadius: "panel",
          bg: "surfaceStrong",
          border: "1px solid",
          borderColor: "borderSubtle",
          boxShadow: "glass",
        },
      },
    },
    Input: {
      variants: {
        outline: (props) => ({
          field: {
            bg: mode("rgba(255,255,255,0.72)", "rgba(15,23,42,0.68)")(props),
            borderColor: mode("rgba(15,23,42,0.08)", "rgba(255,255,255,0.10)")(props),
            borderRadius: "16px",
            _hover: {
              borderColor: mode("rgba(15,23,42,0.14)", "rgba(255,255,255,0.18)")(props),
            },
            _focusVisible: {
              borderColor: mode("#111827", "rgba(255,255,255,0.28)")(props),
              boxShadow: mode(
                "0 0 0 1px rgba(15,23,42,0.18)",
                "0 0 0 1px rgba(255,255,255,0.22)"
              )(props),
            },
          },
        }),
      },
    },
    Select: {
      variants: {
        outline: (props) => ({
          field: {
            bg: mode("rgba(255,255,255,0.72)", "rgba(15,23,42,0.68)")(props),
            borderColor: mode("rgba(15,23,42,0.08)", "rgba(255,255,255,0.10)")(props),
            borderRadius: "16px",
            _hover: {
              borderColor: mode("rgba(15,23,42,0.14)", "rgba(255,255,255,0.18)")(props),
            },
            _focusVisible: {
              borderColor: mode("#111827", "rgba(255,255,255,0.28)")(props),
              boxShadow: mode(
                "0 0 0 1px rgba(15,23,42,0.18)",
                "0 0 0 1px rgba(255,255,255,0.22)"
              )(props),
            },
          },
        }),
      },
    },
    Textarea: {
      variants: {
        outline: (props) => ({
          bg: mode("rgba(255,255,255,0.72)", "rgba(15,23,42,0.68)")(props),
          borderColor: mode("rgba(15,23,42,0.08)", "rgba(255,255,255,0.10)")(props),
          borderRadius: "16px",
          _hover: {
            borderColor: mode("rgba(15,23,42,0.14)", "rgba(255,255,255,0.18)")(props),
          },
          _focusVisible: {
            borderColor: mode("#111827", "rgba(255,255,255,0.28)")(props),
            boxShadow: mode(
              "0 0 0 1px rgba(15,23,42,0.18)",
              "0 0 0 1px rgba(255,255,255,0.22)"
            )(props),
          },
        }),
      },
    },
    Progress: {
      baseStyle: (props) => ({
        track: {
          bg: mode("rgba(15,23,42,0.06)", "rgba(255,255,255,0.08)")(props),
          borderRadius: "999px",
        },
        filledTrack: isNeutralAccentScheme(props.colorScheme)
          ? {
              background: brandProgressGradient,
              borderRadius: "999px",
            }
          : {
              borderRadius: "999px",
            },
      }),
    },
    Badge: {
      variants: {
        subtle: (props) =>
          isNeutralAccentScheme(props.colorScheme)
            ? {
                bg: mode("rgba(15,23,42,0.06)", "rgba(255,255,255,0.10)")(props),
                color: mode("gray.700", "gray.100")(props),
                borderRadius: "999px",
                border: "1px solid",
                borderColor: mode("rgba(15,23,42,0.10)", "rgba(255,255,255,0.14)")(props),
              }
            : {},
        solid: (props) =>
          isNeutralAccentScheme(props.colorScheme)
            ? {
                bg: mode("#111827", "rgba(255,255,255,0.18)")(props),
                color: "white",
                borderRadius: "999px",
              }
            : {},
      },
    },
    Tag: {
      variants: {
        subtle: (props) =>
          isNeutralAccentScheme(props.colorScheme)
            ? {
                container: {
                  bg: mode("rgba(15,23,42,0.06)", "rgba(255,255,255,0.10)")(props),
                  color: mode("gray.700", "gray.100")(props),
                  borderRadius: "999px",
                  border: "1px solid",
                  borderColor: mode("rgba(15,23,42,0.10)", "rgba(255,255,255,0.14)")(props),
                },
              }
            : {},
        solid: (props) =>
          isNeutralAccentScheme(props.colorScheme)
            ? {
                container: {
                  bg: mode("#111827", "rgba(255,255,255,0.18)")(props),
                  color: "white",
                  borderRadius: "999px",
                },
              }
            : {},
      },
    },
    Tabs: {
      variants: {
        enclosed: (props) => ({
          tab: isNeutralAccentScheme(props.colorScheme)
            ? {
                borderRadius: "14px",
                border: "1px solid",
                borderColor: "transparent",
                _selected: {
                  bg: mode("rgba(15,23,42,0.08)", "rgba(255,255,255,0.12)")(props),
                  color: mode("gray.900", "white")(props),
                  borderColor: mode("rgba(15,23,42,0.10)", "rgba(255,255,255,0.14)")(props),
                },
              }
            : {},
          tablist: {
            gap: "8px",
            borderBottom: "none",
          },
        }),
      },
    },
  },
});

export default theme;
