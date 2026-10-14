"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AnnouncementCategory } from "@/lib/employee/types";
import type { DeptAnnouncement } from "@/lib/manager/types";
import { ANNOUNCEMENT_CATEGORY, MANAGER_CATEGORIES } from "@/lib/employee/labels";
import { saveAnnouncement } from "@/lib/manager/actions";
import { FileTextIcon, InfoIcon, MegaphoneIcon, SpinnerIcon, UploadCloudIcon, UsersIcon, XIcon } from "@/components/ui/icons";
import { FormField, FormMessage, Modal, buttonClass, cx, inputClass } from "@/components/employee/ui";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
type Result = { error?: string; message?: string; fieldErrors?: Record<string, string> };

export function AnnouncementModal({
  announcement,
  departmentName,
  teamSize,
  onClose,
}: {
  /** Existing announcement to edit; omit to create. */
  announcement?: DeptAnnouncement;
  departmentName: string;
  teamSize: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(announcement?.title ?? "");
  const [category, setCategory] = useState<AnnouncementCategory | "">(announcement?.category ?? "");
  const [body, setBody] = useState(announcement?.body ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<Result>({});
  const [pending, startTransition] = useTransition();
  const [submitting, setSubmitting] = useState<"draft" | "published" | null>(null);
  const categories = [...new Set([...MANAGER_CATEGORIES, ...(announcement ? [announcement.category] : [])])];

  function pickFile(next: File | undefined) {
    if (!next) return;
    if (!["application/pdf", "image/png", "image/jpeg"].includes(next.type))
      return setResult({ fieldErrors: { attachment: "Upload a PDF, PNG, or JPG file." } });
    if (next.size > MAX_FILE_BYTES) return setResult({ fieldErrors: { attachment: "File must be 10MB or smaller." } });
    setResult({});
    setFile(next);
  }

  function submit(status: "draft" | "published") {
    const fieldErrors: Record<string, string> = {};
    if (title.trim().length < 5) fieldErrors.title = "Use at least 5 characters.";
    if (!category) fieldErrors.category = "Select a category.";
    if (body.trim().length < 20) fieldErrors.body = "Use at least 20 characters.";
    if (Object.keys(fieldErrors).length) return setResult({ fieldErrors });

    const form = new FormData();
    if (announcement) form.set("id", announcement.id);
    form.set("title", title);
    form.set("category", category);
    form.set("body", body);
    form.set("status", status);
    if (file) form.set("attachment", file);
    setSubmitting(status);
    startTransition(async () => {
      const res = await saveAnnouncement(form, announcement);
      setSubmitting(null);
      if (res.ok) {
        router.refresh();
        onClose();
      } else setResult(res);
    });
  }

  const err = result.fieldErrors ?? {};
  return (
    <Modal
      open
      onClose={onClose}
      icon={MegaphoneIcon}
      title={announcement ? "Edit Department Announcement" : "Create Department Announcement"}
      footer={
        <>
          <button type="button" onClick={onClose} className={buttonClass("ghost")}>
            Cancel
          </button>
          <button type="button" onClick={() => submit("draft")} disabled={pending} className={buttonClass("secondary")}>
            {submitting === "draft" && <SpinnerIcon className="size-3.5 animate-spin" />}
            Save as Draft
          </button>
          <button type="button" onClick={() => submit("published")} disabled={pending} className={buttonClass("primary")}>
            {submitting === "published" && <SpinnerIcon className="size-3.5 animate-spin" />}
            Publish Announcement
          </button>
        </>
      }
    >
      <p className="mb-3 flex items-start gap-1.5 rounded-md bg-blue-50 px-2.5 py-2 text-[10.5px] text-slate-600">
        <InfoIcon className="mt-px size-3 shrink-0 text-[#2563eb]" />
        Demo announcements appear in this tab only. No emails or permanent records are created.
      </p>
      <div className="space-y-2.5">
        <FormField
          label="Announcement Title"
          required
          htmlFor="ann-title"
          aside={<span className="text-[9.5px] text-slate-400">Max 100 chars</span>}
          error={err.title}
        >
          <input id="ann-title" value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
        </FormField>
        <FormField label="Category" required htmlFor="ann-category" error={err.category}>
          <select
            id="ann-category"
            value={category}
            onChange={(e) => setCategory(e.target.value as AnnouncementCategory)}
            className={inputClass}
          >
            <option value="">Select a category</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {ANNOUNCEMENT_CATEGORY[c]}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Target Audience">
          <div className="flex items-center gap-2 rounded-md bg-[#eef3fe] px-2.5 py-2">
            <UsersIcon className="size-3.5 text-slate-500" />
            <div className="leading-tight">
              <p className="text-[11px] font-semibold text-slate-800">{departmentName} Department</p>
              <p className="text-[9.5px] text-slate-500">Preset read-only · {teamSize} active team members</p>
            </div>
          </div>
        </FormField>
        <FormField
          label="Announcement Content"
          required
          htmlFor="ann-body"
          aside={<span className="text-[9.5px] text-slate-400">Plain text</span>}
          error={err.body}
        >
          <textarea
            id="ann-body"
            value={body}
            maxLength={10000}
            rows={4}
            onChange={(e) => setBody(e.target.value)}
            className={cx(inputClass, "h-auto resize-none py-2")}
          />
        </FormField>
        <FormField label="Attachment" aside={<span className="text-[9.5px] text-slate-400">Optional</span>} error={err.attachment}>
          {file || announcement?.attachmentName ? (
            <div className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-[11px]">
              <span className="flex min-w-0 items-center gap-1.5 text-slate-700">
                <FileTextIcon className="size-3.5 shrink-0 text-[#2563eb]" />
                <span className="truncate">{file?.name ?? announcement?.attachmentName}</span>
              </span>
              {file ? (
                <button type="button" onClick={() => {
                  setFile(null);
                  if (fileRef.current) fileRef.current.value = "";
                }} aria-label="Remove file" className="rounded p-0.5 text-slate-400 hover:text-slate-600">
                  <XIcon className="size-3.5" />
                </button>
              ) : (
                <button type="button" onClick={() => fileRef.current?.click()} className="text-[10.5px] font-semibold text-[#2563eb] hover:underline">
                  Replace
                </button>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                pickFile(e.dataTransfer.files[0]);
              }}
              className="flex w-full flex-col items-center rounded-md border border-dashed border-slate-300 bg-[#eef3fe]/60 px-3 py-3.5"
            >
              <UploadCloudIcon className="mb-1 size-4 text-[#2563eb]" />
              <span className="text-[11px] font-semibold text-slate-800">Drop PDF or documentation guide</span>
              <span className="text-[9.5px] text-slate-500">PDF, PNG, JPG up to 10MB</span>
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,image/png,image/jpeg"
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => pickFile(e.target.files?.[0])}
          />
        </FormField>
        <FormMessage error={result.error} message={result.message} />
      </div>
    </Modal>
  );
}
