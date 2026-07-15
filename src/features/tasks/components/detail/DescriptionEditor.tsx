import { useEffect } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import type { Task } from "../../../../lib/api";
import { useTaskMutations } from "../../hooks/useTasks";

function parseContent(raw: string | null): object | string {
  if (!raw) return "";
  try {
    return JSON.parse(raw) as object;
  } catch {
    return raw;
  }
}

export function DescriptionEditor({ task }: { task: Task }) {
  const { updateTask } = useTaskMutations();

  const editor = useEditor({
    extensions: [StarterKit, Placeholder.configure({ placeholder: "Description…" })],
    content: parseContent(task.contentRich),
    editorProps: {
      attributes: {
        class:
          "prose prose-sm min-h-24 max-w-none px-1 py-2 text-sm outline-none dark:prose-invert",
        role: "textbox",
        "aria-label": "Task description",
      },
    },
    onBlur: ({ editor }) => {
      const contentRich = JSON.stringify(editor.getJSON());
      if (contentRich === task.contentRich) return;
      updateTask.mutate({
        id: task.id,
        patch: { contentRich, contentPlain: editor.getText() },
      });
    },
  });

  // Swap content when the selected task changes.
  useEffect(() => {
    if (!editor || editor.isFocused) return;
    editor.commands.setContent(parseContent(task.contentRich));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id, editor]);

  return <EditorContent editor={editor} />;
}
