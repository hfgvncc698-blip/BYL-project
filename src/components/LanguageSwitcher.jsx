import React from "react";
import {
  Menu, MenuButton, MenuList, MenuItem, Button, useColorModeValue,
} from "@chakra-ui/react";
import { useTranslation } from "react-i18next";
import { doc, updateDoc, setDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { useAuth } from "../AuthContext";

const LANGS = [
  { code: "fr", label: "Français" },
  { code: "en", label: "English" },
  { code: "de", label: "Deutsch" },
  { code: "it", label: "Italiano" },
  { code: "es", label: "Español" },
  { code: "ru", label: "Русский" },
  { code: "ar", label: "العربية" },
];

const SUPPORTED = LANGS.map((l) => l.code);

export default function LanguageSwitcher({ buttonProps = {}, menuProps = {} }) {
  const { i18n } = useTranslation();
  const { user } = useAuth();
  const current = (i18n.resolvedLanguage || "fr").split("-")[0];

  const buttonBg = useColorModeValue("transparent", "rgba(255,255,255,0.08)");
  const buttonColor = useColorModeValue("black", "white");
  const buttonBorderColor = useColorModeValue("rgba(255,255,255,0.8)", "rgba(255,255,255,0.32)");
  const menuBg = useColorModeValue("white", "gray.900");
  const menuColor = useColorModeValue("black", "white");
  const menuBorderColor = useColorModeValue("gray.200", "whiteAlpha.150");
  const itemHoverBg = useColorModeValue("gray.100", "whiteAlpha.100");

  const change = async (lng) => {
    if (!SUPPORTED.includes(lng)) return;
    await i18n.changeLanguage(lng);
    localStorage.setItem("i18nextLng", lng);

    if (user?.uid) {
      try {
        await updateDoc(doc(db, "users", user.uid), {
          "settings.defaultLanguage": lng,
        });
      } catch {
        await setDoc(
          doc(db, "users", user.uid),
          { settings: { defaultLanguage: lng } },
          { merge: true }
        );
      }
    }
  };

  return (
    <Menu {...menuProps}>
      <MenuButton
        as={Button}
        size="sm"
        variant="outline"
        minW="52px"
        px={2}
        borderColor={buttonBorderColor}
        color={buttonColor}
        bg={buttonBg}
        _hover={{ bg: useColorModeValue("whiteAlpha.200", "whiteAlpha.200") }}
        _active={{ bg: useColorModeValue("whiteAlpha.300", "whiteAlpha.300") }}
        {...buttonProps}
      >
        {current.toUpperCase()}
      </MenuButton>
      <MenuList
        bg={menuBg}
        color={menuColor}
        borderColor={menuBorderColor}
        minW="unset"
        w="auto"
        p={0}
      >
        {LANGS.map((lang) => (
          <MenuItem
            key={lang.code}
            onClick={() => change(lang.code)}
            justifyContent="center"
            _hover={{ bg: itemHoverBg }}
            color={menuColor}
          >
            {lang.label}
          </MenuItem>
        ))}
      </MenuList>
    </Menu>
  );
}

