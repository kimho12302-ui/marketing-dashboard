"use client";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
}

export default function PageHeader({ title, subtitle }: PageHeaderProps) {
  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 dark:text-zinc-100">{title}</h2>
      {subtitle && <p className="text-sm text-gray-400 dark:text-zinc-500 mt-0.5">{subtitle}</p>}
    </div>
  );
}
