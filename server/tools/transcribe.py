"""
Transcribe a recorded session folder (see server/src/recordings.ts) with faster-whisper, locally.

Each person's own mic track (tracks/tracks.json) is transcribed on its own, so every line knows
who said it; the lines are then put on the video's timeline (seconds from the video start, the same
clock as nhat-ky.txt) and merged. Without tracks, the video's own audio is transcribed instead
(no speaker names).

Writes into the folder:
  loi-thoai.md    one line per utterance: "[1:02:03] Name: text"  (for an editing agent / reading)
  loi-thoai.srt   subtitles on the video's timeline, "Name: text"
  loi-thoai.json  the same, machine readable: [{start, end, speaker, text}]

Usage:  python transcribe.py "<session folder>" [--model large-v3-turbo] [--lang vi] [--device auto]
Exit codes: 0 ok, 2 bad folder, 3 faster-whisper missing, 1 other error.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time


def fmt_clock(sec: float) -> str:
    t = max(0, int(sec))
    h, m, s = t // 3600, (t % 3600) // 60, t % 60
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"


def fmt_srt(sec: float) -> str:
    ms = max(0, int(round(sec * 1000)))
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


# Lines Whisper is known to invent on silence / noise (Vietnamese YouTube outros etc.).
HALLUCINATIONS = [
    r"subscribe",
    r"đăng ký kênh",
    r"ghiền mì gõ",
    r"cảm ơn các bạn đã (theo dõi|xem)",
    r"hẹn gặp lại các bạn trong (những )?video",
    r"la la school",
    r"thanks for watching",
    r"amara\.org",
]
HALLU_RE = re.compile("|".join(HALLUCINATIONS), re.IGNORECASE)


def looks_invented(text: str) -> bool:
    if HALLU_RE.search(text):
        return True
    words = text.split()
    # the same short phrase looping ("ừ ừ ừ ừ ừ ...") — a decoding loop, not speech
    return len(words) >= 8 and len(set(w.lower() for w in words)) <= 2


PAUSE_SEC = 1.2


def split_on_pauses(seg) -> list[tuple[float, float, str]]:
    """A Whisper segment can run across a long silence (the VAD glues speech together): cut it
    where the words stop for a while, so every line keeps its own time on the video."""
    words = list(seg.words or [])
    if not words:
        return [(seg.start, seg.end, seg.text.strip())]
    out, cur = [], [words[0]]
    for w in words[1:]:
        if w.start - cur[-1].end >= PAUSE_SEC:
            out.append(cur)
            cur = []
        cur.append(w)
    out.append(cur)
    return [(ws[0].start, ws[-1].end, "".join(w.word for w in ws).strip()) for ws in out]


def load_names(folder: str) -> list[dict]:
    """ten-rieng.json (written by the server when the recording stopped): [{title, items:[{name, note?}]}]."""
    try:
        with open(os.path.join(folder, "ten-rieng.json"), encoding="utf-8") as f:
            return [g for g in json.load(f).get("groups", []) if g.get("items")]
    except (OSError, ValueError):
        return []


HOTWORD_CHARS = 300  # Whisper's prompt is short (~220 tokens) and shared with the context prompt


def hotword_text(groups: list[dict]) -> str:
    """The names to steer Whisper toward: the players' characters first, then the rest in order."""
    ordered = sorted(groups, key=lambda g: 0 if g["title"].lower().startswith("nhân vật người chơi") else 1)
    out, size = [], 0
    for g in ordered:
        for e in g["items"]:
            n = e["name"].strip()
            if n and size + len(n) + 2 <= HOTWORD_CHARS:
                out.append(n)
                size += len(n) + 2
    return ", ".join(out)


def load_jobs(folder: str) -> tuple[list[dict], str | None]:
    """[{file, speaker, offset, scale}] — offset/scale map file seconds onto video seconds."""
    mf = os.path.join(folder, "tracks", "tracks.json")
    if os.path.exists(mf):
        with open(mf, encoding="utf-8") as f:
            m = json.load(f)
        jobs = []
        for t in m.get("tracks", []):
            path = os.path.join(folder, "tracks", t["file"])
            if os.path.exists(path) and t.get("bytes", 1) > 0:
                jobs.append({
                    "file": path,
                    "speaker": t.get("label") or "?",
                    "offset": (t["startMs"] - m["since"]) / 1000,
                    "wall": (t["endMs"] - t["startMs"]) / 1000 if t.get("endMs") else 0,
                })
        if jobs:
            return jobs, None
    videos = [n for n in os.listdir(folder) if re.search(r"\.(webm|mp4|mkv)$", n, re.I) and not n.startswith("buoi-choi-ban-dung")]
    if videos:
        return [{"file": os.path.join(folder, sorted(videos)[0]), "speaker": "", "offset": 0.0, "wall": 0}], None
    return [], "Thư mục này không có track tiếng hay video"


def main() -> int:
    for s in (sys.stdout, sys.stderr):
        try:
            s.reconfigure(encoding="utf-8")
        except Exception:
            pass
    ap = argparse.ArgumentParser()
    ap.add_argument("folder")
    ap.add_argument("--model", default=os.environ.get("WHISPER_MODEL", "large-v3-turbo"))
    ap.add_argument("--lang", default=os.environ.get("WHISPER_LANG", "vi"))
    ap.add_argument("--device", default=os.environ.get("WHISPER_DEVICE", "auto"))
    a = ap.parse_args()

    folder = os.path.abspath(a.folder)
    if not os.path.isdir(folder):
        print(f"Không thấy thư mục: {folder}", file=sys.stderr)
        return 2
    jobs, err = load_jobs(folder)
    if err:
        print(err, file=sys.stderr)
        return 2

    # Windows: CUDA libraries installed from PyPI (nvidia-cublas-cu12, nvidia-cudnn-cu12) ship their
    # DLLs inside site-packages; make them findable for CTranslate2.
    try:
        import nvidia  # type: ignore

        for base in nvidia.__path__:
            for sub in ("cublas", "cudnn", "cuda_nvrtc"):
                d = os.path.join(base, sub, "bin")
                if os.path.isdir(d):
                    os.environ["PATH"] = d + os.pathsep + os.environ.get("PATH", "")
                    if hasattr(os, "add_dll_directory"):
                        os.add_dll_directory(d)
    except ImportError:
        pass

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print("Chưa cài faster-whisper (pip install faster-whisper)", file=sys.stderr)
        return 3

    t0 = time.time()
    compute = "int8_float16"
    try:
        model = WhisperModel(a.model, device=a.device, compute_type=compute if a.device != "cpu" else "int8")
    except Exception as e:  # no CUDA libraries: fall back to the CPU (slow but works)
        print(f"GPU không dùng được ({e}); chạy bằng CPU", file=sys.stderr)
        model = WhisperModel(a.model, device="cpu", compute_type="int8")

    names = [j["speaker"] for j in jobs if j["speaker"]]
    prompt = "Buổi chơi Dungeons & Dragons: xúc xắc d20, đổ xúc xắc, máu, giáp, phép, lượt." + (f" Người nói: {', '.join(names)}." if names else "")
    groups = load_names(folder)
    hotwords = hotword_text(groups)

    lines: list[dict] = []
    for j in jobs:
        segs, info = model.transcribe(
            j["file"],
            language=a.lang or None,
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 500},
            condition_on_previous_text=False,
            initial_prompt=prompt,
            beam_size=5,
            word_timestamps=True,
            hotwords=hotwords or None,
        )
        # browser audio clocks drift a hair against the server clock: stretch onto the wall time
        scale = 1.0
        if j["wall"] > 30 and info.duration > 30:
            r = j["wall"] / info.duration
            if 0.98 < r < 1.02:
                scale = r
        n = 0
        for s in segs:
            if s.no_speech_prob > 0.8:
                continue
            for start, end, text in split_on_pauses(s):
                if not text or looks_invented(text):
                    continue
                lines.append({
                    "start": round(j["offset"] + start * scale, 2),
                    "end": round(j["offset"] + end * scale, 2),
                    "speaker": j["speaker"],
                    "text": text,
                })
                n += 1
        print(f"{j['speaker'] or 'video'}: {n} câu ({info.duration / 60:.0f} phút tiếng)", flush=True)

    lines = [l for l in lines if l["end"] > 0]
    lines.sort(key=lambda l: (l["start"], l["speaker"]))

    def who(l: dict) -> str:
        return f"{l['speaker']}: " if l["speaker"] else ""

    md = [
        "# Lời thoại buổi chơi",
        "",
        "Chép tự động bằng Whisper từ mic riêng của từng người; giờ tính từ đầu video (cùng mốc với nhat-ky.txt).",
        "Có thể sai tên riêng / thuật ngữ; câu trùng giờ là hai người nói chồng lên nhau.",
        "",
    ]
    if groups:
        md += [
            "## Bảng tên riêng",
            "",
            "Tên đúng của nhân vật, địa danh, NPC trong buổi này. Máy hay chép sai tên riêng: một từ trong lời thoại",
            "nghe gần giống tên dưới đây (ví dụ \"Mỹ ra\" ↔ \"Mira\") thì đó là tên này bị chép sai — dùng đúng chính tả ở bảng.",
            "",
        ]
        for g in groups:
            md.append(f"**{g['title']}**")
            md += [f"- {e['name']}" + (f" — {e['note']}" if e.get("note") else "") for e in g["items"]]
            md.append("")
        md += ["## Lời thoại", ""]
    md += [f"[{fmt_clock(l['start'])}] {who(l)}{l['text']}" for l in lines]
    with open(os.path.join(folder, "loi-thoai.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(md) + "\n")
    srt = []
    for i, l in enumerate(lines, 1):
        srt += [str(i), f"{fmt_srt(l['start'])} --> {fmt_srt(max(l['end'], l['start'] + 0.5))}", f"{who(l)}{l['text']}", ""]
    with open(os.path.join(folder, "loi-thoai.srt"), "w", encoding="utf-8") as f:
        f.write("\n".join(srt))
    with open(os.path.join(folder, "loi-thoai.json"), "w", encoding="utf-8") as f:
        json.dump(lines, f, ensure_ascii=False, indent=1)

    print(f"XONG {len(lines)} câu sau {(time.time() - t0) / 60:.1f} phút", flush=True)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        print(f"Lỗi: {e}", file=sys.stderr)
        sys.exit(1)
