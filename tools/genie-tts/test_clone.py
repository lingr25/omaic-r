"""Zero-shot voice cloning test with genie-tts (GPT-SoVITS V2ProPlus base model)."""
import os
import sys
import time

os.environ.setdefault("GENIE_DATA_DIR", r"tools\genie-tts\GenieData")
os.environ.setdefault("HF_ENDPOINT", "https://hf-mirror.com")

import genie_tts as genie  # noqa: E402

MODEL_DIR = r"tools\genie-tts\models\base_v2proplus_onnx"
REF_AUDIO = os.environ.get("REF_AUDIO", r"缪尔赛斯01.wav")
REF_TEXT = os.environ.get(
    "REF_TEXT",
    "你是说把工作时间和行程的决定权交给我吗？那就意味着我在备忘录上写什么，你就得做什么喽。博士，哎呀，现在反悔已经来不及啦。",
)
OUT_DIR = r"tools\genie-tts\output"

TEST_TEXTS = [
    "你好，我是缪尔赛斯。今天的天气真不错，要不要一起出去走走？",
    "先遣小队整装待发，随时可以开始行动。",
]

os.makedirs(OUT_DIR, exist_ok=True)

t0 = time.time()
genie.load_character(
    character_name="muelsyse",
    onnx_model_dir=MODEL_DIR,
    language="zh",
)
print(f"[load_character] {time.time() - t0:.1f}s")

genie.set_reference_audio(
    character_name="muelsyse",
    audio_path=REF_AUDIO,
    audio_text=REF_TEXT,
)
print("[set_reference_audio] ok")

for i, text in enumerate(TEST_TEXTS, 1):
    t = time.time()
    save_path = os.path.join(OUT_DIR, f"clone_test{i}.wav")
    genie.tts(character_name="muelsyse", text=text, play=False, save_path=save_path)
    print(f"[tts {i}] {time.time() - t:.1f}s -> {save_path}")

print("ALL DONE")
