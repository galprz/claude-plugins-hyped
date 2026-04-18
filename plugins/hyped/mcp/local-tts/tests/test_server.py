from pathlib import Path
from unittest.mock import patch, MagicMock


def test_generate_calls_mlx_with_correct_args(tmp_path):
    """_generate must invoke mlx_audio.tts.generate with the right flags."""
    fake_wav = tmp_path / "tts_testprefix.wav"
    fake_wav.write_bytes(b"RIFF")

    with patch("qwen_tts_mcp.server.subprocess.run") as mock_run, \
         patch("qwen_tts_mcp.server.uuid.uuid4") as mock_uuid:
        mock_uuid.return_value.hex = "testprefix12345"
        mock_run.return_value = MagicMock(returncode=0)

        from qwen_tts_mcp.server import _generate
        result = _generate("hello world", "Chelsie", tmp_path)

    call_args = mock_run.call_args[0][0]
    assert "--model" in call_args
    assert "mlx-community/orpheus-3b-0.1-ft-4bit" in call_args
    assert "--text" in call_args
    assert "hello world" in call_args
    assert "--voice" in call_args
    assert "Chelsie" in call_args
    assert "--speed" in call_args
    assert "--join_audio" in call_args
    assert result == fake_wav


def test_generate_uses_custom_voice(tmp_path):
    """_generate must pass the voice parameter through to mlx_audio."""
    fake_wav = tmp_path / "tts_testprefix.wav"
    fake_wav.write_bytes(b"RIFF")

    with patch("qwen_tts_mcp.server.subprocess.run") as mock_run, \
         patch("qwen_tts_mcp.server.uuid.uuid4") as mock_uuid:
        mock_uuid.return_value.hex = "testprefix12345"
        mock_run.return_value = MagicMock(returncode=0)

        from qwen_tts_mcp.server import _generate
        _generate("test", "CustomVoice", tmp_path)

    call_args = mock_run.call_args[0][0]
    voice_idx = call_args.index("--voice")
    assert call_args[voice_idx + 1] == "CustomVoice"


def test_convert_to_opus_calls_ffmpeg_and_returns_opus_path(tmp_path):
    """_convert_to_opus must invoke ffmpeg with libopus codec and return .opus path."""
    wav = tmp_path / "speech.wav"
    wav.write_bytes(b"RIFF")
    expected_opus = tmp_path / "speech.opus"
    expected_opus.write_bytes(b"")  # simulate ffmpeg output

    with patch("qwen_tts_mcp.server.subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(returncode=0)

        from qwen_tts_mcp.server import _convert_to_opus
        result = _convert_to_opus(wav)

    call_args = mock_run.call_args[0][0]
    assert call_args[0] == "ffmpeg"
    assert "-i" in call_args
    assert str(wav) in call_args
    assert "libopus" in call_args
    assert str(expected_opus) in call_args
    assert result == expected_opus


def test_text_to_speech_returns_opus_path(tmp_path):
    """text_to_speech must return a .opus file path, not .wav."""
    fake_wav = tmp_path / "tts_testprefix.wav"
    fake_wav.write_bytes(b"RIFF")
    fake_opus = tmp_path / "tts_testprefix.opus"
    fake_opus.write_bytes(b"")

    with patch("qwen_tts_mcp.server.subprocess.run") as mock_run, \
         patch("qwen_tts_mcp.server.uuid.uuid4") as mock_uuid, \
         patch("qwen_tts_mcp.server.tempfile.mkdtemp") as mock_mkdtemp:
        mock_uuid.return_value.hex = "testprefix12345"
        mock_run.return_value = MagicMock(returncode=0)
        mock_mkdtemp.return_value = str(tmp_path)

        from qwen_tts_mcp.server import text_to_speech
        result = text_to_speech("hello")

    assert result.endswith(".opus")
