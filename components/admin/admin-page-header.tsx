export function AdminPageHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <header className="border-b border-ink/20 bg-paper/95 px-5 py-5 sm:px-7">
      <p className="utility-label">{eyebrow}</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-[-0.02em]">{title}</h1>
      <p className="mt-1 max-w-3xl text-sm leading-6 text-ink-muted">{description}</p>
    </header>
  );
}
