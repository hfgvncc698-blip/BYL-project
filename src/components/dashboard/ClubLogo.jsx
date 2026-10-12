import React from "react";
import { Box, Image, useColorModeValue } from "@chakra-ui/react";

export default function ClubLogo({ src, alt, imageProps, ...props }) {
  const background = useColorModeValue("white", "#111827");
  const border = useColorModeValue("blackAlpha.100", "whiteAlpha.200");
  const defaultFilter = useColorModeValue("none", "brightness(0) invert(1)");
  const defaultLogo = <Image src="/logo-byl.png" alt={alt} w="100%" h="100%" objectFit="contain" filter={defaultFilter} />;
  return (
    <Box bg={background} border="1px solid" borderColor={border} overflow="hidden" flexShrink={0} {...props}>
      {src && src !== "/logo-byl.png"
        ? <Image src={src} alt={alt} w="100%" h="100%" objectFit="contain" {...imageProps} fallback={defaultLogo} />
        : defaultLogo}
    </Box>
  );
}
