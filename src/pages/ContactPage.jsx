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

export default function ContactPage() {
  const { t } = useTranslation("common");
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const toast = useToast();
  const [isLoading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast({
        title: t("contact.toast.success.title"),
        description: t("contact.toast.success.desc"),
        status: "success",
        duration: 5000,
        isClosable: true,
      });
      setForm({ name: "", email: "", message: "" });
    } catch (err) {
      console.error(err);
      toast({
        title: t("contact.toast.error.title"),
        description: t("contact.toast.error.desc"),
        status: "error",
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box p={8} maxW="600px" mx="auto">
      <Heading as="h1" mb={6} textAlign="center">
        {t("contact.title")}
      </Heading>
      <Box as="form" onSubmit={handleSubmit}>
        <Stack spacing={4}>
          <FormControl id="name" isRequired>
            <FormLabel>{t("contact.fields.name.label")}</FormLabel>
            <Input
              name="name"
              value={form.name}
              onChange={handleChange}
              placeholder={t("contact.fields.name.placeholder")}
              autoComplete="name"
            />
          </FormControl>

          <FormControl id="email" isRequired>
            <FormLabel>{t("contact.fields.email.label")}</FormLabel>
            <Input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              placeholder={t("contact.fields.email.placeholder")}
              autoComplete="email"
            />
          </FormControl>

          <FormControl id="message" isRequired>
            <FormLabel>{t("contact.fields.message.label")}</FormLabel>
            <Textarea
              name="message"
              value={form.message}
              onChange={handleChange}
              placeholder={t("contact.fields.message.placeholder")}
            />
          </FormControl>

          <Button
            type="submit"
            colorScheme="blue"
            size="md"
            isLoading={isLoading}
          >
            {t("contact.submit")}
          </Button>
        </Stack>
      </Box>
    </Box>
  );
}

