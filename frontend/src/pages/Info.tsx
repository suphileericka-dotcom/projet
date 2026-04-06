import { useNavigate } from "react-router-dom";
import { useLang } from "../hooks/useLang";
import "../style/info.css";

export default function Info() {
  const navigate = useNavigate();
  const { t } = useLang();

  return (
    <div className="info-page">
      <header className="info-header">
        <button className="back-button" onClick={() => navigate(-1)}>
          {"<"}
        </button>
        <h1>{t("infoTitle")}</h1>
      </header>

      <section className="info-hero">
        <div className="info-icon">i</div>
        <h2>{t("infoHeroTitle")}</h2>
        <p>{t("infoHeroBody")}</p>
      </section>

      <section className="info-card">
        <h3>{t("infoWhatYouCanDoTitle")}</h3>
        <ul className="info-list">
          <li>{t("infoFeatureGroupChat")}</li>
          <li>{t("infoFeatureStoryDrafts")}</li>
          <li>{t("infoFeatureMySpace")}</li>
          <li>{t("infoFeatureMatches")}</li>
          <li>{t("infoFeatureJournal")}</li>
        </ul>
      </section>

      <section className="info-card">
        <h3>{t("infoGroupDiscussionsTitle")}</h3>
        <ul className="info-list">
          <li>{t("infoGroupDiscussionsItem1")}</li>
          <li>{t("infoGroupDiscussionsItem2")}</li>
          <li>{t("infoGroupDiscussionsItem3")}</li>
        </ul>
      </section>

      <section className="info-card">
        <h3>{t("infoPrivateConnectionsTitle")}</h3>
        <p>{t("infoPrivateConnectionsBody")}</p>
        <ul className="info-list">
          <li>{t("infoPrivateAccessFriends")}</li>
          <li>{t("infoPrivateAccessOneTime")}</li>
          <li>{t("infoPrivateAccessSubscription")}</li>
        </ul>

        <div className="pricing-grid">
          <div className="pricing-box">
            <h4>{t("infoOneTimeDmTitle")}</h4>
            <div className="price">4,99 EUR</div>
            <p>{t("infoOneTimeDmDesc")}</p>
          </div>

          <div className="pricing-box accent">
            <h4>{t("infoSubscriptionTitle")}</h4>
            <div className="price">9,75 EUR</div>
            <p>{t("infoSubscriptionDesc")}</p>
          </div>
        </div>
      </section>

      <section className="info-card">
        <h3>{t("infoStoriesDraftsTitle")}</h3>
        <ul className="info-list">
          <li>{t("infoStoriesDraftsItem1")}</li>
          <li>{t("infoStoriesDraftsItem2")}</li>
          <li>{t("infoStoriesDraftsItem3")}</li>
          <li>{t("infoStoriesDraftsItem4")}</li>
        </ul>
      </section>

      <section className="info-card">
        <h3>{t("infoMySpaceTitle")}</h3>
        <p>{t("infoMySpaceBody")}</p>
      </section>

      <section className="info-card">
        <h3>{t("infoLanguagesTitle")}</h3>
        <p>{t("infoLanguagesBody1")}</p>
        <p>{t("infoLanguagesBody2")}</p>
      </section>

      <section className="info-card warning">
        <h3>{t("infoImportantTitle")}</h3>
        <p>{t("infoImportantBody1")}</p>
        <p>{t("infoImportantBody2")}</p>
      </section>

      <footer className="info-footer">
        <button onClick={() => navigate("/")}>{t("infoBackHome")}</button>
        <p>{t("infoFooterMotto")}</p>
      </footer>
    </div>
  );
}
