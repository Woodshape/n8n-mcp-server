#!/usr/bin/env python3
"""
transcribe.py - Download and transcribe Telegram audio files.

Usage:
    python3 transcribe.py <message_id> <chat_id> <file_id>

Output: JSON to stdout with keys: transcript, duration_seconds, chunks

Setup:
    pip install telethon groq openai
    ffmpeg must be installed

Environment variables:
    TELEGRAM_API_ID       - from my.telegram.org
    TELEGRAM_API_HASH     - from my.telegram.org
    TELEGRAM_SESSION_NAME - path to .session file (default: phonemo)
    GROQ_API_KEY          - primary transcription (free tier)
    OPENAI_API_KEY        - fallback transcription (optional)
"""

import sys
import os
import json
import tempfile
import subprocess
import math
import asyncio
from pathlib import Path

# ── Configuration ─────────────────────────────────────────────────────────────

TELEGRAM_API_ID = int(os.environ["TELEGRAM_API_ID"])
TELEGRAM_API_HASH = os.environ["TELEGRAM_API_HASH"]
TELEGRAM_SESSION = os.environ.get("TELEGRAM_SESSION_NAME", "phonemo")
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")

CHUNK_DURATION = 600  # 10-minute chunks (well under 25MB Whisper limit)
WHISPER_MODEL = "whisper-large-v3"

# ── Download via Telethon ──────────────────────────────────────────────────────

async def download_audio(chat_id: int, message_id: int, dest_path: str) -> None:
    from telethon import TelegramClient
    from telethon.tl.types import Message

    client = TelegramClient(TELEGRAM_SESSION, TELEGRAM_API_ID, TELEGRAM_API_HASH)
    await client.start()

    try:
        message: Message = await client.get_messages(chat_id, ids=message_id)
        if not message or not message.media:
            raise ValueError(f"No media found in message {message_id}")

        await client.download_media(message.media, file=dest_path)
    finally:
        await client.disconnect()


# ── Audio processing with ffmpeg ───────────────────────────────────────────────

def convert_to_mono_ogg(input_path: str, output_path: str) -> float:
    """Convert to mono 16kHz OGG (Whisper-friendly, smaller size). Returns duration in seconds."""
    result = subprocess.run(
        [
            "ffprobe", "-v", "quiet", "-print_format", "json",
            "-show_format", input_path,
        ],
        capture_output=True, text=True, check=True,
    )
    duration = float(json.loads(result.stdout)["format"]["duration"])

    subprocess.run(
        [
            "ffmpeg", "-y", "-i", input_path,
            "-ac", "1",           # mono
            "-ar", "16000",       # 16kHz
            "-c:a", "libopus",    # Opus codec (good quality, small size)
            output_path,
        ],
        capture_output=True, check=True,
    )
    return duration


def split_into_chunks(input_path: str, chunk_dir: str) -> list[str]:
    """Split audio into CHUNK_DURATION-second segments. Returns sorted list of paths."""
    pattern = os.path.join(chunk_dir, "chunk_%03d.ogg")
    subprocess.run(
        [
            "ffmpeg", "-y", "-i", input_path,
            "-f", "segment",
            "-segment_time", str(CHUNK_DURATION),
            "-c", "copy",
            pattern,
        ],
        capture_output=True, check=True,
    )
    chunks = sorted(Path(chunk_dir).glob("chunk_*.ogg"))
    return [str(c) for c in chunks]


# ── Whisper transcription ──────────────────────────────────────────────────────

def transcribe_with_groq(audio_path: str, prompt: str = "") -> str:
    import groq

    client = groq.Groq(api_key=GROQ_API_KEY)
    with open(audio_path, "rb") as f:
        response = client.audio.transcriptions.create(
            model=WHISPER_MODEL,
            file=f,
            prompt=prompt or None,
            response_format="text",
        )
    return response if isinstance(response, str) else response.text


def transcribe_with_openai(audio_path: str, prompt: str = "") -> str:
    from openai import OpenAI

    client = OpenAI(api_key=OPENAI_API_KEY)
    with open(audio_path, "rb") as f:
        response = client.audio.transcriptions.create(
            model="whisper-1",
            file=f,
            prompt=prompt or None,
            response_format="text",
        )
    return response


def transcribe_chunk(audio_path: str, prompt: str = "") -> str:
    """Transcribe a single chunk, falling back to OpenAI on Groq rate limit."""
    if GROQ_API_KEY:
        try:
            return transcribe_with_groq(audio_path, prompt)
        except Exception as e:
            if "429" in str(e) or "rate" in str(e).lower():
                if OPENAI_API_KEY:
                    return transcribe_with_openai(audio_path, prompt)
            raise
    elif OPENAI_API_KEY:
        return transcribe_with_openai(audio_path, prompt)
    else:
        raise RuntimeError("No transcription API key set (GROQ_API_KEY or OPENAI_API_KEY required)")


def get_last_sentence(text: str) -> str:
    """Extract the last sentence to use as Whisper prompt for next chunk."""
    text = text.strip()
    for sep in (". ", "! ", "? "):
        idx = text.rfind(sep)
        if idx != -1:
            return text[idx + 2:].strip()
    return text[-200:] if len(text) > 200 else text


# ── Main ───────────────────────────────────────────────────────────────────────

async def main():
    if len(sys.argv) != 4:
        print(json.dumps({"error": "Usage: transcribe.py <message_id> <chat_id> <file_id>"}))
        sys.exit(1)

    message_id = int(sys.argv[1])
    chat_id = int(sys.argv[2])
    # file_id is passed for reference but we use Telethon to download by message
    # file_id = sys.argv[3]

    with tempfile.TemporaryDirectory() as tmpdir:
        raw_path = os.path.join(tmpdir, "audio_raw")
        converted_path = os.path.join(tmpdir, "audio.ogg")
        chunk_dir = os.path.join(tmpdir, "chunks")
        os.makedirs(chunk_dir)

        # 1. Download
        await download_audio(chat_id, message_id, raw_path)

        # 2. Convert to mono 16kHz OGG
        duration_seconds = convert_to_mono_ogg(raw_path, converted_path)

        # 3. Split into chunks
        chunk_paths = split_into_chunks(converted_path, chunk_dir)

        # 4. Transcribe each chunk sequentially with prompt continuity
        transcript_parts = []
        carry_prompt = ""

        for i, chunk_path in enumerate(chunk_paths):
            chunk_text = transcribe_chunk(chunk_path, prompt=carry_prompt)
            transcript_parts.append(chunk_text.strip())
            carry_prompt = get_last_sentence(chunk_text)

        full_transcript = " ".join(transcript_parts)

        result = {
            "transcript": full_transcript,
            "duration_seconds": math.ceil(duration_seconds),
            "chunks": len(chunk_paths),
            "message_id": message_id,
            "chat_id": chat_id,
        }
        print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    asyncio.run(main())
