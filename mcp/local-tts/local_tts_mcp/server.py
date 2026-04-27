import subprocess
import sys
import tempfile
import uuid
from pathlib import Path

import fastmcp

mcp = fastmcp.FastMCP("local-tts")

_MODEL = "mlx-community/orpheus-3b-0.1-ft-4bit"
_VOICE = "jake"
_SPEED = 1.2
_MAX_TOKENS = 8192  # ~95s at 86 tokens/sec


def _convert_to_opus(wav: Path) -> Path:
    """Convert a WAV file to Opus using ffmpeg. Returns the .opus path."""
    opus = wav.with_suffix(".opus")
    subprocess.run(
        ["ffmpeg", "-i", str(wav), "-c:a", "libopus", "-b:a", "128k", str(opus)],
        check=True,
    )
    return opus


def _generate(text: str, out_dir: Path) -> Path:
    """Shell out to mlx_audio.tts.generate and return the WAV path."""
    prefix = f"tts_{uuid.uuid4().hex[:8]}"
    subprocess.run(
        [
            sys.executable, "-m", "mlx_audio.tts.generate",
            "--model",        _MODEL,
            "--text",         text,
            "--output_path",  str(out_dir),
            "--file_prefix",  prefix,
            "--audio_format", "wav",
            "--join_audio",
            "--voice",        _VOICE,
            "--speed",        str(_SPEED),
            "--max_tokens",   str(_MAX_TOKENS),
        ],
        check=True,
        capture_output=True,
    )
    return next(out_dir.glob(f"{prefix}*.wav"))


@mcp.tool()
def text_to_speech(text: str) -> str:
    """Generate speech from text using Orpheus 3B TTS (local, Apple Silicon).
    Returns the absolute path to the generated Opus file."""
    out_dir = Path(tempfile.mkdtemp())
    wav = _generate(text, out_dir)
    return str(_convert_to_opus(wav))


def main() -> None:
    mcp.run()


if __name__ == "__main__":
    main()
