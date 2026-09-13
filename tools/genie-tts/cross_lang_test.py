import os
os.environ.setdefault("GENIE_DATA_DIR", r"tools\genie-tts\GenieData")
os.environ.setdefault("HF_ENDPOINT", "https://hf-mirror.com")
import time
import genie_tts as genie

MODEL_DIR = r"tools\genie-tts\models\base_v2proplus_onnx"
OUT = r"tools\genie-tts\output"

# A: Japanese reference -> Chinese output
genie.load_character(character_name="base_zh", onnx_model_dir=MODEL_DIR, language="zh")
genie.set_reference_audio(
    character_name="base_zh",
    audio_path=r"tools\genie-tts\refs\mika_fear.wav",
    audio_text="なに？怖いよ",
    language="jp",
)
t = time.time()
genie.tts(character_name="base_zh", text="你好，我是缪尔赛斯。今天的天气真不错，要不要一起出去走走？",
          play=False, save_path=os.path.join(OUT, "cross_jp2zh.wav"))
print(f"[jp->zh] {time.time()-t:.1f}s")
genie.clear_reference_audio("base_zh")

# B: Chinese reference -> Japanese output
genie.load_character(character_name="base_jp", onnx_model_dir=MODEL_DIR, language="jp")
genie.set_reference_audio(
    character_name="base_jp",
    audio_path=r"缪尔赛斯01_trimmed.wav",
    audio_text="你是说把工作时间和行程的决定权交给我吗？那就意味着我在备忘录上写什么？",
    language="zh",
)
t = time.time()
genie.tts(character_name="base_jp", text="こんにちは。今日はいい天気ですね。一緒に散歩しませんか？",
          play=False, save_path=os.path.join(OUT, "cross_zh2jp.wav"))
print(f"[zh->jp] {time.time()-t:.1f}s")
print("ALL DONE")
