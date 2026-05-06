import { useColorModeValue } from "@chakra-ui/react";

export function useAppTheme() {
  const pageBg = useColorModeValue("#F5F7FB", "#070B14");
  const surfaceBg = useColorModeValue(
    [
      "radial-gradient(circle at 88% 14%, rgba(59,130,246,0.14), transparent 28%)",
      "radial-gradient(circle at 12% 100%, rgba(16,185,129,0.10), transparent 30%)",
      "linear-gradient(135deg, rgba(255,255,255,0.94), rgba(248,250,252,0.82))",
    ].join(", "),
    [
      "radial-gradient(circle at 88% 18%, rgba(59,130,246,0.18), transparent 30%)",
      "radial-gradient(circle at 10% 105%, rgba(16,185,129,0.14), transparent 34%)",
      "linear-gradient(135deg, rgba(15,21,35,0.92), rgba(11,16,27,0.86))",
    ].join(", ")
  );
  const surfaceBgStrong = useColorModeValue(
    [
      "radial-gradient(circle at 90% 10%, rgba(59,130,246,0.10), transparent 26%)",
      "linear-gradient(135deg, rgba(255,255,255,0.98), rgba(248,250,252,0.9))",
    ].join(", "),
    [
      "radial-gradient(circle at 90% 10%, rgba(59,130,246,0.13), transparent 28%)",
      "linear-gradient(135deg, rgba(11,16,27,0.98), rgba(15,23,42,0.92))",
    ].join(", ")
  );
  const surfaceSoft = useColorModeValue(
    [
      "radial-gradient(circle at 100% 100%, rgba(59,130,246,0.09), transparent 30%)",
      "linear-gradient(135deg, rgba(248,250,252,0.96), rgba(255,255,255,0.82))",
    ].join(", "),
    [
      "radial-gradient(circle at 100% 100%, rgba(59,130,246,0.10), transparent 32%)",
      "linear-gradient(135deg, rgba(255,255,255,0.055), rgba(255,255,255,0.025))",
    ].join(", ")
  );
  const surfaceGlow = useColorModeValue(
    [
      "radial-gradient(circle at 18% 26%, rgba(16,185,129,0.13), transparent 28%)",
      "radial-gradient(circle at 84% 18%, rgba(59,130,246,0.16), transparent 30%)",
      "radial-gradient(circle at 52% 105%, rgba(245,158,11,0.08), transparent 34%)",
      "linear-gradient(135deg, rgba(255,255,255,0.98), rgba(236,244,255,0.72))",
    ].join(", "),
    [
      "radial-gradient(circle at 18% 28%, rgba(16,185,129,0.18), transparent 28%)",
      "radial-gradient(circle at 84% 20%, rgba(59,130,246,0.19), transparent 32%)",
      "radial-gradient(circle at 54% 108%, rgba(245,158,11,0.10), transparent 35%)",
      "linear-gradient(135deg, rgba(15,23,42,0.96), rgba(14,28,48,0.76))",
    ].join(", ")
  );
  const borderColor = useColorModeValue("rgba(15,23,42,0.08)", "rgba(255,255,255,0.08)");
  const borderStrong = useColorModeValue("rgba(15,23,42,0.13)", "rgba(255,255,255,0.14)");
  const textColor = useColorModeValue("#111827", "white");
  const mutedText = useColorModeValue("#64748B", "rgba(255,255,255,0.64)");
  const subtleText = useColorModeValue("#94A3B8", "rgba(255,255,255,0.42)");
  const primary = useColorModeValue("#111827", "rgba(255,255,255,0.16)");
  const primaryHover = useColorModeValue("#1F2937", "rgba(255,255,255,0.22)");
  const accentBlue = "#3B82F6";
  const accentGreen = "#10B981";

  const cardProps = {
    bg: surfaceBg,
    border: "1px solid",
    borderColor,
    borderRadius: "28px",
    position: "relative",
    overflow: "hidden",
    boxShadow: useColorModeValue("0 22px 70px rgba(15,23,42,0.08)", "0 22px 70px rgba(0,0,0,0.28)"),
    backdropFilter: "blur(18px)",
  };

  const tileProps = {
    bg: surfaceSoft,
    border: "1px solid",
    borderColor,
    borderRadius: "20px",
    position: "relative",
    overflow: "hidden",
  };

  const primaryButtonProps = {
    bg: primary,
    color: "white",
    borderRadius: "16px",
    _hover: { bg: primaryHover, transform: "translateY(-1px)" },
    _active: { transform: "translateY(0)" },
  };

  const inputProps = {
    bg: surfaceSoft,
    borderColor,
    borderRadius: "16px",
    color: textColor,
    _hover: { borderColor: borderStrong },
    _focusVisible: {
      borderColor: accentBlue,
      boxShadow: "0 0 0 1px rgba(59,130,246,0.35)",
    },
  };

  return {
    pageBg,
    surfaceBg,
    surfaceBgStrong,
    surfaceSoft,
    surfaceGlow,
    borderColor,
    borderStrong,
    textColor,
    mutedText,
    subtleText,
    primary,
    primaryHover,
    accentBlue,
    accentGreen,
    cardProps,
    tileProps,
    primaryButtonProps,
    inputProps,
  };
}
