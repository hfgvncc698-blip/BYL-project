import { tabSessionStorage } from "../utils/privateStorage.js";
// src/pages/Cancel.jsx
import React, { useEffect, useState } from "react";
import PaymentResultModal from "../components/PaymentResultModal";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

export default function Cancel() {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsOpen(false);

      // 🔑 essaie d'abord de revenir exactement où l'utilisateur était
      const from = tabSessionStorage.getItem("BYL_RETURN_TO");
      if (from) {
        tabSessionStorage.removeItem("BYL_RETURN_TO");
        navigate(from, { replace: true });
      } else {
        // fallback si rien en mémoire
        navigate("/programmes-premium", { replace: true });
      }
    }, 3000); // 3s d’affichage

    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <PaymentResultModal
      isOpen={isOpen}
      status="cancel"
      message={t("payment.cancel.message")}
      subMessage={t("payment.cancel.subMessage")}
      buttonText={t("payment.cancel.button")}
      onButtonClick={() => {
        const from = tabSessionStorage.getItem("BYL_RETURN_TO");
        if (from) {
          tabSessionStorage.removeItem("BYL_RETURN_TO");
          navigate(from, { replace: true });
        } else {
          navigate("/programmes-premium", { replace: true });
        }
      }}
    />
  );
}

