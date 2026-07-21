import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import Masonry, { ResponsiveMasonry } from 'react-responsive-masonry';
import { Card } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { Chip } from '@/components/ui/Chip';
import { tokens } from '@/design/tokens';
import pkg from '../../../package.json';
import { useProfileQuery } from './api/useProfileQuery';
import { useAccountsQuery } from './api/useAccountsQuery';
import { InlineEditableName } from './components/InlineEditableName';
import { TimezoneRow } from './components/TimezoneRow';
import { TtsToggleRow } from './components/TtsToggleRow';
import { ChangePasswordRow } from './components/ChangePasswordRow';
import { ExportRow } from './components/ExportRow';
import { LogoutRow } from './components/LogoutRow';
import { DeleteAccountDialog } from './components/DeleteAccountDialog';

function Skeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-32 rounded-sketch bg-card/60" />
      <div className="h-40 rounded-sketch bg-card/60" />
      <div className="h-40 rounded-sketch bg-card/60" />
    </div>
  );
}

export function ProfilePage() {
  const { data, isLoading, isError } = useProfileQuery();
  const { data: accounts } = useAccountsQuery();
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (isLoading) return <Skeleton />;
  if (isError || !data) {
    return <div className="py-12 text-center text-muted">Failed to load your profile. Is the API running?</div>;
  }

  const memberSince = new Intl.DateTimeFormat('en-US', { dateStyle: 'long' }).format(new Date(data.createdAt));
  const signInMethod = accounts?.signInMethod;

  return (
    <div className="lg:mx-auto lg:max-w-3xl">
      <Link to="/" className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink lg:hidden">
        <ArrowLeft size={16} /> Back to Home
      </Link>

      <div className="flex flex-col gap-4 lg:gap-5">
        <ResponsiveMasonry columnsCountBreakPoints={{ 0: 1, 1024: 2 }} gutterBreakPoints={{ 0: 16, 1024: 20 }}>
          <Masonry>
            {/* Account */}
            <Card index={0}>
              <div className="flex items-center gap-4">
                <Avatar name={data.user.name} src={data.user.image ?? undefined} size="lg" />
                <div className="min-w-0 flex-1">
                  <InlineEditableName name={data.user.name} />
                  <p className="truncate text-sm text-muted">{data.user.email}</p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Chip variant="learning">Day {data.dayNumber} of learning German</Chip>
                <Chip variant="neutral">Member since {memberSince}</Chip>
                {signInMethod && <Chip variant="neutral">{signInMethod === 'google' ? 'Signed in with Google' : 'Signed in with email'}</Chip>}
              </div>
            </Card>

            {/* Learning settings */}
            <Card index={1} className="flex flex-col gap-5">
              <p className="text-xs font-extrabold uppercase tracking-wide text-muted">Learning settings</p>
              <TimezoneRow timezone={data.timezone} />
              <TtsToggleRow />
              <div>
                <p className="font-bold" style={{ color: tokens.color.ink }}>
                  Language
                </p>
                <p className="text-sm text-muted">German — the only language Wortgarten teaches right now.</p>
              </div>
            </Card>
          </Masonry>
        </ResponsiveMasonry>

        {/* Account actions */}
        <Card index={2} className="flex flex-col gap-5">
          <p className="text-xs font-extrabold uppercase tracking-wide text-muted">Account actions</p>
          {accounts?.hasCredential && <ChangePasswordRow email={data.user.email} />}
          <ExportRow />
          <div className="flex items-center justify-between gap-3">
            <LogoutRow />
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              className="text-sm font-bold hover:underline"
              style={{ color: tokens.color.coral }}
            >
              Delete account
            </button>
          </div>
        </Card>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-1 py-2 text-xs text-muted">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Link to="/about" className="font-semibold text-teal hover:underline">
              About &amp; credits
            </Link>
            <Link to="/privacy" className="font-semibold text-teal hover:underline">
              Privacy
            </Link>
            <Link to="/terms" className="font-semibold text-teal hover:underline">
              Terms
            </Link>
          </div>
          <span>Wortgarten v{pkg.version}</span>
          {/* <a href="mailto:feedback@wortgarten.app" className="font-semibold text-teal hover:underline">
            Send feedback
          </a> */}
        </div>
      </div>

      {deleteOpen && <DeleteAccountDialog email={data.user.email} onClose={() => setDeleteOpen(false)} />}
    </div>
  );
}
