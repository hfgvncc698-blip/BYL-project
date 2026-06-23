import { Link } from "react-router-dom";
import i18n from "../i18n/index";

export default function Dashboard() {
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">{i18n.t("auto.Dashboard.tableau_de_bord", "Tableau de Bord")}</h1>
      <Link to="/exercices">
        <button className="bg-blue-500 text-white px-4 py-2 rounded">{i18n.t("auto.Dashboard.voir_les_exercices", "Voir les Exercices")}</button>
      </Link>
    </div>
  );
}

