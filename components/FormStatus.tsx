export function FormError({ message }: { message: string }) {
  return (
    <p className="rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-600 dark:text-red-400">
      {message}
    </p>
  );
}

export function SubmitButton({
  pending,
  label,
  pendingLabel = "Saving...",
}: {
  pending: boolean;
  label: string;
  pendingLabel?: string;
}) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-2 self-start rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
