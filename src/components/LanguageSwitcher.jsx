import React from "react";
import {
  Menu, MenuButton, MenuList, MenuItem, Button
} from "@chakra-ui/react";
import { useTranslation } from "react-i18next";
import { doc, updateDoc, setDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { useAuth } from "../AuthContext";

const SUPPORTED = ["fr","en","it","es","de","ru","ar"];

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const { user } = useAuth();
  const current = (i18n.resolvedLanguage || "fr").split("-")[0];

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
    <Menu>
      <MenuButton
        as={Button}
        size="sm"
        variant="outline"
        minW="52px"
        px={2}
        borderColor="white"
        color="white"
        bg="transparent"
        _hover={{ bg: "whiteAlpha.200" }}
        _active={{ bg: "whiteAlpha.300" }}
      >
        {current.toUpperCase()}
      </MenuButton>
      <MenuList
        bg="white"
        color="black"
        borderColor="gray.200"
        minW="unset"
        w="76px"
        p={0}
      >
        {SUPPORTED.map((l) => (
          <MenuItem
            key={l}
            onClick={() => change(l)}
            justifyContent="center"
            _hover={{ bg: "gray.100" }}
          >
            {l.toUpperCase()}
          </MenuItem>
        ))}
      </MenuList>
    </Menu>
  );
}

