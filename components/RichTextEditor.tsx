"use client";

import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extensions";
import { scriptToHtml } from "@/lib/scriptText";

// Éditeur de texte avec mise en forme (H1, H2, gras, italique, souligné) : le contenu est stocké en
// HTML ; un texte brut ou Markdown existant est converti à l'ouverture (cf. lib/scriptText.ts).
export function RichTextEditor({
  initialContent,
  placeholder,
  onChange,
  minHeight = 260,
}: {
  initialContent: string;
  placeholder?: string;
  // Reçoit le HTML, ou "" quand l'éditeur est vide.
  onChange: (html: string) => void;
  minHeight?: number;
}) {
  const editor = useEditor({
    extensions: [StarterKit, Placeholder.configure({ placeholder: placeholder ?? "" })],
    content: scriptToHtml(initialContent),
    immediatelyRender: false,
    onUpdate: ({ editor }) => onChange(editor.isEmpty ? "" : editor.getHTML()),
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

  const toolBtn = (isActive: boolean) =>
    `h-8 min-w-8 rounded-md px-2 text-sm transition ${isActive ? "bg-ink text-white" : "text-ink hover:bg-[#F0EEEA]"}`;
  const keepFocus = (e: React.MouseEvent) => e.preventDefault();

  return (
    <div className="rounded-md border border-border bg-white">
      <div className="flex items-center gap-1 border-b border-border px-3 py-2" role="toolbar" aria-label="Mise en forme">
        <button type="button" title="Titre 1" aria-pressed={active?.h1} onMouseDown={keepFocus} onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()} className={`${toolBtn(!!active?.h1)} font-bold`}>
          H1
        </button>
        <button type="button" title="Titre 2" aria-pressed={active?.h2} onMouseDown={keepFocus} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} className={`${toolBtn(!!active?.h2)} font-bold`}>
          H2
        </button>
        <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
        <button type="button" title="Gras" aria-pressed={active?.bold} onMouseDown={keepFocus} onClick={() => editor?.chain().focus().toggleBold().run()} className={`${toolBtn(!!active?.bold)} font-bold`}>
          G
        </button>
        <button type="button" title="Italique" aria-pressed={active?.italic} onMouseDown={keepFocus} onClick={() => editor?.chain().focus().toggleItalic().run()} className={`${toolBtn(!!active?.italic)} italic`}>
          I
        </button>
        <button type="button" title="Souligné" aria-pressed={active?.underline} onMouseDown={keepFocus} onClick={() => editor?.chain().focus().toggleUnderline().run()} className={`${toolBtn(!!active?.underline)} underline`}>
          S
        </button>
      </div>
      <div
        className="px-4 py-3 text-[15px] text-ink [&_.ProseMirror]:outline-none [&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:text-[1.6em] [&_h1]:font-bold [&_h1]:leading-tight [&_h2]:mt-3 [&_h2]:mb-1.5 [&_h2]:text-[1.3em] [&_h2]:font-bold [&_h2]:leading-tight [&_p]:my-2 [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_strong]:font-bold [&_em]:italic [&_u]:underline [&_.is-editor-empty:first-child::before]:pointer-events-none [&_.is-editor-empty:first-child::before]:float-left [&_.is-editor-empty:first-child::before]:h-0 [&_.is-editor-empty:first-child::before]:whitespace-pre-line [&_.is-editor-empty:first-child::before]:text-text-muted [&_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]"
        style={{ minHeight }}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
