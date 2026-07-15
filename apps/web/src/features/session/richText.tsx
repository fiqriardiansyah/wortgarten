import type { ReactNode } from 'react';

/** buildCorrection's tips use double-asterisk-bold and single-asterisk-italic markers (Part 6
 * copy) — render them without pulling in a markdown dependency for two inline styles. */
export function RichText({ text }: { text: string }): ReactNode {
  const regex = /\*\*(.+?)\*\*|\*(.+?)\*/g;
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text))) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    if (match[1] !== undefined) parts.push(<strong key={key++}>{match[1]}</strong>);
    else if (match[2] !== undefined) parts.push(<em key={key++}>{match[2]}</em>);
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return <>{parts}</>;
}

/** Bolds `emphasize` (a substring of `answer`) without coral — coral is reserved for the error. */
export function EmphasizedAnswer({ answer, emphasize }: { answer: string; emphasize?: string }): ReactNode {
  if (!emphasize) return <>{answer}</>;
  const idx = answer.indexOf(emphasize);
  if (idx === -1) return <>{answer}</>;
  return (
    <>
      {answer.slice(0, idx)}
      <strong>{emphasize}</strong>
      {answer.slice(idx + emphasize.length)}
    </>
  );
}
