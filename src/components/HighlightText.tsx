import React from 'react';

export function escapeSearchRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function renderHighlightedText(text: string, query?: string): React.ReactNode {
  if (!text) return text;
  const trimmed = query?.trim() || '';
  if (!trimmed) return text;

  const escaped = escapeSearchRegExp(trimmed);
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = text.split(regex);

  if (parts.length <= 1) return text;

  const lowerQuery = trimmed.toLowerCase();
  return parts.map((part, idx) =>
    part.toLowerCase() === lowerQuery ? (
      <mark
        key={`hl-${idx}`}
        data-search-match="true"
        className="bg-amber-400/95 text-slate-950 font-semibold px-0.5 rounded-sm shadow-[0_0_8px_rgba(251,191,36,0.45)]"
      >
        {part}
      </mark>
    ) : (
      <React.Fragment key={`txt-${idx}`}>{part}</React.Fragment>
    )
  );
}

interface HighlightTextProps {
  text: string;
  query?: string;
}

export const HighlightText: React.FC<HighlightTextProps> = ({ text, query }) => {
  return <>{renderHighlightedText(text, query)}</>;
};
