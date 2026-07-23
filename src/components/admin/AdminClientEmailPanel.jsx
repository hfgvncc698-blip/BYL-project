import React, { useEffect, useState } from "react";
import {
  Alert,
  AlertIcon,
  Badge,
  Box,
  Button,
  Card,
  CardBody,
  CardHeader,
  Divider,
  FormControl,
  FormLabel,
  Heading,
  HStack,
  Icon,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Select,
  SimpleGrid,
  Switch,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Text,
  Textarea,
  Tr,
  VStack,
  useToast,
} from "@chakra-ui/react";
import {
  MdCancel,
  MdContentCopy,
  MdEmail,
  MdRefresh,
  MdReplay,
  MdRestore,
  MdSend,
  MdVisibility,
} from "react-icons/md";
import { getAuthHeaders } from "../../utils/authHeaders";
import { getApiBase } from "../../utils/apiBase";
import { useAppTheme } from "../../styles/appTheme";

const DEFAULT_PREFERENCES = {
  allAutomatic: true,
  welcome: true,
  programAssigned: true,
  programCompleted: true,
  inactivity: true,
  nutritionAssigned: true,
  subscription: true,
};

const PREFERENCE_LABELS = [
  ["allAutomatic", "Tous les e-mails automatiques", "Interrupteur général pour ce client."],
  ["welcome", "Bienvenue", "Après la création du compte."],
  ["programAssigned", "Nouveau programme", "Quand un programme lui est attribué."],
  ["programCompleted", "Programme terminé", "Quand toutes les séances sont terminées."],
  ["inactivity", "Rappel d’inactivité", "Quand un programme n’a pas encore été démarré."],
  ["nutritionAssigned", "Suivi nutrition", "Quand un suivi nutrition est partagé."],
  ["subscription", "Abonnement et essai", "Activation d’abonnement, rappels d’essai à J-3/J-1 et incident de paiement."],
];

function toLocale(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleString() : "—";
}

function emailTypeLabel(type) {
  const labels = {
    manual: "Manuel",
    welcome: "Bienvenue",
    programAssigned: "Nouveau programme",
    programCompleted: "Programme terminé",
    inactivity: "Rappel d’inactivité",
    nutritionAssigned: "Suivi nutrition",
    premiumPurchase: "Programme premium",
    subscriptionWelcome: "Abonnement",
    trialReminder3: "Essai — J-3",
    trialReminder1: "Essai — J-1",
    paymentIssue: "Paiement",
  };
  return labels[type] || type || "E-mail";
}

function auditActionLabel(action) {
  const labels = {
    "preferences.updated": "Réglages automatiques modifiés",
    "email.sent": "E-mail manuel envoyé",
    "email.test_sent": "E-mail de test envoyé",
    "email.retried": "E-mail renvoyé après échec",
    "email.failed": "Échec d’envoi",
    "email.bounced": "Rebond permanent détecté",
    "scheduled_email.cancelled": "Envoi programmé annulé",
    "delivery.suspended": "Adresse suspendue",
    "delivery.resumed": "Adresse réactivée",
    "template.updated": "Modèle automatique modifié",
    "template.restored": "Modèle d’origine restauré",
  };
  return labels[action] || action || "Action administrateur";
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

export default function AdminClientEmailPanel({ clientId, profileId, audience = "client" }) {
  const resolvedProfileId = profileId || clientId;
  const recipientLabel = audience === "club" ? "club" : audience === "coach" ? "coach" : "client";
  const recipientArticle = audience === "club" ? "du club" : audience === "coach" ? "du coach" : "du client";
  const preferenceLabels =
    audience === "client"
      ? PREFERENCE_LABELS
      : PREFERENCE_LABELS.filter(([key]) => ["allAutomatic", "welcome", "subscription"].includes(key));
  const allowedTemplateTypes =
    audience === "client"
      ? null
      : new Set(["welcome", "subscriptionWelcome", "trialReminder", "paymentIssue"]);
  const toast = useToast();
  const theme = useAppTheme();
  const muted = theme.mutedText;
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [history, setHistory] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [audit, setAudit] = useState([]);
  const [templates, setTemplates] = useState({});
  const [delivery, setDelivery] = useState({});
  const [testEmail, setTestEmail] = useState("");
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [target, setTarget] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sendBusy, setSendBusy] = useState(false);
  const [preferenceBusy, setPreferenceBusy] = useState("");
  const [actionBusy, setActionBusy] = useState("");
  const [historyFilter, setHistoryFilter] = useState("all");
  const [preview, setPreview] = useState(null);
  const [templateType, setTemplateType] = useState("welcome");
  const [templateSubject, setTemplateSubject] = useState("");
  const [templateMessage, setTemplateMessage] = useState("");

  const load = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const response = await fetch(`${getApiBase()}/admin-emails/client/${encodeURIComponent(resolvedProfileId)}`, {
        headers: { ...(await getAuthHeaders()) },
        credentials: "include",
      });
      const data = await readJsonResponse(response);
      if (!response.ok) throw new Error(data?.error || "email-history-error");
      setHistory(Array.isArray(data?.history) ? data.history : []);
      setUpcoming(Array.isArray(data?.upcoming) ? data.upcoming : []);
      setAudit(Array.isArray(data?.audit) ? data.audit : []);
      setTemplates(data?.templates || {});
      setDelivery(data?.delivery || {});
      setTestEmail(data?.testEmail || "");
      setPreferences((current) => ({ ...current, ...(data?.preferences || {}) }));
      setTarget(data?.email || "");
      setLoaded(true);
    } catch (error) {
      if (!silent) {
        toast({
          title: "E-mails indisponibles",
          description: error.message || "Impossible de charger l’historique.",
          status: "error",
          duration: 6000,
          isClosable: true,
        });
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [resolvedProfileId]);

  useEffect(() => {
    const template = templates?.[templateType] || {};
    setTemplateSubject(template.subject || "");
    setTemplateMessage(template.message || "");
  }, [templateType, templates]);

  const request = async (path, options = {}) => {
    const response = await fetch(`${getApiBase()}/admin-emails/client/${encodeURIComponent(resolvedProfileId)}${path}`, {
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(await getAuthHeaders()),
        ...(options.headers || {}),
      },
      credentials: "include",
    });
    const data = await readJsonResponse(response);
    if (!response.ok) throw new Error(data?.error || "email-action-failed");
    return data;
  };

  const showActionError = (error, title = "Action impossible") => {
    const messages = {
      "duplicate-email-blocked": "Cette action a déjà été effectuée. Le doublon a été bloqué.",
      "retry-only-after-failure": "Le renvoi est disponible uniquement après un échec.",
      "email-delivery-suspended": "Les envois sont suspendus pour cette adresse.",
      "admin-test-email-missing": "Votre compte administrateur ne contient pas d’adresse de test.",
      "test-email-must-not-be-client": `L’adresse de test doit être différente de celle ${recipientArticle}.`,
    };
    toast({
      title,
      description: messages[error.message] || error.message || "Une erreur est survenue.",
      status: "error",
      duration: 6500,
      isClosable: true,
    });
  };

  const previewMessage = async ({ type = "manual", previewSubject = subject, previewMessage: body = message } = {}) => {
    setActionBusy("preview");
    try {
      const data = await request("/preview", {
        method: "POST",
        body: JSON.stringify({ type, subject: previewSubject, message: body }),
      });
      setPreview(data);
    } catch (error) {
      showActionError(error, "Prévisualisation impossible");
    } finally {
      setActionBusy("");
    }
  };

  const sendTest = async ({ type = "manual", testSubject = subject, testMessage = message } = {}) => {
    if (!testEmail || !window.confirm(`Envoyer ce test uniquement à ${testEmail} ?`)) return;
    setActionBusy("test");
    try {
      await request("/test", {
        method: "POST",
        body: JSON.stringify({
          type,
          subject: testSubject,
          message: testMessage,
          idempotencyKey: window.crypto?.randomUUID?.() || `${Date.now()}-test`,
        }),
      });
      toast({ title: "Test envoyé", description: `Destinataire : ${testEmail}`, status: "success", duration: 4500 });
      await load({ silent: true });
    } catch (error) {
      showActionError(error, "Test non envoyé");
    } finally {
      setActionBusy("");
    }
  };

  const retry = async (event) => {
    if (event.status !== "failed" || !window.confirm(`Renvoyer « ${event.subject || "cet e-mail"} » au ${recipientLabel} ?`)) return;
    setActionBusy(`retry-${event.id}`);
    try {
      await request(`/retry/${encodeURIComponent(event.id)}`, { method: "POST" });
      toast({ title: "E-mail renvoyé", status: "success", duration: 4500 });
      await load({ silent: true });
    } catch (error) {
      showActionError(error, "Renvoi impossible");
    } finally {
      setActionBusy("");
    }
  };

  const cancelUpcoming = async (item) => {
    if (!window.confirm(`Annuler l’envoi prévu « ${item.subject} » ?`)) return;
    setActionBusy(`cancel-${item.id}`);
    try {
      await request(`/upcoming/${encodeURIComponent(item.id)}/cancel`, { method: "POST" });
      toast({ title: "Envoi programmé annulé", status: "success", duration: 4500 });
      await load({ silent: true });
    } catch (error) {
      showActionError(error, "Annulation impossible");
    } finally {
      setActionBusy("");
    }
  };

  const copyContent = async (event) => {
    const content = [event.subject, event.message || event.detail].filter(Boolean).join("\n\n");
    try {
      await navigator.clipboard.writeText(content);
      toast({ title: "Contenu copié", description: "Prêt à coller dans WhatsApp ou ailleurs.", status: "success", duration: 3500 });
    } catch (error) {
      showActionError(error, "Copie impossible");
    }
  };

  const updateDelivery = async (suspended) => {
    const verb = suspended ? "Suspendre tous les futurs envois ?" : "Réactiver les futurs envois pour cette adresse ?";
    if (!window.confirm(verb)) return;
    setActionBusy("delivery");
    try {
      const data = await request("/delivery", {
        method: "PATCH",
        body: JSON.stringify({ suspended, reason: suspended ? "manual-admin" : "" }),
      });
      setDelivery(data.delivery || {});
      await load({ silent: true });
    } catch (error) {
      showActionError(error);
    } finally {
      setActionBusy("");
    }
  };

  const saveTemplate = async () => {
    if (!templateSubject.trim() || !templateMessage.trim()) return;
    setActionBusy("template-save");
    try {
      await request(`/templates/${encodeURIComponent(templateType)}`, {
        method: "PATCH",
        body: JSON.stringify({ subject: templateSubject.trim(), message: templateMessage.trim() }),
      });
      toast({ title: "Modèle enregistré", status: "success", duration: 4000 });
      await load({ silent: true });
    } catch (error) {
      showActionError(error, "Modèle non enregistré");
    } finally {
      setActionBusy("");
    }
  };

  const restoreTemplate = async () => {
    if (!window.confirm("Restaurer le modèle d’origine ?")) return;
    setActionBusy("template-restore");
    try {
      await request(`/templates/${encodeURIComponent(templateType)}`, { method: "DELETE" });
      toast({ title: "Modèle d’origine restauré", status: "success", duration: 4000 });
      await load({ silent: true });
    } catch (error) {
      showActionError(error, "Restauration impossible");
    } finally {
      setActionBusy("");
    }
  };

  const updatePreference = async (key, value) => {
    const previous = preferences;
    setPreferences({ ...previous, [key]: value });
    setPreferenceBusy(key);
    try {
      const response = await fetch(
        `${getApiBase()}/admin-emails/client/${encodeURIComponent(resolvedProfileId)}/preferences`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...(await getAuthHeaders()) },
          credentials: "include",
          body: JSON.stringify({ [key]: value }),
        }
      );
      const data = await readJsonResponse(response);
      if (!response.ok) throw new Error(data?.error || "email-preferences-error");
      setPreferences((current) => ({ ...current, ...(data?.preferences || {}) }));
    } catch (error) {
      setPreferences(previous);
      toast({
        title: "Réglage non enregistré",
        description: error.message || "Impossible de modifier les e-mails automatiques.",
        status: "error",
        duration: 6000,
        isClosable: true,
      });
    } finally {
      setPreferenceBusy("");
    }
  };

  const send = async () => {
    const cleanSubject = subject.trim();
    const cleanMessage = message.trim();
    if (!target || !cleanSubject || !cleanMessage) return;
    if (!window.confirm(`Envoyer cet e-mail à ${target} ?`)) return;

    setSendBusy(true);
    try {
      const idempotencyKey = window.crypto?.randomUUID?.() || `${Date.now()}-${cleanSubject}`;
      const response = await fetch(`${getApiBase()}/admin-emails/client/${encodeURIComponent(resolvedProfileId)}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await getAuthHeaders()) },
        credentials: "include",
        body: JSON.stringify({ subject: cleanSubject, message: cleanMessage, idempotencyKey }),
      });
      const data = await readJsonResponse(response);
      if (!response.ok) throw new Error(data?.error || "manual-email-error");
      setSubject("");
      setMessage("");
      toast({
        title: "E-mail envoyé",
        description: data?.email || target,
        status: "success",
        duration: 4500,
        isClosable: true,
      });
      await load({ silent: true });
    } catch (error) {
      toast({
        title: "E-mail non envoyé",
        description:
          error.message === "duplicate-email-blocked"
            ? "Un envoi identique a été bloqué pour éviter un doublon."
            : error.message || "Erreur d’envoi.",
        status: "error",
        duration: 6500,
        isClosable: true,
      });
    } finally {
      setSendBusy(false);
    }
  };

  const filteredHistory = history.filter((event) => {
    if (historyFilter === "automatic") return !["manual", "test"].includes(event.type) && event.source !== "admin-retry";
    if (historyFilter === "manual") return ["manual", "test"].includes(event.type) || String(event.source || "").startsWith("admin");
    if (historyFilter === "opened") return Boolean(event.firstOpenedAt || event.openedAt);
    if (historyFilter === "unopened") return event.status === "sent" && !event.firstOpenedAt && !event.openedAt;
    if (historyFilter === "failed") return ["failed", "bounced"].includes(event.status);
    return true;
  });

  return (
    <VStack align="stretch" spacing={6}>
      <HStack justify="space-between" align="center" flexWrap="wrap" gap={3}>
        <Box>
          <Heading size="md">Gestion des e-mails</Heading>
          <Text color={muted} fontSize="sm">
            Historique, envoi manuel et réglages automatiques. Les doublons sont bloqués côté serveur.
          </Text>
        </Box>
        <Button leftIcon={<Icon as={MdRefresh} />} variant="outline" onClick={() => load()} isLoading={loading}>
          Rafraîchir
        </Button>
      </HStack>

      {!target && loaded ? (
        <Alert status="warning" borderRadius="lg">
          <AlertIcon />
          Aucune adresse e-mail n’est enregistrée pour ce profil. L’envoi manuel est désactivé.
        </Alert>
      ) : null}

      {delivery?.suspended ? (
        <Alert status="error" borderRadius="lg" alignItems="flex-start">
          <AlertIcon mt="2px" />
          <Box flex="1">
            <Text fontWeight="700">Envois suspendus pour cette adresse</Text>
            <Text fontSize="sm">
              Motif : {delivery.reason || "adresse invalide ou rebond permanent"}. Aucun futur e-mail automatique ou manuel ne sera envoyé.
            </Text>
          </Box>
          <Button size="sm" onClick={() => updateDelivery(false)} isLoading={actionBusy === "delivery"}>
            Réactiver
          </Button>
        </Alert>
      ) : target ? (
        <HStack justify="flex-end">
          <Button size="sm" colorScheme="red" variant="outline" onClick={() => updateDelivery(true)} isLoading={actionBusy === "delivery"}>
            Suspendre cette adresse
          </Button>
        </HStack>
      ) : null}

      <Alert status="info" borderRadius="lg" alignItems="flex-start">
        <AlertIcon mt="2px" />
        <Box>
          <Text fontWeight="700">Les e-mails de sécurité restent séparés</Text>
          <Text fontSize="sm">
            Invitation ou création du mot de passe, réinitialisation et vérification d’adresse sont envoyées
            uniquement après une action explicite. Les factures et reçus Stripe dépendent aussi des réglages Stripe.
          </Text>
        </Box>
      </Alert>

      <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={6}>
        <Card>
          <CardHeader>
            <Heading size="md">E-mails automatiques</Heading>
            <Text color={muted} fontSize="sm">
              Tous les types restent actifs par défaut. Désactive seulement ceux qui ne sont pas utiles.
            </Text>
          </CardHeader>
          <CardBody>
            <VStack align="stretch" spacing={0} divider={<Divider />}>
              {preferenceLabels.map(([key, label, description]) => {
                const disabled = preferenceBusy === key || (key !== "allAutomatic" && !preferences.allAutomatic);
                const contextualDescription =
                  key === "allAutomatic" && audience !== "client"
                    ? `Interrupteur général pour ce ${recipientLabel}.`
                    : description;
                return (
                  <HStack key={key} justify="space-between" py={3} gap={4} align="center">
                    <Box>
                      <Text fontWeight="700">{label}</Text>
                      <Text color={muted} fontSize="sm">{contextualDescription}</Text>
                    </Box>
                    <Switch
                      colorScheme="blue"
                      isChecked={preferences[key] !== false}
                      isDisabled={disabled}
                      onChange={(event) => updatePreference(key, event.target.checked)}
                      aria-label={label}
                    />
                  </HStack>
                );
              })}
            </VStack>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <Heading size="md">Envoyer un e-mail</Heading>
            <Text color={muted} fontSize="sm">Destinataire : {target || "adresse manquante"}</Text>
          </CardHeader>
          <CardBody>
            <VStack align="stretch" spacing={4}>
              <FormControl isRequired>
                <FormLabel>Objet</FormLabel>
                <Input
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  placeholder="Objet de l’e-mail"
                  maxLength={180}
                  isDisabled={!target}
                />
              </FormControl>
              <FormControl isRequired>
                <FormLabel>Message</FormLabel>
                <Textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="Rédiger le message…"
                  minH="220px"
                  maxLength={12000}
                  isDisabled={!target}
                />
              </FormControl>
              <HStack flexWrap="wrap">
                <Button
                  leftIcon={<Icon as={MdVisibility} />}
                  variant="outline"
                  onClick={() => previewMessage()}
                  isLoading={actionBusy === "preview"}
                  isDisabled={!subject.trim() || !message.trim()}
                >
                  Prévisualiser
                </Button>
                <Button
                  leftIcon={<Icon as={MdSend} />}
                  variant="outline"
                  onClick={() => sendTest()}
                  isLoading={actionBusy === "test"}
                  isDisabled={!testEmail || !subject.trim() || !message.trim()}
                >
                  Envoyer un test
                </Button>
                <Button
                  leftIcon={<Icon as={MdEmail} />}
                  {...theme.primaryButtonProps}
                  onClick={send}
                  isLoading={sendBusy}
                  isDisabled={!target || delivery?.suspended || !subject.trim() || !message.trim()}
                >
                  Envoyer au {recipientLabel}
                </Button>
              </HStack>
              <Text fontSize="xs" color={muted}>
                Les tests sont envoyés uniquement à {testEmail || "l’adresse de votre compte administrateur"}.
              </Text>
            </VStack>
          </CardBody>
        </Card>
      </SimpleGrid>

      <SimpleGrid columns={{ base: 1, xl: 2 }} spacing={6}>
        <Card>
          <CardHeader>
            <HStack justify="space-between" flexWrap="wrap">
              <Box>
                <Heading size="md">Prochains e-mails prévus</Heading>
                <Text color={muted} fontSize="sm">
                  {audience === "client"
                    ? "Rappels d’essai, d’inactivité et fins de programme déjà planifiés."
                    : "Rappels d’essai et messages liés à l’abonnement déjà planifiés."}
                </Text>
              </Box>
              <Badge colorScheme="orange">{upcoming.length} prévu(s)</Badge>
            </HStack>
          </CardHeader>
          <CardBody>
            {upcoming.length === 0 ? (
              <Text color={muted}>Aucun envoi programmé.</Text>
            ) : (
              <VStack align="stretch" divider={<Divider />} spacing={0}>
                {upcoming.map((item) => (
                  <HStack key={item.id} justify="space-between" py={3} align="flex-start" gap={4}>
                    <Box>
                      <Badge colorScheme="orange">{emailTypeLabel(item.type)}</Badge>
                      <Text fontWeight="700" mt={1}>{item.subject}</Text>
                      <Text color={muted} fontSize="sm">
                        Envoi prévu le {toLocale(item.dueAt)}{item.detail ? ` • ${item.detail}` : ""}
                      </Text>
                    </Box>
                    <Button
                      size="sm"
                      colorScheme="red"
                      variant="outline"
                      leftIcon={<Icon as={MdCancel} />}
                      onClick={() => cancelUpcoming(item)}
                      isLoading={actionBusy === `cancel-${item.id}`}
                    >
                      Annuler
                    </Button>
                  </HStack>
                ))}
              </VStack>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <Heading size="md">Modèles automatiques</Heading>
            <Text color={muted} fontSize="sm">Modifications propres à ce {recipientLabel}, avec restauration du texte d’origine.</Text>
          </CardHeader>
          <CardBody>
            <VStack align="stretch" spacing={4}>
              <FormControl>
                <FormLabel>Type d’e-mail</FormLabel>
                <Select value={templateType} onChange={(event) => setTemplateType(event.target.value)}>
                  {Object.entries(templates)
                    .filter(([key]) => !allowedTemplateTypes || allowedTemplateTypes.has(key))
                    .map(([key, template]) => (
                    <option key={key} value={key}>{template.label || emailTypeLabel(key)}</option>
                  ))}
                </Select>
              </FormControl>
              <FormControl>
                <FormLabel>Objet</FormLabel>
                <Input value={templateSubject} onChange={(event) => setTemplateSubject(event.target.value)} maxLength={180} />
              </FormControl>
              <FormControl>
                <FormLabel>Contenu</FormLabel>
                <Textarea value={templateMessage} onChange={(event) => setTemplateMessage(event.target.value)} minH="160px" maxLength={12000} />
              </FormControl>
              <HStack flexWrap="wrap">
                <Button
                  leftIcon={<Icon as={MdVisibility} />}
                  variant="outline"
                  onClick={() => previewMessage({ type: templateType, previewSubject: templateSubject, previewMessage: templateMessage })}
                  isLoading={actionBusy === "preview"}
                >
                  Prévisualiser
                </Button>
                <Button
                  leftIcon={<Icon as={MdSend} />}
                  variant="outline"
                  onClick={() => sendTest({ type: templateType, testSubject: templateSubject, testMessage: templateMessage })}
                  isLoading={actionBusy === "test"}
                  isDisabled={!testEmail}
                >
                  Tester
                </Button>
                <Button {...theme.primaryButtonProps} onClick={saveTemplate} isLoading={actionBusy === "template-save"}>
                  Enregistrer le modèle
                </Button>
                <Button
                  leftIcon={<Icon as={MdRestore} />}
                  variant="ghost"
                  onClick={restoreTemplate}
                  isLoading={actionBusy === "template-restore"}
                  isDisabled={!templates?.[templateType]?.customized}
                >
                  Restaurer l’origine
                </Button>
              </HStack>
            </VStack>
          </CardBody>
        </Card>
      </SimpleGrid>

      <Card>
        <CardHeader>
          <HStack justify="space-between" flexWrap="wrap" gap={2}>
            <Box>
              <Heading size="md">Historique</Heading>
              <Text color={muted} fontSize="sm">
                Les nouveaux envois sont journalisés avec leur identifiant technique.
              </Text>
            </Box>
            <HStack>
              <Select size="sm" value={historyFilter} onChange={(event) => setHistoryFilter(event.target.value)} w="190px">
                <option value="all">Tous les envois</option>
                <option value="automatic">Automatiques</option>
                <option value="manual">Manuels et tests</option>
                <option value="opened">Ouverts</option>
                <option value="unopened">Non ouverts</option>
                <option value="failed">Échecs et rebonds</option>
              </Select>
              <Badge colorScheme="blue">{filteredHistory.length} envoi(s)</Badge>
            </HStack>
          </HStack>
        </CardHeader>
        <CardBody>
          {loading && !loaded ? (
            <Text color={muted}>Chargement de l’historique…</Text>
          ) : filteredHistory.length === 0 ? (
            <Text color={muted}>Aucun e-mail ne correspond à ce filtre.</Text>
          ) : (
            <Box overflowX="auto">
              <Table size="sm">
                <Thead>
                  <Tr>
                    <Th>Date</Th>
                    <Th>Type</Th>
                    <Th>Objet</Th>
                    <Th>Envoi</Th>
                    <Th>Réception</Th>
                    <Th>Ouverture</Th>
                    <Th>Identifiant</Th>
                    <Th>Actions</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {filteredHistory.map((event) => (
                    <Tr key={event.id}>
                      <Td minW="155px">{toLocale(event.sentAt || event.createdAt || event.failedAt)}</Td>
                      <Td minW="170px">
                        <Badge colorScheme={event.type === "manual" ? "purple" : "blue"}>
                          {emailTypeLabel(event.type)}
                        </Badge>
                      </Td>
                      <Td minW="260px">
                        <Text fontWeight="700">{event.subject || event.detail || "Sans objet"}</Text>
                        {event.message ? <Text color={muted} fontSize="xs" noOfLines={2}>{event.message}</Text> : null}
                      </Td>
                      <Td minW="110px">
                        <Badge colorScheme={event.status === "sent" ? "green" : ["failed", "bounced"].includes(event.status) ? "red" : "orange"}>
                          {event.status === "sent" ? "Envoyé" : event.status === "bounced" ? "Rebond" : event.status === "failed" ? "Échec" : "En cours"}
                        </Badge>
                      </Td>
                      <Td minW="170px">
                        {event.deliveryStatus === "accepted" ? (
                          <Box>
                            <Badge colorScheme="green">Accepté par SMTP</Badge>
                            <Text color={muted} fontSize="xs">{toLocale(event.acceptedAt)}</Text>
                          </Box>
                        ) : (
                          <Badge colorScheme="gray">Non confirmé</Badge>
                        )}
                      </Td>
                      <Td minW="155px">
                        {event.firstOpenedAt || event.openedAt ? (
                          <Box>
                            <Badge colorScheme="purple">Ouvert</Badge>
                            <Text color={muted} fontSize="xs">
                              {toLocale(event.firstOpenedAt || event.openedAt)}
                              {Number(event.openCount || 0) > 1 ? ` • ${event.openCount} ouvertures` : ""}
                            </Text>
                          </Box>
                        ) : (
                          <Badge colorScheme="gray">Non détecté</Badge>
                        )}
                      </Td>
                      <Td minW="220px">
                        <Text fontSize="xs" color={muted} noOfLines={2}>{event.messageId || "—"}</Text>
                        {event.sentByEmail || event.sentBy ? (
                          <Text fontSize="xs" color={muted}>Par {event.sentByEmail || event.sentBy}</Text>
                        ) : null}
                      </Td>
                      <Td minW="210px">
                        <HStack>
                          <Button
                            size="xs"
                            variant="outline"
                            leftIcon={<Icon as={MdContentCopy} />}
                            onClick={() => copyContent(event)}
                          >
                            Copier
                          </Button>
                          {event.status === "failed" ? (
                            <Button
                              size="xs"
                              colorScheme="orange"
                              leftIcon={<Icon as={MdReplay} />}
                              onClick={() => retry(event)}
                              isLoading={actionBusy === `retry-${event.id}`}
                              isDisabled={delivery?.suspended || Boolean(event.retryClaimedAt)}
                            >
                              Renvoyer
                            </Button>
                          ) : null}
                        </HStack>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </Box>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <HStack justify="space-between">
            <Box>
              <Heading size="md">Journal administrateur</Heading>
              <Text color={muted} fontSize="sm">Qui a envoyé, renvoyé, annulé ou modifié un réglage.</Text>
            </Box>
            <Badge>{audit.length} action(s)</Badge>
          </HStack>
        </CardHeader>
        <CardBody>
          {audit.length === 0 ? (
            <Text color={muted}>Aucune action administrateur enregistrée.</Text>
          ) : (
            <VStack align="stretch" divider={<Divider />} spacing={0}>
              {audit.slice(0, 50).map((item) => (
                <HStack key={item.id} justify="space-between" py={3} align="flex-start" gap={4}>
                  <Box>
                    <Text fontWeight="700">{auditActionLabel(item.action)}</Text>
                    <Text fontSize="sm" color={muted}>
                      {item.adminEmail || item.adminUid || "Administrateur"}
                    </Text>
                  </Box>
                  <Text fontSize="sm" color={muted} whiteSpace="nowrap">{toLocale(item.createdAt)}</Text>
                </HStack>
              ))}
            </VStack>
          )}
        </CardBody>
      </Card>

      <Modal isOpen={Boolean(preview)} onClose={() => setPreview(null)} size="xl" isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Prévisualisation — {preview?.subject || "E-mail"}</ModalHeader>
          <ModalBody>
            <Box
              borderWidth="1px"
              borderRadius="lg"
              p={5}
              bg="white"
              color="gray.900"
              minH="220px"
              dangerouslySetInnerHTML={{ __html: preview?.html || "" }}
            />
          </ModalBody>
          <ModalFooter>
            <Button onClick={() => setPreview(null)}>Fermer</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </VStack>
  );
}
