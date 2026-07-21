import { TERMS_LAST_UPDATED } from '@wortgarten/shared';
import termsContent from '@/legal/terms.md?raw';
import { LegalPage } from './LegalPage';

export function TermsPage() {
  return <LegalPage content={termsContent} lastUpdated={TERMS_LAST_UPDATED} otherPage={{ label: 'Privacy Policy', to: '/privacy' }} />;
}
