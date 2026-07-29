import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  AlertIcon,
  Badge,
  Box,
  Button,
  Card,
  CardBody,
  CardHeader,
  Heading,
  HStack,
  Icon,
  Input,
  Select,
  SimpleGrid,
  Stat,
  StatLabel,
  StatNumber,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  VStack,
  useToast,
} from "@chakra-ui/react";
import { Link as RouterLink } from "react-router-dom";
import { MdArrowBack, MdCancel, MdEmail, MdOpenInNew, MdRefresh } from "react-icons/md";
import { getApiBase } from "../utils/apiBase";
import { getAuthHeaders } from "../utils/authHeaders";
import { useAppTheme } from "../styles/appTheme";

const TYPE_LABELS = {
  welcome: "Bienvenue",
  accountActivation: "Activation du compte",
  accountEmailVerification: "Vérification de l’adresse",
  passwordReset: "Réinitialisation du mot de passe",
  programCompleted: "Programme terminé",
  inactivity: "Rappel d’inactivité",
  trialReminder3: "Essai — J-3",
  trialReminder1: "Essai — J-1",
};

function typeLabel(type, fallback = "") {
  return TYPE_LABELS[type] || fallback || type || "E-mail";
}

function toLocale(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime())
    ? date.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })
    : "—";
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

export default function AdminEmails() {
  const theme = useAppTheme();
  const toast = useToast();
  const muted = theme.mutedText;
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const [horizon, setHorizon] = useState("30");
  const [cancelBusy, setCancelBusy] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${getApiBase()}/admin-emails/upcoming`, {
        headers: { ...(await getAuthHeaders()) },
        credentials: "include",
      });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data?.error || "global-upcoming-email-failed");
      setRows(Array.isArray(data?.upcoming) ? data.upcoming : []);
    } catch (loadError) {
      setError(loadError.message || "Impossible de charger les prochains e-mails.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const maxDate =
      horizon === "all"
        ? Number.POSITIVE_INFINITY
        : Date.now() + Number(horizon) * 24 * 60 * 60 * 1000;
    return rows.filter((row) => {
      const due = new Date(row.dueAt).getTime();
      if (Number.isFinite(maxDate) && due > maxDate) return false;
      if (type !== "all" && row.type !== type) return false;
      if (
        needle &&
        ![row.clientName, row.email, row.subject, row.detail, typeLabel(row.type, row.label)]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(needle))
      ) {
        return false;
      }
      return true;
    });
  }, [rows, search, type, horizon]);

  const types = useMemo(
    () => [...new Set(rows.map((row) => row.type).filter(Boolean))].sort(),
    [rows]
  );

  const nextSevenDays = useMemo(() => {
    const limit = Date.now() + 7 * 24 * 60 * 60 * 1000;
    return rows.filter((row) => new Date(row.dueAt).getTime() <= limit).length;
  }, [rows]);

  const uniqueClients = useMemo(
    () => new Set(rows.map((row) => row.clientId || row.userId).filter(Boolean)).size,
    [rows]
  );

  const cancel = async (row) => {
    if (
      !window.confirm(
        `Ne pas envoyer « ${row.subject} » à ${row.clientName || row.email || "ce client"} ?`
      )
    ) {
      return;
    }
    setCancelBusy(row.id);
    try {
      const response = await fetch(
        `${getApiBase()}/admin-emails/upcoming/${encodeURIComponent(row.id)}/cancel`,
        {
          method: "POST",
          headers: { ...(await getAuthHeaders()) },
          credentials: "include",
        }
      );
      const data = await readJson(response);
      if (!response.ok) throw new Error(data?.error || "scheduled-email-cancel-failed");
      setRows((current) => current.filter((item) => item.id !== row.id));
      toast({
        title: "Envoi annulé",
        description: `${row.clientName || row.email} ne recevra pas cet e-mail.`,
        status: "success",
        duration: 4500,
        isClosable: true,
      });
    } catch (cancelError) {
      toast({
        title: "Annulation impossible",
        description: cancelError.message || "L’envoi n’a pas été modifié.",
        status: "error",
        duration: 6000,
        isClosable: true,
      });
    } finally {
      setCancelBusy("");
    }
  };

  return (
    <Box bg={theme.pageBg} color={theme.textColor} minH="calc(100vh - 112px)" p={{ base: 4, md: 8 }}>
      <VStack align="stretch" spacing={6} maxW="1680px" mx="auto">
        <HStack justify="space-between" align="center" flexWrap="wrap" gap={4}>
          <HStack spacing={3}>
            <Button
              as={RouterLink}
              to="/admin"
              size="sm"
              variant="outline"
              leftIcon={<Icon as={MdArrowBack} />}
            >
              Admin
            </Button>
            <Box>
              <Heading size={{ base: "md", md: "lg" }}>E-mails prévus</Heading>
              <Text color={muted} fontSize="sm">
                Vue globale des prochains e-mails automatiques de tous les clients.
              </Text>
            </Box>
          </HStack>
          <Button
            leftIcon={<Icon as={MdRefresh} />}
            variant="outline"
            onClick={load}
            isLoading={loading}
          >
            Rafraîchir
          </Button>
        </HStack>

        {error ? (
          <Alert status="error" borderRadius="lg">
            <AlertIcon />
            {error}
          </Alert>
        ) : null}

        <SimpleGrid columns={{ base: 1, sm: 3 }} spacing={4}>
          <Card>
            <CardBody>
              <Stat>
                <StatLabel>Envois prévus</StatLabel>
                <StatNumber>{rows.length}</StatNumber>
              </Stat>
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <Stat>
                <StatLabel>Dans les 7 prochains jours</StatLabel>
                <StatNumber>{nextSevenDays}</StatNumber>
              </Stat>
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <Stat>
                <StatLabel>Clients concernés</StatLabel>
                <StatNumber>{uniqueClients}</StatNumber>
              </Stat>
            </CardBody>
          </Card>
        </SimpleGrid>

        <Card>
          <CardHeader>
            <HStack justify="space-between" flexWrap="wrap" gap={3}>
              <Box>
                <Heading size="md">Planning des envois</Heading>
                <Text color={muted} fontSize="sm">
                  Une annulation ici est aussi visible dans la fiche du client.
                </Text>
              </Box>
              <Badge colorScheme="blue">{filtered.length} résultat(s)</Badge>
            </HStack>
          </CardHeader>
          <CardBody>
            <SimpleGrid columns={{ base: 1, md: 3 }} spacing={3} mb={5}>
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Nom, e-mail, programme…"
              />
              <Select value={type} onChange={(event) => setType(event.target.value)}>
                <option value="all">Tous les types</option>
                {types.map((item) => (
                  <option key={item} value={item}>
                    {typeLabel(item)}
                  </option>
                ))}
              </Select>
              <Select value={horizon} onChange={(event) => setHorizon(event.target.value)}>
                <option value="7">7 prochains jours</option>
                <option value="30">30 prochains jours</option>
                <option value="90">90 prochains jours</option>
                <option value="all">Toutes les dates</option>
              </Select>
            </SimpleGrid>

            {loading ? (
              <Text color={muted}>Chargement des e-mails prévus…</Text>
            ) : filtered.length === 0 ? (
              <Text color={muted}>Aucun e-mail prévu ne correspond aux filtres.</Text>
            ) : (
              <Box overflowX="auto">
                <Table size="sm">
                  <Thead>
                    <Tr>
                      <Th>Éligible à partir du</Th>
                      <Th>Client</Th>
                      <Th>Type</Th>
                      <Th>Objet</Th>
                      <Th textAlign="right">Actions</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {filtered.map((row) => {
                      const profileId = row.clientId || row.userId;
                      return (
                        <Tr key={row.id}>
                          <Td minW="165px" fontWeight="700">
                            {toLocale(row.dueAt)}
                            <Text color={muted} fontSize="xs" fontWeight="500">
                              Traitement vers 09:00
                            </Text>
                          </Td>
                          <Td minW="220px">
                            <Text fontWeight="700">{row.clientName || "Client"}</Text>
                            <Text color={muted} fontSize="xs">
                              {row.email || "Adresse manquante"}
                            </Text>
                          </Td>
                          <Td minW="170px">
                            <Badge colorScheme="orange">
                              {typeLabel(row.type, row.label)}
                            </Badge>
                          </Td>
                          <Td minW="280px">
                            <Text fontWeight="700">{row.subject}</Text>
                            {row.detail ? (
                              <Text color={muted} fontSize="xs">
                                {row.detail}
                              </Text>
                            ) : null}
                          </Td>
                          <Td minW="250px">
                            <HStack justify="flex-end">
                              {profileId ? (
                                <Button
                                  as={RouterLink}
                                  to={`/admin/client/${encodeURIComponent(profileId)}`}
                                  size="xs"
                                  variant="outline"
                                  leftIcon={<Icon as={MdOpenInNew} />}
                                >
                                  Voir la fiche
                                </Button>
                              ) : null}
                              <Button
                                size="xs"
                                colorScheme="red"
                                variant="outline"
                                leftIcon={<Icon as={MdCancel} />}
                                onClick={() => cancel(row)}
                                isLoading={cancelBusy === row.id}
                              >
                                Ne pas envoyer
                              </Button>
                            </HStack>
                          </Td>
                        </Tr>
                      );
                    })}
                  </Tbody>
                </Table>
              </Box>
            )}
          </CardBody>
        </Card>

        <HStack color={muted} fontSize="sm">
          <Icon as={MdEmail} />
          <Text>
            Les adresses suspendues, les catégories désactivées et les envois déjà annulés ne sont pas affichés.
          </Text>
        </HStack>
      </VStack>
    </Box>
  );
}
