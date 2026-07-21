import type { ComponentPropsWithoutRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';
import { Link } from 'react-router-dom';
import { Sprout, TriangleAlert } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { tokens } from '@/design/tokens';

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'long' }).format(new Date(iso));
}

function isInternalHref(href: string | undefined): boolean {
  return !!href && href.startsWith('/');
}

const markdownComponents = {
  h1: (props: ComponentPropsWithoutRef<'h1'>) => (
    <h1 className="text-lg font-extrabold" style={{ color: tokens.color.ink }} {...props} />
  ),
  h2: (props: ComponentPropsWithoutRef<'h2'>) => (
    <h2 className="mt-6 text-base font-extrabold" style={{ color: tokens.color.ink }} {...props} />
  ),
  h3: (props: ComponentPropsWithoutRef<'h3'>) => (
    <h3 className="mt-4 text-xs font-extrabold uppercase tracking-wide text-muted" {...props} />
  ),
  p: (props: ComponentPropsWithoutRef<'p'>) => <p className="mt-3 text-sm leading-relaxed text-ink" {...props} />,
  ul: (props: ComponentPropsWithoutRef<'ul'>) => <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-ink" {...props} />,
  ol: (props: ComponentPropsWithoutRef<'ol'>) => <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-ink" {...props} />,
  li: (props: ComponentPropsWithoutRef<'li'>) => <li className="leading-relaxed" {...props} />,
  strong: (props: ComponentPropsWithoutRef<'strong'>) => <strong className="font-bold" style={{ color: tokens.color.ink }} {...props} />,
  hr: () => <hr className="my-6" style={{ borderColor: tokens.color.lineSoft }} />,
  a: ({ href, ...props }: ComponentPropsWithoutRef<'a'>) => (
    <a
      href={href}
      target={isInternalHref(href) ? undefined : '_blank'}
      rel={isInternalHref(href) ? undefined : 'noreferrer'}
      className="font-semibold text-teal hover:underline"
      {...props}
    />
  ),
  table: (props: ComponentPropsWithoutRef<'table'>) => (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full border-collapse text-sm" {...props} />
    </div>
  ),
  th: (props: ComponentPropsWithoutRef<'th'>) => (
    <th className="border-b py-2 pr-4 text-left font-extrabold" style={{ borderColor: tokens.color.lineSoft, color: tokens.color.ink }} {...props} />
  ),
  td: (props: ComponentPropsWithoutRef<'td'>) => (
    <td className="border-b py-2 pr-4 align-top text-ink" style={{ borderColor: tokens.color.lineSoft }} {...props} />
  ),
};

interface LegalPageProps {
  content: string;
  lastUpdated: string;
  otherPage: { label: string; to: string };
}

/** Public, auth-independent shell for /privacy and /terms — deliberately not wrapped in
 * AppLayout, which assumes a logged-in session (useHomeQuery). A prospective user must be able
 * to read these before signing up. */
export function LegalPage({ content, lastUpdated, otherPage }: LegalPageProps) {
  return (
    <div className="min-h-screen font-sans" style={{ backgroundColor: tokens.color.bg }}>
      <div className="mx-auto max-w-2xl px-4 py-8 lg:py-12">
        <div className="mb-6 flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-2">
            <Sprout size={22} style={{ color: tokens.color.teal }} />
            <span className="font-extrabold" style={{ color: tokens.color.ink }}>
              Wortgarten
            </span>
          </Link>
          <Link to={otherPage.to} className="text-sm font-semibold text-teal hover:underline">
            {otherPage.label}
          </Link>
        </div>

        <div
          className="mb-4 flex items-start gap-2 rounded-sketch border-2 border-dashed p-3"
          style={{ borderColor: tokens.color.coral, backgroundColor: tokens.color.coralSoft }}
        >
          <TriangleAlert size={18} className="mt-0.5 shrink-0" style={{ color: tokens.color.coralDeep }} />
          <p className="text-sm font-semibold" style={{ color: tokens.color.coralDeep }}>
            Draft — not yet reviewed by a lawyer. Do not treat this page as final.
          </p>
        </div>

        <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-muted">Last updated: {formatDate(lastUpdated)}</p>

        <Card index={0}>
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSlug]} components={markdownComponents}>
            {content}
          </ReactMarkdown>
        </Card>
      </div>
    </div>
  );
}
