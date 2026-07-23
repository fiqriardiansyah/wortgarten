import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ZodError } from 'zod';
import type { Story, StoryParagraph, StoryToken } from '@wortgarten/shared';
import { ApiError } from '@/lib/apiClient';
import { useStory, useMarkWordKnown } from '@/read/api/useStory';
import { ReaderTopBar, type ReaderFontSize } from '@/read/components/ReaderTopBar';
import { StoryBody, type ActiveSentencePosition, type ActiveTokenPosition } from '@/read/components/StoryBody';
import { WordPopup } from '@/read/components/WordPopup';
import { StoryCoverBanner } from '@/components/ui/StoryCoverBanner';
import { FontSizeSelector } from '@/read/components/FontSizeSelector';
import { ListenControl } from '@/read/components/ListenControl';
import { useListenAudio } from '@/read/useListenAudio';

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

// A real user gesture, not the `scrollIntoView` calls Listen Mode's own auto-scroll makes — using
// 'wheel'/'touchmove' instead of 'scroll' avoids the auto-scroll re-triggering this itself.
function useManualScrollGuard() {
  const lastManualScrollAt = useRef(0);

  useEffect(() => {
    function markManual() {
      lastManualScrollAt.current = Date.now();
    }
    window.addEventListener('wheel', markManual, { passive: true });
    window.addEventListener('touchmove', markManual, { passive: true });
    return () => {
      window.removeEventListener('wheel', markManual);
      window.removeEventListener('touchmove', markManual);
    };
  }, []);

  return lastManualScrollAt;
}

/** Word-level: the token whose `[audioStartMs, audioEndMs)` window contains `currentTimeMs`.
 * Sentence-level: the `sentenceTimings` span containing it. Null whenever Listen Mode isn't
 * actively playing, the story has no audio, or no span matches (a small gap between words) — the
 * reader never crashes over missing/incomplete timings. */
function findActivePosition(
  story: Story,
  currentTimeMs: number,
): { activeToken: ActiveTokenPosition | null; activeSentence: ActiveSentencePosition | null } {
  if (story.audioSync === 'wordLevel') {
    for (let paragraphIndex = 0; paragraphIndex < story.paragraphs.length; paragraphIndex++) {
      const tokens = story.paragraphs[paragraphIndex].tokens;
      for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex++) {
        const token = tokens[tokenIndex];
        if (token.kind !== 'word' || token.audioStartMs == null || token.audioEndMs == null) continue;
        if (currentTimeMs >= token.audioStartMs && currentTimeMs < token.audioEndMs) {
          return { activeToken: { paragraphIndex, tokenIndex }, activeSentence: null };
        }
      }
    }
    return { activeToken: null, activeSentence: null };
  }

  if (story.audioSync === 'sentenceLevel' && story.sentenceTimings) {
    const span = story.sentenceTimings.find((s) => currentTimeMs >= s.startMs && currentTimeMs < s.endMs);
    if (span) {
      return {
        activeToken: null,
        activeSentence: { paragraphIndex: span.paragraphIndex, startTokenIndex: span.startTokenIndex, endTokenIndex: span.endTokenIndex },
      };
    }
  }

  return { activeToken: null, activeSentence: null };
}

export function ReaderPage() {
  const { id = '' } = useParams<{ id: string }>();
  const { data: story, isLoading, isError, error, refetch } = useStory(id);
  const markWordKnown = useMarkWordKnown(id);
  const [fontSize, setFontSize] = useState<ReaderFontSize>('M');
  const [selected, setSelected] = useState<SelectedWord | null>(null);
  const [showTranslation, setShowTranslation] = useState(false);
  const progress = useScrollProgress();

  const { isPlaying, currentTimeMs, speed, setSpeed, toggle } = useListenAudio(story?.audioUrl ?? null);
  const { activeToken, activeSentence } = useMemo(
    () => (story && isPlaying ? findActivePosition(story, currentTimeMs) : { activeToken: null, activeSentence: null }),
    [story, isPlaying, currentTimeMs],
  );

  const activeElRef = useRef<HTMLElement | null>(null);
  const registerActiveRef = useCallback((el: HTMLElement | null) => {
    activeElRef.current = el;
  }, []);
  const lastManualScrollAt = useManualScrollGuard();
  const activePositionKey = activeToken
    ? `t:${activeToken.paragraphIndex}:${activeToken.tokenIndex}`
    : activeSentence
      ? `s:${activeSentence.paragraphIndex}:${activeSentence.startTokenIndex}`
      : null;

  useEffect(() => {
    if (!activePositionKey) return;
    if (Date.now() - lastManualScrollAt.current < 1500) return; // user is scrolling on their own — don't fight them
    activeElRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [activePositionKey, lastManualScrollAt]);

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

  const listenProps = story.audioUrl ? { isPlaying, onToggle: toggle, speed, onSpeedChange: setSpeed } : undefined;

  return (
    <div className="mx-auto max-w-2xl flex flex-col">
      <ReaderTopBar
        title={story.title}
        fontSize={fontSize}
        onFontSizeChange={setFontSize}
        progress={progress}
        listen={listenProps}
      />

      {story.coverImageUrl && (
        <StoryCoverBanner
          src={story.coverImageUrl}
          alt={`${story.title} — ${(story.translation ?? '').slice(0, 60)}`}
          height={120}
          className="mb-4"
        />
      )}

      {/* Mobile: ReaderTopBar hides its own ListenControl/FontSizeSelector below `lg` (too cramped
          next to the title there) and this row takes over, sitting under the cover image instead. */}
      <div className="mb-4 flex items-center justify-center gap-3 lg:hidden">
        {listenProps && <ListenControl {...listenProps} />}
        <FontSizeSelector fontSize={fontSize} onFontSizeChange={setFontSize} />
      </div>

      <StoryBody
        story={story}
        fontSize={fontSize}
        onTapWord={(token, paragraph) => setSelected({ token, paragraph })}
        activeToken={activeToken}
        activeSentence={activeSentence}
        registerActiveRef={registerActiveRef}
      />

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
