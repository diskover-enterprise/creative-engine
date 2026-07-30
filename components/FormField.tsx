export const inputClass =
  "rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/30 dark:border-white/15";

export default function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium">
      {label}
      {children}
    </label>
  );
}
