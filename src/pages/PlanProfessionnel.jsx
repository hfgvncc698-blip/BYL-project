// src/pages/PlanProfessionnel.jsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  Box, Container, Heading, SimpleGrid, VStack, Text, Button, Badge,
  useToast, Alert, AlertIcon, HStack, Divider, Icon, Tag, useColorModeValue,
} from '@chakra-ui/react';
import { CheckCircleIcon, InfoOutlineIcon } from '@chakra-ui/icons';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { useTranslation } from 'react-i18next';

// === Stripe Price IDs (dashboard)
const PRICE_ID_MENSUEL = 'price_1RYSAhJSoFLulz8xvGDzc2qt';
const PRICE_ID_ANNUEL  = 'price_1RYqfaJSoFLulz8x6HMS1RoM';

// ✅ helper HTTP centralisé
import { apiFetch } from '../utils/api';

export default function PlanProfessionnel() {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  const trialRunning   = useMemo(() => user?.trialStatus === 'running', [user]);
  const hasAccess      = useMemo(() => !!user?.hasActiveSubscription, [user]);
  const isCoach        = useMemo(() => user?.role === 'coach', [user]);

  const pageDescColor  = useColorModeValue('gray.600', 'gray.300');
  const cardBg         = useColorModeValue('white', 'gray.800');
  const cardMutedBg    = useColorModeValue('gray.50', 'blackAlpha.300');
  const borderEmph     = useColorModeValue('blue.300', 'blue.400');
  const borderSoft     = useColorModeValue('gray.200', 'whiteAlpha.200');
  const mutedText      = useColorModeValue('gray.600', 'gray.300');
  const priceColor     = useColorModeValue('gray.900', 'white');

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate('/login?next=/plans/professionnel', { replace: true });
      return;
    }
    if (isCoach && (trialRunning || hasAccess)) {
      navigate('/coach-dashboard', { replace: true });
      return;
    }
    if (!isCoach) {
      navigate('/user-dashboard', { replace: true });
    }
  }, [user, isCoach, trialRunning, hasAccess, loading, navigate]);

  const goCheckout = async ({ priceId, plan }) => {
    if (!user) { navigate('/login?next=/plans/professionnel'); return; }
    setSubmitting(true);
    try {
      const data = await apiFetch("/payments/create-checkout-session", {
        method: "POST",
        body: JSON.stringify({
          mode: "subscription",
          priceId,
          customer_email: user.email,
          firebaseUid: user.uid,
          type: "account",
          role: "coach",
          plan,
          frontendBaseUrl: window.location.origin, // ✅ évite le retour sur localhost
          forceNoTrial: true,
          includeTrial: false,
        }),
      });
      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error(data?.error || "Stripe response invalide");
      }
    } catch (err) {
      toast({
        title: t('errors.payment_failed') || 'Erreur paiement',
        description: err?.message || String(err),
        status: 'error',
        duration: 5000,
        isClosable: true
      });
      setSubmitting(false);
    }
  };

  const handleStripeMonthly = () => goCheckout({ priceId: PRICE_ID_MENSUEL, plan: 'monthly' });
  const handleStripeAnnual  = () => goCheckout({ priceId: PRICE_ID_ANNUEL,  plan: 'yearly'  });

  if (loading || !user || (isCoach && (trialRunning || hasAccess))) {
    return (
      <Container maxW="container.sm" py={16}>
        <Alert status="info" borderRadius="md">
          <AlertIcon />
          {t('proPlans.checking', { defaultValue: 'Vérification de votre statut d’essai / abonnement…' })}
        </Alert>
      </Container>
    );
  }

  const Feature = ({ children }) => (
    <HStack align="start" spacing={3}>
      <Icon as={CheckCircleIcon} color="green.400" boxSize={4} mt="2px" />
      <Text fontSize="sm">{children}</Text>
    </HStack>
  );

  const PlanCard = ({
    title, price, cadence, highlights = [], cta, onClick, badge,
    emphasized = false, outline = false, footnote,
  }) => (
    <Box
      bg={cardBg}
      borderRadius="xl"
      p={6}
      borderWidth="1px"
      borderColor={emphasized ? borderEmph : borderSoft}
      boxShadow={emphasized ? 'xl' : 'sm'}
      position="relative"
      role="group"
    >
      {badge && (
        <Badge position="absolute" top={4} right={4} colorScheme={badge.colorScheme || 'blue'}>
          {badge.label}
        </Badge>
      )}

      <VStack align="stretch" spacing={4}>
        <Heading size="md">{title}</Heading>

        <HStack align="baseline" spacing={1}>
          <Text fontSize="3xl" fontWeight="bold" color={priceColor}>{price}</Text>
          <Text color={mutedText} fontSize="sm">/ {cadence}</Text>
        </HStack>

        <VStack align="stretch" spacing={2}>
          {highlights.map((h, idx) => <Feature key={idx}>{h}</Feature>)}
        </VStack>

        {footnote && (
          <Text fontSize="xs" color={mutedText} mt={1}>
            {footnote}
          </Text>
        )}

        <Button
          mt={3}
          colorScheme="blue"
          variant={outline ? 'outline' : 'solid'}
          isFullWidth
          onClick={onClick}
          isLoading={submitting}
          _groupHover={{ transform: 'translateY(-1px)' }}
          transition="transform 0.15s ease"
        >
          {cta}
        </Button>
      </VStack>
    </Box>
  );

  return (
    <Container maxW="container.xl" py={{ base: 10, md: 16 }}>
      <Heading mb={2} textAlign="center">
        {t('proPlans.title', { defaultValue: 'Nos formules Professionnels' })}
      </Heading>
      <Text textAlign="center" color={pageDescColor} mb={8}>
        {t('proPlans.subtitle', {
          defaultValue: 'Votre essai est terminé. Choisissez une formule pour continuer à utiliser l’espace coach.',
        })}
      </Text>

      {/* Section — ce que vous obtenez */}
      <Box
        bg={cardMutedBg}
        borderRadius="xl"
        p={{ base: 5, md: 6 }}
        mb={{ base: 8, md: 10 }}
        borderWidth="1px"
        borderColor={borderSoft}
      >
        <HStack spacing={3} mb={3}>
          <Icon as={InfoOutlineIcon} />
          <Heading size="sm">
            {t('proPlans.benefits.title', { defaultValue: 'Ce que vous obtenez avec BYL Pro' })}
          </Heading>
        </HStack>
        <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
          <VStack align="start" spacing={2}>
            <Feature>{t('proPlans.benefits.b1', { defaultValue: 'Création illimitée de programmes personnalisés' })}</Feature>
            <Feature>{t('proPlans.benefits.b2', { defaultValue: 'Banque d’exercices enrichie & exports PDF' })}</Feature>
          </VStack>
          <VStack align="start" spacing={2}>
            <Feature>{t('proPlans.benefits.b3', { defaultValue: 'Suivi en temps réel des clients' })}</Feature>
            <Feature>{t('proPlans.benefits.b4', { defaultValue: 'Tableaux de bord & analytics' })}</Feature>
          </VStack>
          <VStack align="start" spacing={2}>
            <Feature>{t('proPlans.benefits.b5', { defaultValue: 'Support prioritaire' })}</Feature>
            <Feature>{t('proPlans.benefits.b6', { defaultValue: 'Accès sécurisé et multi‐appareils' })}</Feature>
          </VStack>
        </SimpleGrid>
      </Box>

      {/* Plans */}
      <SimpleGrid columns={{ base: 1, md: 3 }} spacing={6}>
        {/* Essai – informatif */}
        <Box bg={cardBg} borderRadius="xl" p={6} borderWidth="1px" borderColor={borderSoft} opacity={0.75}>
          <Badge colorScheme="green" mb={3}>
            {t('proPlans.trial.badge', { defaultValue: 'Essai 14 j' })}
          </Badge>
          <Heading size="md" mb={2}>
            {t('proPlans.trial.title', { defaultValue: 'Essai gratuit (terminé)' })}
          </Heading>
          <Text fontSize="sm" color={mutedText} mb={4}>
            {t('proPlans.trial.desc', {
              defaultValue: 'Vous avez déjà bénéficié de l’essai gratuit. Souscrivez à l’une des formules pour continuer.',
            })}
          </Text>
          <VStack align="stretch" spacing={2}>
            <Feature>{t('proPlans.benefits.b1', { defaultValue: 'Création illimitée' })}</Feature>
            <Feature>{t('proPlans.benefits.b3', { defaultValue: 'Suivi en temps réel' })}</Feature>
            <Feature>{t('proPlans.benefits.b2', { defaultValue: 'Exports PDF & analytics' })}</Feature>
            <Feature>{t('proPlans.benefits.b5', { defaultValue: 'Support prioritaire' })}</Feature>
          </VStack>
          <Button mt={6} isFullWidth isDisabled>
            {t('proPlans.trial.cta', { defaultValue: 'Essai déjà utilisé' })}
          </Button>
        </Box>

        {/* Mensuel — Populaire */}
        <PlanCard
          title={t('proPlans.monthly.title', { defaultValue: 'Abonnement mensuel' })}
          price={t('proPlans.monthly.price', { defaultValue: '79 €' })}
          cadence={t('proPlans.cadence.month', { defaultValue: 'mois' })}
          highlights={[
            t('proPlans.monthly.h1', { defaultValue: 'Sans engagement : annulez à tout moment' }),
            t('proPlans.monthly.h2', { defaultValue: 'Accès complet : création, suivi, analytics' }),
            t('proPlans.monthly.h3', { defaultValue: 'Support prioritaire inclus' }),
          ]}
          cta={t('proPlans.monthly.cta', { defaultValue: 'Souscrire à 79 €/mois' })}
          onClick={handleStripeMonthly}
          badge={{ label: t('proPlans.badges.popular', { defaultValue: 'Populaire' }), colorScheme: 'blue' }}
          emphasized
        />

        {/* Annuel — Meilleur prix */}
        <PlanCard
          title={t('proPlans.yearly.title', { defaultValue: 'Abonnement annuel' })}
          price={t('proPlans.yearly.price', { defaultValue: '790 €' })}
          cadence={t('proPlans.cadence.year', { defaultValue: 'an' })}
          highlights={[
            t('proPlans.yearly.h1', { defaultValue: 'Meilleur tarif : 2 mois offerts' }),
            t('proPlans.yearly.h2', { defaultValue: 'Accès complet : création, suivi, analytics' }),
            t('proPlans.yearly.h3', { defaultValue: 'Support prioritaire inclus' }),
          ]}
          cta={t('proPlans.yearly.cta', { defaultValue: 'Souscrire à 790 €/an' })}
          onClick={handleStripeAnnual}
          badge={{ label: t('proPlans.badges.savings', { defaultValue: 'Économie' }), colorScheme: 'purple' }}
          outline
          footnote={t('proPlans.yearly.footnote', { defaultValue: 'Équivalent 65,83 € / mois' })}
        />
      </SimpleGrid>

      <VStack spacing={2} mt={10} mb={2}>
        <HStack spacing={2}>
          <Tag colorScheme="green" borderRadius="full">
            {t('proPlans.trust.secure', { defaultValue: 'Paiement sécurisé' })}
          </Tag>
          <Tag colorScheme="gray" borderRadius="full">
            {t('proPlans.trust.cancel', { defaultValue: 'Annulable depuis votre espace' })}
          </Tag>
          <Tag colorScheme="gray" borderRadius="full">
            {t('proPlans.trust.invoices', { defaultValue: 'Factures disponibles' })}
          </Tag>
        </HStack>
      </VStack>

      <Divider my={8} />

      <Box textAlign="center">
        <Button as={RouterLink} to="/coach-dashboard" variant="ghost">
          {t('proPlans.backToDashboard', { defaultValue: '⟵ Retour au tableau de bord' })}
        </Button>
      </Box>
    </Container>
  );
}

