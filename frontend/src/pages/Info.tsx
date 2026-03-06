// =====================
// PAGE INFO
// =====================

import { useNavigate } from "react-router-dom";
import "../style/info.css";

export default function Info() {
  const navigate = useNavigate();

  return (
    <div className="info-page">
      {/* =====================
          HEADER
      ===================== */}
      <header className="info-header">
        <button className="back-button" onClick={() => navigate(-1)}>
          ←
        </button>
        <h1>À propos</h1>
      </header>

      {/* =====================
          HERO
      ===================== */}
      <section className="info-hero">
        <div className="info-icon">💬</div>
        <h2>Espace de soutien anonyme</h2>
        <p>
          Un lieu sécurisé pour écrire, échanger et partager ce que vous
          traversez, sans jugement et dans le respect.
        </p>
      </section>

      {/* =====================
          LANGUES & TRADUCTION
      ===================== */}
      <section className="info-card">
        <h3>Langues et traduction</h3>
        <p>
          L’interface de l’application n’est pas encore entièrement traduite
          dans toutes les langues.
        </p>
        <p>
          En revanche, les messages échangés dans les espaces de discussion
          peuvent être traduits afin de faciliter les échanges
          entre utilisateurs.
        </p>
      </section>

      {/* =====================
          DISCUSSIONS
      ===================== */}
      <section className="info-card">
        <h3>Fonctionnement des discussions</h3>
        <ul className="info-list">
          <li>
            Chaque espace de discussion peut accueillir jusqu’à environ
            1500 participants.
          </li>
          <li>
            Les messages sont temporaires et sont automatiquement supprimés
            après 24 heures.
          </li>
          <li>
            Les échanges se font principalement en groupe, autour de thématiques
            communes.
          </li>
        </ul>
      </section>

      {/* =====================
          MATCHS & CONNEXIONS
      ===================== */}
      <section className="info-card">
        <h3>Connexions et correspondances</h3>
        <p>
          L’application propose des correspondances entre personnes traversant
          des situations similaires afin de favoriser des échanges plus
          pertinents et humains.
        </p>
        <p>
          Il est possible d’échanger en privé en dehors des discussions de
          groupe. Cette fonctionnalité est optionnelle et payante.
        </p>

        <div className="pricing-box">
          <h4>Discussion privée</h4>
          <div className="price">4,99 €</div>
          <p>
            Accès à une conversation privée avec une personne de votre choix.
          </p>
        </div>
      </section>

      {/* =====================
          HISTOIRES & ANONYMAT
      ===================== */}
      <section className="info-card">
        <h3>Histoires et anonymat</h3>
        <ul className="info-list">
          <li>
            Vous pouvez écrire et partager votre histoire personnelle de manière
            totalement anonyme.
          </li>
          <li>
            Les histoires publiées peuvent être likées et commentées par les
            autres utilisateurs.
          </li>
          <li>
            Aucune information personnelle n’est rendue publique.
          </li>
        </ul>
      </section>

      {/* =====================
          RESPONSABILITÉ
      ===================== */}
      <section className="info-card warning">
        <h3>Responsabilité</h3>
        <p>
          Cette application n’est pas un service médical et ne remplace en aucun
          cas l’avis ou l’accompagnement d’un professionnel de santé.
        </p>
        <p>
          En cas de détresse grave ou de danger immédiat, il est fortement
          recommandé de contacter un proche, un professionnel ou les services
          d’urgence.
        </p>
      </section>

      {/* =====================
          FOOTER
      ===================== */}
      <footer className="info-footer">
        <button onClick={() => navigate("/")}>Revenir à l’accueil</button>
        <p>Anonymat • Bienveillance • Respect</p>
      </footer>
    </div>
  );
}
