import ProgramBuilder from "../components/ProgramBuilder";
import i18n from "../i18n/index";

const ExercisesPage = () => {
  return (
    <div>
      <h1 className="text-3xl font-bold mb-4">{i18n.t("auto.Exercises.page_exercices_chargee", "🚀 Page Exercices chargée !")}</h1>
      <ProgramBuilder />
    </div>
  );
};

export default ExercisesPage;

