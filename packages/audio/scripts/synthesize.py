"""Thin wrapper around the `edge_tts` library — called as a subprocess from
`packages/audio/src/edge-tts.client.ts`. Not a general CLI: every argument is a file path so the
Node side never has to shell-escape German text (quotes, length limits).

edge-tts is an UNOFFICIAL client of Microsoft Edge's read-aloud service (see edge-tts.client.ts's
own comment) — free and excellent for building/testing, but its terms for a commercial product are
unclear. Flagged here too since this is the file that actually talks to it.

Writes the MP3 to --out-audio and word-boundary timings (offset/duration converted from the
library's 100ns ticks to milliseconds) as JSON to --out-timings.
"""

import argparse
import asyncio
import json

import edge_tts


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--text-file", required=True)
    parser.add_argument("--voice", required=True)
    parser.add_argument("--rate", required=True)
    parser.add_argument("--out-audio", required=True)
    parser.add_argument("--out-timings", required=True)
    args = parser.parse_args()

    with open(args.text_file, "r", encoding="utf-8") as f:
        text = f.read()

    # `boundary` defaults to "SentenceBoundary" in this library — karaoke needs per-word timing,
    # so this must be requested explicitly or `WordBoundary` chunks never arrive at all.
    communicate = edge_tts.Communicate(text, voice=args.voice, rate=args.rate, boundary="WordBoundary")

    words = []
    with open(args.out_audio, "wb") as audio_file:
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_file.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                words.append(
                    {
                        "text": chunk["text"],
                        "offsetMs": chunk["offset"] / 10000,
                        "durationMs": chunk["duration"] / 10000,
                    }
                )

    with open(args.out_timings, "w", encoding="utf-8") as f:
        json.dump({"words": words}, f)


if __name__ == "__main__":
    asyncio.run(main())
