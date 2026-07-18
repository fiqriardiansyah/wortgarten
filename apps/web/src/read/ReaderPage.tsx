import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ZodError } from 'zod';
import type { StoryParagraph, StoryToken } from '@wortgarten/shared';
import { ApiError } from '@/lib/apiClient';
import { useStory, useMarkWordKnown } from '@/read/api/useStory';
import { ReaderTopBar, type ReaderFontSize } from '@/read/components/ReaderTopBar';
import { StoryBody } from '@/read/components/StoryBody';
import { WordPopup } from '@/read/components/WordPopup';
import { IllustrationSlot } from '@/components/ui/IllustrationSlot';

interface SelectedWord {
  token: StoryToken;
  paragraph: StoryParagraph;
}

function useScrollProgress() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    function handleScroll() {
      const { scrollTop, scrollHeight, clientHeight } = document.documentElement;
      const max = scrollHeight - clientHeight;
      setProgress(max > 0 ? Math.min(100, Math.max(0, (scrollTop / max) * 100)) : 0);
    }
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return progress;
}

export function ReaderPage() {
  const { id = '' } = useParams<{ id: string }>();
  const { data: story, isLoading, isError, error, refetch } = useStory(id);
  const markWordKnown = useMarkWordKnown(id);
  const [fontSize, setFontSize] = useState<ReaderFontSize>('M');
  const [selected, setSelected] = useState<SelectedWord | null>(null);
  const [showTranslation, setShowTranslation] = useState(false);
  const progress = useScrollProgress();

  if (isLoading) {
    return <div className="py-12 text-center text-muted">Loading story…</div>;
  }
  if (isError || !story) {
    // A parse failure (bad payload shape) is a different problem than a 404 — never collapse
    // them into the same message, and never silently swallow the ZodError.
    if (error instanceof ZodError) {
      console.error('Story failed shape validation', error);
      return (
        <div className="py-12 text-center text-muted">
          Couldn't load this story — its data looks malformed.{' '}
          <button onClick={() => refetch()} className="font-semibold text-teal hover:underline">
            Try again
          </button>
        </div>
      );
    }
    if (error instanceof ApiError && error.status === 404) {
      return <div className="py-12 text-center text-muted">Couldn't find that story.</div>;
    }
    return (
      <div className="py-12 text-center text-muted">
        Failed to load this story.{' '}
        <button onClick={() => refetch()} className="font-semibold text-teal hover:underline">
          Try again
        </button>
      </div>
    );
  }
  if (story.status === 'GENERATING') {
    return <div className="py-12 text-center text-muted">This story is still being written — check back soon.</div>;
  }

  function handleAdd(_lexemeId: string) {
    if (selected) markWordKnown(selected.token);
    setSelected(null);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <ReaderTopBar title={story.title} fontSize={fontSize} onFontSizeChange={setFontSize} progress={progress} />

      <IllustrationSlot label="story reader header" height={120} className="mb-4" />

      <StoryBody story={story} fontSize={fontSize} onTapWord={(token, paragraph) => setSelected({ token, paragraph })} />

      <p className="mt-6 text-center text-xs text-muted">tap = review · underlined = new word</p>

      {/* `translation` is nullable — most stories won't have one yet, so this only renders when present. */}
      {story.translation && (
        <div className="mt-4 border-t border-line pt-4">
          <button
            onClick={() => setShowTranslation((v) => !v)}
            className="text-xs font-semibold text-teal hover:underline"
          >
            {showTranslation ? 'Hide' : 'Show'} English translation
          </button>
          {showTranslation && <p className="mt-2 text-sm text-muted">{story.translation}</p>}
        </div>
      )}

      {selected && (
        <WordPopup
          story={story}
          token={selected.token}
          paragraph={selected.paragraph}
          onAdd={handleAdd}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
