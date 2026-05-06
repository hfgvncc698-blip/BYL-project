// src/pages/ContactPage.jsx
import React, { useState } from "react";
import {
  Box,
  Heading,
  FormControl,
  FormLabel,
  Input,
  Textarea,
  Button,
  Stack,
  useToast,
} from "@chakra-ui/react";
import { useTranslation } from "react-i18next";
import { useAppTheme } from "../styles/appTheme";
import { notify } from "../utils/notify";

export default function ContactPage() {
  const { t } = useTranslation("common");
  const theme = useAppTheme();
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const toast = useToast();
  const [isLoading, setLoading] = useState(false);

  // Si tu as une variable d'env Vite, elle peut surcharger le comportement
  // Exemple: VITE_API_BASE=https://boostyourlife.coach/api
  const API_BASE = import.meta.env.VITE_API_BASE || "";

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      notify(toast, "saveSuccess", {
        title: t("contact.toast.success.title", "Message envoyé"),
        description: t(
          "contact.toast.success.desc",
          "Merci ! Nous vous répondrons rapidement."
        ),
      });

      setForm({ name: "", email: "", message: "" });
    } catch (err) {
      console.error(err);
      notify(toast, "saveError", {
        title: t("contact.toast.error.title", "Erreur"),
        description: t(
          "contact.toast.error.desc",
          "Impossible d’envoyer le message. Réessayez."
        ),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box bg={theme.pageBg} minH="100vh" p={{ base: 4, md: 8 }}>
      <Box {...theme.cardProps} p={{ base: 6, md: 8 }} maxW="600px" mx="auto">
      <Heading as="h1" mb={6} textAlign="center">
        {t("contact.title", "Contact")}
      </Heading>

      <Box as="form" onSubmit={handleSubmit}>
        <Stack spacing={4}>
          <FormControl id="name" isRequired>
            <FormLabel>{t("contact.fields.name.label", "Nom")}</FormLabel>
            <Input
              {...theme.inputProps}
              name="name"
              value={form.name}
              onChange={handleChange}
              placeholder={t("contact.fields.name.placeholder", "Votre nom")}
              autoComplete="name"
            />
          </FormControl>

          <FormControl id="email" isRequired>
            <FormLabel>{t("contact.fields.email.label", "E-mail")}</FormLabel>
            <Input
              {...theme.inputProps}
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              placeholder={t(
                "contact.fields.email.placeholder",
                "Votre e-mail"
              )}
              autoComplete="email"
            />
          </FormControl>

          <FormControl id="message" isRequired>
            <FormLabel>
              {t("contact.fields.message.label", "Message")}
            </FormLabel>
            <Textarea
              {...theme.inputProps}
              name="message"
              value={form.message}
              onChange={handleChange}
              placeholder={t(
                "contact.fields.message.placeholder",
                "Votre message"
              )}
            />
          </FormControl>

          <Button
            type="submit"
            {...theme.primaryButtonProps}
            size="md"
            isLoading={isLoading}
          >
            {t("contact.submit", "Envoyer")}
          </Button>
        </Stack>
      </Box>
      </Box>
    </Box>
  );
}
