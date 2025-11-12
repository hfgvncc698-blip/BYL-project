// src/pages/ProfilePageCoach.jsx
import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Heading,
  FormControl,
  FormLabel,
  Input,
  Button,
  Stack,
  useToast,
  Spinner,
  Image,
  Progress,
  HStack,
  Text,
  Tooltip,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
} from '@chakra-ui/react';
import { useAuth } from '../AuthContext';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { useTranslation } from 'react-i18next';

// 🔐 Firebase Auth (email + reauth)
import {
  getAuth,
  updateEmail as updateAuthEmail,
  reauthenticateWithCredential,
  EmailAuthProvider,
  sendEmailVerification,
} from 'firebase/auth';

// Firebase Storage
const storage = getStorage();

export default function ProfilePageCoach() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const auth = getAuth();
  const toast = useToast();
  const fileInputRef = useRef(null);

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    logoUrl: '',
  });
  const [initialEmail, setInitialEmail] = useState('');
  const [logoFile, setLogoFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isLoading, setLoading] = useState(true);

  // Modal reauth
  const [reauthOpen, setReauthOpen] = useState(false);
  const [reauthPwd, setReauthPwd] = useState('');
  const [pendingNewEmail, setPendingNewEmail] = useState('');

  // Fetch user data
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const snapshot = await getDoc(doc(db, 'users', user.uid));
        if (snapshot.exists()) {
          const data = snapshot.data();
          setForm(prev => ({
            ...prev,
            firstName: data.firstName ?? '',
            lastName:  data.lastName  ?? '',
            email:     data.email     ?? user.email ?? '',
            phone:     data.telephone ?? data.phone ?? '',
            logoUrl:   data.logoUrl   ?? '',
          }));
          setInitialEmail(data.email ?? user.email ?? '');
        } else {
          setForm(prev => ({ ...prev, email: user.email ?? '' }));
          setInitialEmail(user.email ?? '');
        }
      } catch (error) {
        toast({
          title: t('profile.toasts.load_error_title'),
          description: error.message,
          status: 'error',
          isClosable: true,
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [user, toast, t]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleLogoSelect = (e) => {
    if (e.target.files?.[0]) setLogoFile(e.target.files[0]);
  };

  const uploadLogoIfAny = () =>
    new Promise((resolve, reject) => {
      if (!logoFile) return resolve(form.logoUrl);
      const path = `logos/${user.uid}/${logoFile.name}`;
      const storageRef = ref(storage, path);
      const uploadTask = uploadBytesResumable(storageRef, logoFile);
      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const prog = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadProgress(Math.round(prog));
        },
        (err) => reject(err),
        () => {
          getDownloadURL(uploadTask.snapshot.ref).then(resolve).catch(reject);
        }
      );
    });

  // Écrit les champs côté Firestore
  const updateFirestore = async (payloadOverrides = {}) => {
    const payload = {
      firstName: form.firstName?.trim(),
      lastName:  form.lastName?.trim(),
      email:     (payloadOverrides.email ?? form.email ?? '').trim(),
      // stocke sous 2 clés par compat
      phone:     (form.phone ?? '').trim(),
      telephone: (form.phone ?? '').trim(),
      logoUrl:   payloadOverrides.logoUrl ?? form.logoUrl ?? '',
      updatedAt: serverTimestamp(),
    };
    await updateDoc(doc(db, 'users', user.uid), payload);
    setForm(prev => ({ ...prev, logoUrl: payload.logoUrl }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user || !auth.currentUser) return;
    setLoading(true);
    try {
      // 1) upload logo si besoin
      const url = await uploadLogoIfAny();

      // 2) gestion email changé côté Auth
      const newEmail = (form.email || '').trim();
      const emailChanged =
        newEmail && initialEmail && newEmail.toLowerCase() !== initialEmail.toLowerCase();

      if (emailChanged) {
        // si le compte n'est pas email/password, reauth par mot de passe ne fonctionnera pas
        const hasPasswordProvider = auth.currentUser.providerData.some(p => p.providerId === 'password');
        if (!hasPasswordProvider) {
          toast({
            status: 'info',
            title: t('profile.toasts.updated_title'),
            description: t('auth.change_email_with_provider', 'Votre compte est lié à un fournisseur externe. Changez votre e-mail depuis ce fournisseur ou contactez le support.'),
            isClosable: true,
          });
          // on met quand même Firestore à jour pour l’affichage
          await updateFirestore({ email: newEmail, logoUrl: url || '' });
          setInitialEmail(newEmail);
          setUploadProgress(0);
          setLoading(false);
          return;
        }

        try {
          await updateAuthEmail(auth.currentUser, newEmail);
          await sendEmailVerification(auth.currentUser).catch(() => {});
          await updateFirestore({ email: newEmail, logoUrl: url || '' });
          setInitialEmail(newEmail);
          toast({
            status: 'success',
            title: t('profile.toasts.updated_title'),
            description: t('profile.toasts.email_changed', 'Votre email de connexion a été mis à jour. Vérifiez votre boîte mail pour confirmer.'),
          });
        } catch (err) {
          if (err?.code === 'auth/requires-recent-login') {
            setPendingNewEmail(newEmail);
            setReauthPwd('');
            setReauthOpen(true);
            // pas de toast success ici; l’écriture Firestore se fera après reauth
            setUploadProgress(0);
            setLoading(false);
            return;
          }
          let msg = t('profile.toasts.update_error_desc');
          if (err?.code === 'auth/email-already-in-use') msg = t('errors.email_in_use', 'Cette adresse e-mail est déjà utilisée.');
          else if (err?.code === 'auth/invalid-email') msg = t('errors.invalid_email', 'Adresse e-mail invalide.');
          throw new Error(msg);
        }
      } else {
        // 3) pas de changement Auth email -> simple update Firestore
        await updateFirestore({ logoUrl: url || '' });
        toast({
          title: t('profile.toasts.updated_title'),
          description: t('profile.toasts.updated_desc'),
          status: 'success',
          duration: 3000,
          isClosable: true,
        });
      }
    } catch (error) {
      toast({
        title: t('profile.toasts.update_error_title'),
        description: error?.message || t('profile.toasts.update_error_desc'),
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setLoading(false);
      setUploadProgress(0);
    }
  };

  // Confirm du modal de reauth
  const handleConfirmReauth = async () => {
    const authUser = auth.currentUser;
    if (!authUser || !pendingNewEmail) {
      setReauthOpen(false);
      return;
    }
    setLoading(true);
    try {
      const cred = EmailAuthProvider.credential(initialEmail, reauthPwd);
      await reauthenticateWithCredential(authUser, cred);
      await updateAuthEmail(authUser, pendingNewEmail);
      await sendEmailVerification(authUser).catch(() => {});
      await updateFirestore({ email: pendingNewEmail });
      setInitialEmail(pendingNewEmail);
      toast({
        status: 'success',
        title: t('profile.toasts.updated_title'),
        description: t('profile.toasts.email_changed', 'Votre email de connexion a été mis à jour. Vérifiez votre boîte mail pour confirmer.'),
      });
      setReauthOpen(false);
      setPendingNewEmail('');
      setReauthPwd('');
    } catch (err) {
      let msg = t('profile.toasts.update_error_desc');
      if (err?.code === 'auth/wrong-password') msg = t('errors.wrong_password', 'Mot de passe incorrect.');
      else if (err?.code === 'auth/too-many-requests') msg = t('errors.too_many_requests', 'Trop de tentatives, réessayez plus tard.');
      else if (err?.code === 'auth/email-already-in-use') msg = t('errors.email_in_use', 'Cette adresse e-mail est déjà utilisée.');
      else if (err?.code === 'auth/invalid-email') msg = t('errors.invalid_email', 'Adresse e-mail invalide.');
      toast({ status: 'error', title: t('profile.toasts.update_error_title'), description: msg });
    } finally {
      setLoading(false);
    }
  };

  if (isLoading) {
    return (
      <Box p={8} textAlign="center">
        <Spinner size="xl" />
      </Box>
    );
  }

  // Détermine le texte affiché pour le fichier
  const currentFileLabel = (() => {
    if (logoFile?.name) return logoFile.name;
    if (!form.logoUrl) return t('profile.file.none');
    try {
      const base = form.logoUrl.split('?')[0];
      return decodeURIComponent(base.split('/').pop() || '');
    } catch {
      return t('profile.file.none');
    }
  })();

  return (
    <Box p={8} maxW="600px" mx="auto">
      <Heading as="h1" mb={6} textAlign="center">
        {t('profile.title')}
      </Heading>

      <Box as="form" onSubmit={handleSubmit}>
        <Stack spacing={4}>
          <FormControl isRequired>
            <FormLabel>{t('profile.labels.firstName')}</FormLabel>
            <Input name="firstName" value={form.firstName} onChange={handleChange} placeholder={t('profile.placeholders.firstName')} />
          </FormControl>

          <FormControl isRequired>
            <FormLabel>{t('profile.labels.lastName')}</FormLabel>
            <Input name="lastName" value={form.lastName} onChange={handleChange} placeholder={t('profile.placeholders.lastName')} />
          </FormControl>

          <FormControl isRequired>
            <FormLabel>{t('profile.labels.email')}</FormLabel>
            <Input type="email" name="email" value={form.email} onChange={handleChange} placeholder={t('profile.placeholders.email')} />
          </FormControl>

          <FormControl>
            <FormLabel>{t('profile.labels.phone')}</FormLabel>
            <Input name="phone" value={form.phone} onChange={handleChange} placeholder={t('profile.placeholders.phone')} />
          </FormControl>

          {/* Logo upload custom */}
          <FormControl>
            <FormLabel>{t('profile.labels.logo')}</FormLabel>

            {/* input caché */}
            <Input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              display="none"
              onChange={handleLogoSelect}
            />

            {/* bouton custom */}
            <HStack spacing={3} align="center" flexWrap="wrap">
              <Button
                size="sm"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
              >
                {t('profile.actions.chooseFile')}
              </Button>

              <Tooltip label={currentFileLabel} hasArrow>
                <Text
                  fontSize="sm"
                  color="gray.400"
                  maxW={{ base: '100%', sm: '380px' }}
                  noOfLines={1}
                >
                  {currentFileLabel}
                </Text>
              </Tooltip>
            </HStack>
          </FormControl>

          {logoFile && <Progress value={uploadProgress} size="sm" colorScheme="blue" />}
          {form.logoUrl && (
            <Image
              src={form.logoUrl}
              boxSize="100px"
              objectFit="contain"
              alt={t('profile.alt.logo')}
              borderRadius="md"
            />
          )}

          <Button type="submit" colorScheme="blue" isLoading={isLoading}>
            {t('profile.actions.save')}
          </Button>
        </Stack>
      </Box>

      {/* Modal reauth pour changement d'email */}
      <Modal isOpen={reauthOpen} onClose={() => setReauthOpen(false)} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>{t('profile.reauth.title', 'Confirmer votre identité')}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Stack spacing={3}>
              <Box fontSize="sm" color="gray.600">
                {t('profile.reauth.body', 'Pour modifier votre adresse e-mail, entrez votre mot de passe actuel.')}
              </Box>
              <FormControl>
                <FormLabel>{t('auth.password', 'Mot de passe')}</FormLabel>
                <Input
                  type="password"
                  value={reauthPwd}
                  onChange={(e) => setReauthPwd(e.target.value)}
                  placeholder="••••••••"
                />
              </FormControl>
            </Stack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={() => setReauthOpen(false)}>
              {t('common.cancel', 'Annuler')}
            </Button>
            <Button colorScheme="blue" onClick={handleConfirmReauth} isLoading={isLoading}>
              {t('common.confirm', 'Confirmer')}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}

