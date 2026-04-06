import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "../style/myStory.css";
import { API } from "../config/api";
import { useLang } from "../hooks/useLang";

const TAGS = [
  "burnout",
  "solitude",
  "rupture",
  "expatriation",
  "changement",
] as const;

type Tag = (typeof TAGS)[number];

const TAG_LABELS: Record<Tag, string> = {
  burnout: "burnout",
  solitude: "solitude",
  rupture: "rupture",
  expatriation: "expatriation",
  changement: "changement",
};

type Draft = {
  id: string;
  title: string;
  body: string;
  tags: Tag[];
};

type Notice = {
  kind: "success" | "info" | "error";
  message: string;
};

const MYSTORY_API = `${API}/mystory`;

function extractDraftId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;

  const data = payload as Record<string, unknown>;
  const directId = typeof data.id === "string" ? data.id : null;
  if (directId) return directId;

  const fallbackId = typeof data._id === "string" ? data._id : null;
  if (fallbackId) return fallbackId;

  for (const key of ["draft", "story", "data"]) {
    const nested = data[key];
    if (!nested || typeof nested !== "object") continue;

    const nestedData = nested as Record<string, unknown>;
    const nestedId = typeof nestedData.id === "string" ? nestedData.id : null;
    if (nestedId) return nestedId;

    const nestedFallbackId =
      typeof nestedData._id === "string" ? nestedData._id : null;
    if (nestedFallbackId) return nestedFallbackId;
  }

  return null;
}

export default function MyStory() {
  const navigate = useNavigate();
  const { t } = useLang();
  const token = localStorage.getItem("authToken");

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [selectedTag, setSelectedTag] = useState<Tag | null>(null);
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [showDrafts, setShowDrafts] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  function toggleTag(tag: Tag) {
    setSelectedTag((prev) => (prev === tag ? null : tag));
  }

  function clearEditor() {
    setCurrentDraftId(null);
    setTitle("");
    setBody("");
    setSelectedTag(null);
  }

  function validateStory() {
    if (!title.trim()) {
      setNotice({
        kind: "error",
        message: t("storyTitleRequiredError"),
      });
      return false;
    }

    if (!selectedTag) {
      setNotice({
        kind: "error",
        message: t("storyTagRequiredError"),
      });
      return false;
    }

    if (body.trim().length < 30) {
      setNotice({
        kind: "error",
        message: t("storyBodyShortError"),
      });
      return false;
    }

    return true;
  }

  async function fetchDraftsList(headers: HeadersInit) {
    let res = await fetch(`${MYSTORY_API}/drafts`, { headers });

    if (res.status === 404) {
      console.warn("Fallback vers /me");
      res = await fetch(`${MYSTORY_API}/me`, { headers });
    }

    if (!res.ok) {
      throw new Error("Erreur fetch drafts");
    }

    const data = await res.json();
    return Array.isArray(data) ? (data as Draft[]) : [];
  }

  async function openDrafts() {
    if (!token) return;

    try {
      const headers = {
        Authorization: `Bearer ${token}`,
      };

      const data = await fetchDraftsList(headers);
      setDrafts(data);
      setShowDrafts(true);
    } catch (err) {
      console.error("Erreur fetch drafts", err);
      setNotice({
        kind: "error",
        message: t("myDraftsLoadError"),
      });
    }
  }

  function selectDraft(draft: Draft) {
    setCurrentDraftId(draft.id);
    setTitle(draft.title);
    setBody(draft.body);
    setSelectedTag(draft.tags[0] ?? null);
    setShowDrafts(false);
    setNotice({
      kind: "info",
      message: t("myDraftLoadedInfo"),
    });
  }

  async function deleteDraft(id: string) {
    if (!token) return;
    if (!confirm(t("draftDeleteConfirm"))) return;

    await fetch(`${MYSTORY_API}/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    setDrafts((current) => current.filter((draft) => draft.id !== id));

    if (currentDraftId === id) {
      clearEditor();
      setNotice({
        kind: "info",
        message: t("draftRemovedFromEditor"),
      });
    }
  }

  async function persistDraft() {
    if (!token || !selectedTag) return null;

    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };

    try {
      const res = await fetch(MYSTORY_API, {
        method: "POST",
        headers,
        body: JSON.stringify({
          id: currentDraftId,
          title: title.trim(),
          body,
          tags: [selectedTag],
        }),
      });

      if (!res.ok) {
        return null;
      }

      const payload = await res.json().catch(() => null);
      let draftId = extractDraftId(payload) ?? currentDraftId;

      if (!draftId) {
        const latestDrafts = await fetchDraftsList({
          Authorization: `Bearer ${token}`,
        }).catch(() => []);

        const matchingDraft =
          latestDrafts.find(
            (draft) =>
              draft.title.trim() === title.trim() &&
              draft.body.trim() === body.trim(),
          ) ?? latestDrafts.find((draft) => draft.title.trim() === title.trim());

        draftId = matchingDraft?.id ?? null;
      }

      if (!draftId) {
        return null;
      }

      const nextDraft: Draft = {
        id: draftId,
        title: title.trim(),
        body,
        tags: selectedTag ? [selectedTag] : [],
      };

      setCurrentDraftId(draftId);
      setDrafts((current) => {
        const index = current.findIndex((draft) => draft.id === draftId);
        if (index === -1) {
          return [nextDraft, ...current];
        }

        const updated = [...current];
        updated[index] = nextDraft;
        return updated;
      });

      return draftId;
    } catch (err) {
      console.error("Erreur save draft", err);
      return null;
    }
  }

  async function saveDraft() {
    if (!token || isSavingDraft || isPublishing) return;

    setNotice(null);

    if (!validateStory()) {
      return;
    }

    setIsSavingDraft(true);

    try {
      const draftId = await persistDraft();

      if (!draftId) {
        setNotice({
          kind: "error",
          message: t("draftSaveError"),
        });
        return;
      }

      setNotice({
        kind: "success",
        message: t("draftSavedSuccess"),
      });
    } finally {
      setIsSavingDraft(false);
    }
  }

  async function publish() {
    if (!token || isPublishing) return;

    setNotice(null);

    if (!validateStory()) {
      return;
    }

    setIsPublishing(true);
    setNotice({
      kind: "info",
      message: t("publishInProgress"),
    });

    try {
      const draftId = await persistDraft();

      if (!draftId) {
        setNotice({
          kind: "error",
          message: t("publishPrepareError"),
        });
        return;
      }

      const publishedTitle = title.trim();
      const res = await fetch(`${MYSTORY_API}/${draftId}/publish`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        setNotice({
          kind: "error",
          message: t("publishError"),
        });
        return;
      }

      setDrafts((current) => current.filter((draft) => draft.id !== draftId));
      clearEditor();
      navigate("/stories", {
        replace: true,
        state: { publishedTitle },
      });
    } catch (err) {
      console.error("Erreur publish", err);
      setNotice({
        kind: "error",
        message: t("publishError"),
      });
    } finally {
      setIsPublishing(false);
    }
  }

  return (
    <div className="story-editor-page">
      <button className="back-btn" onClick={() => navigate("/")}>
        ←
      </button>

      <div className="editor-card">
        <header className="editor-header">
          <div>
            <h1>{t("myStory")}</h1>
            <p className="editor-intro">
              {t("myStoryHeaderDesc")}
            </p>
          </div>

          <button
            className="drafts-btn"
            onClick={openDrafts}
            disabled={isSavingDraft || isPublishing}
          >
            {t("myDrafts")}
          </button>
        </header>

        {(notice || currentDraftId) && (
          <div className="editor-feedback">
            {notice && (
              <div
                className={`editor-notice editor-notice-${notice.kind}`}
                role={notice.kind === "error" ? "alert" : "status"}
              >
                {notice.message}
              </div>
            )}

            {currentDraftId && (
              <p className="editor-draft-hint">
                {t("myDraftActiveHint")}
              </p>
            )}
          </div>
        )}

        <input
          className="title-input"
          placeholder={t("storyTitlePlaceholder")}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <textarea
          className="body-textarea"
          placeholder={t("storyBodyPlaceholder")}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />

        <div className="tags">
          {TAGS.map((tag) => (
            <button
              key={tag}
              className={`tag ${selectedTag === tag ? "on" : ""}`}
              onClick={() => toggleTag(tag)}
              type="button"
            >
              #{TAG_LABELS[tag]}
            </button>
          ))}
        </div>

        <div className="actions">
          <button
            className="story-btn story-btn-ghost"
            onClick={saveDraft}
            disabled={isSavingDraft || isPublishing}
            type="button"
          >
            <span className="story-btn-content">
              {isSavingDraft && <span className="btn-spinner" aria-hidden="true" />}
              {currentDraftId ? t("updateDraftAction") : t("saveDraftAction")}
            </span>
          </button>

          <button
            className="story-btn story-btn-primary"
            onClick={publish}
            disabled={isPublishing}
            type="button"
          >
            <span className="story-btn-content">
              {isPublishing && <span className="btn-spinner" aria-hidden="true" />}
              {isPublishing ? t("publishInProgress") : t("publishAction")}
            </span>
          </button>
        </div>
      </div>

      {showDrafts && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>{t("myDrafts")}</h3>

            {drafts.length === 0 && <p>{t("myDraftsNone")}</p>}

            {drafts.map((draft) => (
              <div key={draft.id} className="draft-row">
                <button
                  className="draft-title"
                  onClick={() => selectDraft(draft)}
                >
                  {draft.title || t("storyWithoutTitle")}
                </button>

                <button
                  className="draft-delete"
                  onClick={() => deleteDraft(draft.id)}
                >
                  {t("deleteAction")}
                </button>
              </div>
            ))}

            <button className="close" onClick={() => setShowDrafts(false)}>
              {t("close")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
