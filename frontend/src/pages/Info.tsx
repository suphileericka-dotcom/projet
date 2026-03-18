import { useNavigate } from "react-router-dom";
import "../style/info.css";

export default function Info() {
  const navigate = useNavigate();

  return (
    <div className="info-page">
      <header className="info-header">
        <button className="back-button" onClick={() => navigate(-1)}>
          ←
        </button>
        <h1>À propos</h1>
      </header>

      <section className="info-hero">
        <div className="info-icon">💬</div>
        <h2>Un espace de soutien anonyme</h2>
        <p>
          Un lieu pour écrire, échanger, publier son histoire et créer des liens
          de manière respectueuse, sans exposer son identité publiquement.
        </p>
      </section>

      <section className="info-card">
        <h3>Ce que tu peux faire ici</h3>
        <ul className="info-list">
          <li>Participer à des espaces de discussion thématiques en groupe.</li>
          <li>Écrire des brouillons puis publier ton histoire si tu le souhaites.</li>
          <li>Consulter ton espace personnel avec tes stats, amis, DM et stories récentes.</li>
          <li>Recevoir des matchs du jour avec des profils proches de ton vécu.</li>
          <li>Utiliser le journal guidé avec un éclairage IA ponctuel.</li>
        </ul>
      </section>

      <section className="info-card">
        <h3>Discussions de groupe</h3>
        <ul className="info-list">
          <li>Les échanges se font par thème : burnout, solitude, rupture, expatriation et changement de vie.</li>
          <li>Le chat de groupe reste séparé des conversations privées.</li>
          <li>Le ton attendu est simple : respect, bienveillance et discrétion.</li>
        </ul>
      </section>

      <section className="info-card">
        <h3>Connexions privées</h3>
        <p>
          Les conversations privées passent par le système DM. Elles peuvent être
          ouvertes avec une personne selon les règles d’accès prévues par la
          plateforme.
        </p>
        <ul className="info-list">
          <li>Accès si vous êtes amis.</li>
          <li>Ou déblocage ponctuel d’un DM à 4,99 €.</li>
          <li>Ou abonnement DM illimité à 9,75 € si activé.</li>
        </ul>

        <div className="pricing-grid">
          <div className="pricing-box">
            <h4>DM ponctuel</h4>
            <div className="price">4,99 €</div>
            <p>Débloque une conversation privée avec une personne.</p>
          </div>

          <div className="pricing-box accent">
            <h4>Abonnement DM</h4>
            <div className="price">9,75 €</div>
            <p>Accès illimité aux DM selon l’état de l’abonnement.</p>
          </div>
        </div>
      </section>

      <section className="info-card">
        <h3>Histoires et brouillons</h3>
        <ul className="info-list">
          <li>Tu peux enregistrer une histoire en brouillon avant publication.</li>
          <li>Les brouillons se gèrent dans “Mon histoire”.</li>
          <li>Les histoires publiées vivent dans l’espace public “Stories”.</li>
          <li>Une publication peut être supprimée depuis la page des stories.</li>
        </ul>
      </section>

      <section className="info-card">
        <h3>Mon espace</h3>
        <p>
          “Mon espace” réunit ton profil, tes amis, les demandes reçues et
          envoyées, tes DM récents, tes stories récentes, ton journal, tes
          matchs du jour et l’état de tes déblocages ou abonnements.
        </p>
      </section>

      <section className="info-card">
        <h3>Langues et compréhension</h3>
        <p>
          L’interface continue d’évoluer, mais l’objectif reste de faciliter les
          échanges entre personnes qui ne parlent pas toujours la même langue.
        </p>
        <p>
          Certaines formulations peuvent encore évoluer avec les prochaines mises
          à jour du produit.
        </p>
      </section>

      <section className="info-card warning">
        <h3>Important</h3>
        <p>
          Cette application n’est pas un service médical et ne remplace pas
          l’avis d’un professionnel de santé.
        </p>
        <p>
          En cas de danger immédiat, de détresse aiguë ou de risque pour toi ou
          pour quelqu’un d’autre, contacte sans attendre un proche, un
          professionnel ou les services d’urgence.
        </p>
      </section>

      <footer className="info-footer">
        <button onClick={() => navigate("/")}>Revenir à l’accueil</button>
        <p>Anonymat • Respect • Liens humains</p>
      </footer>
    </div>
  );
}
