import { PRIVACY_LAST_UPDATED } from '@wortgarten/shared';
import privacyContent from '@/legal/privacy.md?raw';
import { LegalPage } from './LegalPage';

export function PrivacyPage() {
  return <LegalPage content={privacyContent} lastUpdated={PRIVACY_LAST_UPDATED} otherPage={{ label: 'Terms of Service', to: '/terms' }} />;
}
