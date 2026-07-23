import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, FileText, Paperclip, X } from "lucide-react";
import { api, type Attachment, type Task } from "../../../../lib/api";
import { toast } from "../../../../lib/toast";

/** 25 MB — mirrors `repo::attachments::MAX_BYTES` so we fail fast, in the UI. */
const MAX_BYTES = 25 * 1024 * 1024;

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Read a picked File as bare base64 (no `data:` prefix) for the Rust side. */
function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("could not read the file"));
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.readAsDataURL(file);
  });
}

/** Lazily loads the bytes for one image/audio attachment as a data URL. */
function Preview({ att }: { att: Attachment }) {
  const { data: src } = useQuery({
    queryKey: ["attachmentData", att.id],
    queryFn: () => api.readAttachmentDataUrl(att.id),
    staleTime: Infinity,
  });
  if (!src) {
    return <div className="h-20 w-full animate-pulse rounded-lg bg-bg" aria-hidden />;
  }
  if (att.kind === "IMAGE") {
    return (
      <img
        src={src}
        alt={att.fileName}
        className="h-20 w-full rounded-lg object-cover"
        loading="lazy"
      />
    );
  }
  return <audio src={src} controls className="w-full" aria-label={att.fileName} />;
}

/** Per-task attachment gallery: images as thumbnails, audio inline, everything
 *  else as a file chip. Files are copied into the app's local store. */
export function Attachments({ task }: { task: Task }) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const { data: items } = useQuery({
    queryKey: ["attachments", task.id],
    queryFn: () => api.listAttachments(task.id),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["attachments", task.id] });

  const addFiles = async (files: FileList) => {
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        if (file.size > MAX_BYTES) {
          toast(`${file.name} is larger than 25 MB`);
          continue;
        }
        const data = await toBase64(file);
        await api.addAttachment(task.id, file.name, file.type || null, data);
      }
      void refresh();
    } catch (e) {
      toast(`Attachment failed: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (att: Attachment) => {
    await api.deleteAttachment(att.id);
    queryClient.removeQueries({ queryKey: ["attachmentData", att.id] });
    void refresh();
  };

  const list = items ?? [];
  const media = list.filter((a) => a.kind !== "FILE");
  const files = list.filter((a) => a.kind === "FILE");

  return (
    <section className="mt-4" data-testid="attachments">
      <div className="flex items-center gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          Attachments
        </h3>
        <button
          type="button"
          aria-label="Add attachment"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="ml-auto flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs text-text-muted hover:border-accent hover:text-accent disabled:opacity-50"
        >
          <Paperclip size={11} strokeWidth={1.75} /> {busy ? "Adding…" : "Add"}
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          aria-label="Attachment file"
          onChange={(e) => {
            if (e.target.files?.length) void addFiles(e.target.files);
            e.target.value = ""; // let the same file be picked again
          }}
        />
      </div>

      {list.length === 0 && (
        <p className="mt-1 text-xs text-text-muted">
          No attachments — add images, audio, or any file.
        </p>
      )}

      {media.length > 0 && (
        <div className="mt-2 grid grid-cols-3 gap-2">
          {media.map((att) => (
            <figure key={att.id} className="group relative" data-testid="attachment-media">
              <Preview att={att} />
              <figcaption className="mt-0.5 truncate text-[10px] text-text-muted" title={att.fileName}>
                {att.fileName}
              </figcaption>
              <div className="absolute right-1 top-1 flex gap-1 opacity-0 group-hover:opacity-100">
                <button
                  type="button"
                  aria-label={`Open ${att.fileName}`}
                  onClick={() => void api.openAttachment(att.id)}
                  className="rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
                >
                  <ExternalLink size={11} strokeWidth={2} />
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${att.fileName}`}
                  onClick={() => void remove(att)}
                  className="rounded-full bg-black/60 p-1 text-white hover:bg-destructive"
                >
                  <X size={11} strokeWidth={2} />
                </button>
              </div>
            </figure>
          ))}
        </div>
      )}

      {files.length > 0 && (
        <ul className="mt-2 space-y-1">
          {files.map((att) => (
            <li
              key={att.id}
              data-testid="attachment-file"
              className="group flex items-center gap-2 rounded-lg border border-border px-2 py-1 text-sm"
            >
              <FileText size={13} strokeWidth={1.75} className="shrink-0 text-text-muted" />
              <span className="min-w-0 flex-1 truncate" title={att.fileName}>
                {att.fileName}
              </span>
              <span className="shrink-0 text-xs text-text-muted">{humanSize(att.sizeBytes)}</span>
              <button
                type="button"
                aria-label={`Open ${att.fileName}`}
                onClick={() => void api.openAttachment(att.id)}
                className="flex items-center text-text-muted opacity-0 hover:text-accent group-hover:opacity-100"
              >
                <ExternalLink size={12} strokeWidth={1.75} />
              </button>
              <button
                type="button"
                aria-label={`Delete ${att.fileName}`}
                onClick={() => void remove(att)}
                className="flex items-center text-text-muted opacity-0 hover:text-destructive group-hover:opacity-100"
              >
                <X size={12} strokeWidth={2} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
