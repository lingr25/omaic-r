import os, time, psutil
proc = psutil.Process()
def rss(tag):
    print(f"{tag:38s} RSS = {proc.memory_info().rss/1048576:6.0f} MB")

os.environ.setdefault("GENIE_DATA_DIR", r"tools\genie-tts\GenieData")
rss("python baseline")
import genie_tts as genie
rss("after import genie_tts")

MODEL_DIR = r"tools\genie-tts\models\base_v2proplus_onnx"
REFS = {
    "rosmontis": (r"迷迭香.wav",  "该出任务了吗？嗯，我知道的，我会保护好罗德岛的干员们的，一定。"),
    "amia":      (r"阿米娅01.wav", "凯尔西医生教导过我，工作的时候一定要保持全神贯注。嗯，全神贯注。"),
    "angelina":  (r"安洁莉娜.wav", "博士，今天没有急件要送，我来帮你整理一下文件吧。放心放心，这么久了，这些文件的分类我早就一清二楚了。"),
}
TESTS = {
    "rosmontis": "哥哥说，迷迭香要把任务完成好。",
    "amia":      "博士，今天的公招池子已经刷新了，要看看吗？",
    "angelina":  "新的物资已经送到仓库了，我来帮忙搬吧。",
}

# ---- 场景A：单角色，轮流换参考音频（推荐架构） ----
t=time.time(); genie.load_character(character_name="speaker", onnx_model_dir=MODEL_DIR, language="zh")
rss(f"load_character x1 ({time.time()-t:.0f}s)")

for name in REFS:
    wav, text = REFS[name]
    genie.set_reference_audio(character_name="speaker", audio_path=wav, audio_text=text)
    out = rf"tools\genie-tts\output\mem_{name}.wav"
    genie.tts(character_name="speaker", text=TESTS[name], play=False, save_path=out)
    rss(f"场景A ref-swap -> {name} tts")

# ---- 场景B：每个说话人常驻一个角色名（同目录重复加载） ----
for i, name in enumerate(REFS):
    t=time.time(); genie.load_character(character_name=name, onnx_model_dir=MODEL_DIR, language="zh")
    rss(f"load_character x{i+2} ({time.time()-t:.0f}s)")
print("DONE")
