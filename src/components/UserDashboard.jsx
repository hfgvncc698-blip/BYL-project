import i18n from "../i18n/index";
const UserDashboard = () => {
  return (
    <div>
      <h1>{i18n.t("auto.UserDashboard.tableau_de_bord_utilisateur", "Tableau de bord - Utilisateur")}</h1>
      <p>{i18n.t("auto.UserDashboard.bienvenue_dans_votre_espace_personnel", "Bienvenue dans votre espace personnel.")}</p>
    </div>
  );
};

export default UserDashboard;

