"use client";

export default function DeleteButton({
  action,
  confirmText,
  label = "Delete",
}: {
  action: (formData: FormData) => void | Promise<void>;
  confirmText: string;
  label?: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!confirm(confirmText)) {
          event.preventDefault();
        }
      }}
    >
      <button
        type="submit"
        className="rounded-md border border-red-500/40 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-500/10 dark:text-red-400"
      >
        {label}
      </button>
    </form>
  );
}
