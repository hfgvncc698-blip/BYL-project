import { Link } from "react-router-dom";

export default function Dashboard() {
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Tableau de Bord</h1>
      <Link to="/exercices">
        <button className="bg-blue-500 text-white px-4 py-2 rounded">Voir les Exercices</button>
      </Link>
    </div>
  );
}

