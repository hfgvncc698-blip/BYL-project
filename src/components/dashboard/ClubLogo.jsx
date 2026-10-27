import React, { useState } from "react";
import { Box, Image, useColorModeValue } from "@chakra-ui/react";

export default function ClubLogo({ src, alt, imageProps, adaptiveSize, ...props }) {
  const [dimensions, setDimensions] = useState(null);
  const ratio = dimensions?.src === src ? dimensions.ratio : 1;
  const resize = (size, axis) => {
    const height = Number(size) / Math.max(1, ratio / 2);
    return `${axis === "w" ? height * ratio : height}px`;
  };
  const dimension = (axis) => typeof adaptiveSize === "object"
    ? Object.fromEntries(Object.entries(adaptiveSize).map(([key, size]) => [key, resize(size, axis)]))
    : resize(adaptiveSize, axis);
  const adaptiveProps = adaptiveSize ? { w: dimension("w"), h: dimension("h") } : {};
  const loadedImageProps = {
    ...imageProps,
    onLoad: (event) => {
      const img = event.currentTarget;
      if (img.naturalWidth && img.naturalHeight) setDimensions({ src, ratio: img.naturalWidth / img.naturalHeight });
      imageProps?.onLoad?.(event);
    },
  };
  const background = useColorModeValue("white", "#111827");
  const border = useColorModeValue("blackAlpha.100", "whiteAlpha.200");
  const defaultLogo = <Image src="/logo-byl.png?v=palm-20261027" alt={alt} w="100%" h="100%" objectFit="contain" display="block" {...loadedImageProps} />;
  return (
    <Box bg={background} border="1px solid" borderColor={border} overflow="hidden" flexShrink={0} {...props} {...adaptiveProps}>
      {src && src.split("?")[0] !== "/logo-byl.png"
        ? <Image src={src} alt={alt} w="100%" h="100%" objectFit="contain" display="block" {...loadedImageProps} fallback={defaultLogo} />
        : defaultLogo}
    </Box>
  );
}
