"use client";

import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { EPISODE_UPDATED_EVENT } from "@/components/SidebarNav";
import { scriptToHtml } from "@/lib/scriptText";

const pillBtn =
  "text-xs font-semibold rounded-pill bg-white border border-border px-3 py-1.5 hover:bg-[#FAFAF8] transition disabled:opacity-50 disabled:cursor-not-allowed";

const FS_MIN = 18;
const FS_MAX = 64;
const FS_DEFAULT = 32;

// Module "Script" (catégorie Prod) : le script de l'épisode avec mise en forme (titres,
// gras, italique, souligné), enregistré à la sortie du champ puis validé quand il est
// prêt. Un mode plein écran, en grand et en lecture seule, sert à le suivre pendant le
// tournage. Le connecteur Claude lit et écrit ce script (cf. lib/mcp/server.ts, save_script).
export function ScriptModuleClient({
  episodeId,
  initialScriptDraft,
  initialScriptValidated,
}: {
  episodeId: string;
  initialScriptDraft: string;
  initialScriptValidated: boolean;
}) {
  const [scriptDraft, setScriptDraft] = useState(initialScriptDraft);
  const [validated, setValidated] = useState(initialScriptValidated);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fullscreen, setFullscreen] = useState(false);
  const [fsSize, setFsSize] = useState(FS_DEFAULT);
  const [fsEditing, setFsEditing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef(initialScriptDraft);

  async function saveDraft(value: string) {
    try {
      await fetch(`/api/episodes/${episodeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scriptDraft: value }),
      });
    } catch {
      setError("Échec de l'enregistrement du script.");
    }
  }

  const editor = useEditor({
    extensions: [StarterKit],
    content: scriptToHtml(initialScriptDraft),
    immediatelyRender: false,
    editable: !fullscreen || fsEditing,
    onUpdate: ({ editor }) => {
      const html = editor.isEmpty ? "" : editor.getHTML();
      draftRef.current = html;
      setScriptDraft(html);
    },
    onBlur: () => {
      saveDraft(draftRef.current);
    },
  });

  const active = useEditorState({
    editor,
    selector: ({ editor }) => ({
      h1: !!editor?.isActive("heading", { level: 1 }),
      h2: !!editor?.isActive("heading", { level: 2 }),
      bold: !!editor?.isActive("bold"),
      italic: !!editor?.isActive("italic"),
      underline: !!editor?.isActive("underline"),
    }),
  });

  // Plein écran : l'API du navigateur masque ses barres quand elle est disponible, sinon le
  // panneau couvre quand même toute la page. Échap (ou le bouton) en sort.
  function enterFullscreen() {
    setFsEditing(false);
    setFullscreen(true);
    containerRef.current?.requestFullscreen?.().catch(() => {});
  }

  function exitFullscreen() {
    saveDraft(draftRef.current);
    setFullscreen(false);
    setFsEditing(false);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }

  useEffect(() => {
    if (!fullscreen) return;
    function onFullscreenChange() {
      if (!document.fullscreenElement) setFullscreen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setFullscreen(false);
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      window.removeEventListener("keydown", onKey);
    };
  }, [fullscreen]);

  async function validateScript(next = true) {
    setValidating(true);
    setError(null);
    try {
      const res = await fetch(`/api/episodes/${episodeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scriptDraft, scriptValidated: next }),
      });
      if (!res.ok) throw new Error();
      setValidated(next);
      window.dispatchEvent(new Event(EPISODE_UPDATED_EVENT));
    } catch {
      setError(next ? "Échec de la validation du script." : "Impossible de retirer la validation.");
    } finally {
      setValidating(false);
    }
  }

  const toolBtn = (isActive: boolean) =>
    `h-8 min-w-8 rounded-md px-2 text-sm transition ${isActive ? "bg-ink text-white" : "text-ink hover:bg-[#F0EEEA]"}`;

  const toolbar = (
    <div className="flex items-center gap-1" role="toolbar" aria-label="Mise en forme">
      <button type="button" title="Titre 1" aria-pressed={active?.h1} onMouseDown={(e) => e.preventDefault()} onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()} className={`${toolBtn(!!active?.h1)} font-bold`}>
        H1
      </button>
      <button type="button" title="Titre 2" aria-pressed={active?.h2} onMouseDown={(e) => e.preventDefault()} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} className={`${toolBtn(!!active?.h2)} font-bold`}>
        H2
      </button>
      <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
      <button type="button" title="Gras" aria-pressed={active?.bold} onMouseDown={(e) => e.preventDefault()} onClick={() => editor?.chain().focus().toggleBold().run()} className={`${toolBtn(!!active?.bold)} font-bold`}>
        G
      </button>
      <button type="button" title="Italique" aria-pressed={active?.italic} onMouseDown={(e) => e.preventDefault()} onClick={() => editor?.chain().focus().toggleItalic().run()} className={`${toolBtn(!!active?.italic)} italic`}>
        I
      </button>
      <button type="button" title="Souligné" aria-pressed={active?.underline} onMouseDown={(e) => e.preventDefault()} onClick={() => editor?.chain().focus().toggleUnderline().run()} className={`${toolBtn(!!active?.underline)} underline`}>
        S
      </button>
    </div>
  );

  const showToolbar = !fullscreen || fsEditing;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-ink">Script</h1>
          <p className="text-sm text-text-muted">Écris le script de cet épisode, ses questions ou de simples notes.</p>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1">
          <button
            type="button"
            onClick={() => !validated && validateScript(true)}
            disabled={validating}
            className={`text-sm font-semibold rounded-[10px] px-4 py-2 transition disabled:opacity-50 ${
              validated ? "bg-accent-teal text-white cursor-default" : "bg-primary-button text-white hover:brightness-110"
            }`}
          >
            {validating ? "..." : validated ? "✓ Script validé" : "Valider mon script"}
          </button>
          {validated && (
            <button type="button" onClick={() => validateScript(false)} disabled={validating} className="text-xs text-text-muted underline disabled:opacity-50">
              Retirer la validation
            </button>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-[#8A2E1F]">{error}</p>}

      <div
        ref={containerRef}
        className={
          fullscreen
            ? "fixed inset-0 z-50 overflow-y-auto bg-white"
            : "rounded-xl bg-white border border-border"
        }
      >
        <div className={`flex flex-wrap items-center justify-between gap-2 border-b border-border bg-white px-4 py-2 ${fullscreen ? "sticky top-0 z-10" : "rounded-t-xl"}`}>
          {showToolbar ? toolbar : <span className="text-xs text-text-muted">Mode lecture</span>}
          <div className="flex items-center gap-2">
            {fullscreen && (
              <>
                <button type="button" onClick={() => setFsSize((s) => Math.max(FS_MIN, s - 4))} disabled={fsSize <= FS_MIN} className={pillBtn} aria-label="Réduire le texte">
                  A-
                </button>
                <button type="button" onClick={() => setFsSize((s) => Math.min(FS_MAX, s + 4))} disabled={fsSize >= FS_MAX} className={pillBtn} aria-label="Agrandir le texte">
                  A+
                </button>
                <button type="button" onClick={() => setFsEditing((v) => !v)} className={pillBtn}>
                  {fsEditing ? "Lecture seule" : "Modifier"}
                </button>
              </>
            )}
            <button type="button" onClick={fullscreen ? exitFullscreen : enterFullscreen} className={pillBtn}>
              {fullscreen ? "Quitter le plein écran" : "Plein écran"}
            </button>
          </div>
        </div>

        <div
          className={`mx-auto px-5 py-4 text-ink ${fullscreen ? "max-w-3xl py-8" : ""} [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[320px] [&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:text-[1.6em] [&_h1]:font-bold [&_h1]:leading-tight [&_h2]:mt-3 [&_h2]:mb-1.5 [&_h2]:text-[1.3em] [&_h2]:font-bold [&_h2]:leading-tight [&_p]:my-2 [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_strong]:font-bold [&_em]:italic [&_u]:underline`}
          style={{ fontSize: fullscreen ? fsSize : 15 }}
        >
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}
