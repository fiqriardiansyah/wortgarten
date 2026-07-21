import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { tokens } from '@/design/tokens';

// Attribution note for whoever ships this to paying users: the dictionary's CC BY-SA share-alike
// term (below) has real commercial implications — worth legal review before a paid launch. Tatoeba's
// CC BY has no share-alike and is clean. This page discharges the *attribution* duty for both; it
// does not resolve the share-alike question.

function CreditRow({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-t py-3 first:border-t-0 first:pt-0" style={{ borderColor: tokens.color.lineSoft }}>
      <p className="font-bold" style={{ color: tokens.color.ink }}>
        {title}
      </p>
      <p className="mt-1 text-sm text-muted">{children}</p>
    </div>
  );
}

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="font-semibold text-teal hover:underline">
      {children}
    </a>
  );
}

export function AboutPage() {
  return (
    <div className="lg:mx-auto lg:max-w-2xl">
      <Link to="/profile" className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink">
        <ArrowLeft size={16} /> Back to Profile
      </Link>

      <div className="flex flex-col gap-4">
        <Card index={0}>
          <p className="text-lg font-extrabold" style={{ color: tokens.color.ink }}>
            About Wortgarten
          </p>
          <p className="mt-2 text-sm text-ink">
            Wortgarten is the gym for words you've already met. You collect words you run into while reading,
            watching, or talking, and the app makes them stick — spaced review, short drills, and stories built
            from what you already know.
          </p>
        </Card>

        <Card index={1}>
          <p className="text-xs font-extrabold uppercase tracking-wide text-muted">Credits &amp; licences</p>

          <CreditRow title="Dictionary">
            Word data is derived from <ExternalLink href="https://www.wiktionary.org/">Wiktionary</ExternalLink>, via{' '}
            <ExternalLink href="https://kaikki.org/">kaikki.org / wiktextract</ExternalLink>. Licensed{' '}
            <ExternalLink href="https://creativecommons.org/licenses/by-sa/3.0/">CC BY-SA 3.0</ExternalLink> and{' '}
            <ExternalLink href="https://www.gnu.org/licenses/fdl-1.3.html">GFDL</ExternalLink>.
          </CreditRow>

          <CreditRow title="Example sentences">
            Example sentences come from the <ExternalLink href="https://tatoeba.org/">Tatoeba Project</ExternalLink>,
            licensed <ExternalLink href="https://creativecommons.org/licenses/by/2.0/fr/">CC BY 2.0 FR</ExternalLink>.
            Each sentence keeps its original Tatoeba sentence ID for per-sentence attribution.
          </CreditRow>

          <CreditRow title="Word frequency data">
            Frequency ranking is derived from OpenSubtitles data via{' '}
            <ExternalLink href="https://github.com/hermitdave/FrequencyWords">hermitdave/FrequencyWords</ExternalLink>,
            licensed under its repository's{' '}
            <ExternalLink href="https://github.com/hermitdave/FrequencyWords/blob/master/LICENSE">MIT License</ExternalLink>.
          </CreditRow>

          <CreditRow title="Fonts & libraries">
            Set in <ExternalLink href="https://fonts.google.com/specimen/Nunito">Nunito</ExternalLink> (SIL Open Font
            License). Built with React, Vite, NestJS, Prisma, TanStack Query, Tailwind CSS, and Motion, among other
            open-source projects.
          </CreditRow>
        </Card>

        <Card index={2}>
          <p className="text-xs font-extrabold uppercase tracking-wide text-muted">AI-generated content</p>
          <p className="mt-2 text-sm text-ink">
            Stories and their cover images are AI-generated. Wortgarten — not the model — chooses which vocabulary
            each story practices; the model only writes around it. Generated text can occasionally contain mistakes,
            so treat stories as practice material rather than a reference source.
          </p>
        </Card>

        <Card index={3}>
          <p className="text-xs font-extrabold uppercase tracking-wide text-muted">Legal</p>
          <div className="mt-2 flex gap-4">
            <Link to="/privacy" className="text-sm font-semibold text-teal hover:underline">
              Privacy policy
            </Link>
            <Link to="/terms" className="text-sm font-semibold text-teal hover:underline">
              Terms of service
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
