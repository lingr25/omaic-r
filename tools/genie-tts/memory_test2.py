import os, time, psutil
proc = psutil.Process()
def mem(tag):
    m = proc.memory_info()
    print(f"{tag:40s} RSS={m.rss/1048576:6.0f} MB  Commit={m.vms/1048576:6.0f} MB")

os.environ.setdefault("GENIE_DATA_DIR", r"tools\genie-tts\GenieData")
mem("baseline")
import genie_tts as genie
mem("after import")
MODEL_DIR = r"tools\genie-tts\models\base_v2proplus_onnx"
t=time.time(); genie.load_character(character_name="amia", onnx_model_dir=MODEL_DIR, language="zh")
mem(f"load x1 ({time.time()-t:.0f}s)")
genie.set_reference_audio(character_name="amia", audio_path=r"阿米娅01.wav",
    audio_text="凯尔希医生教导过我，工作的时候一定要保持全神贯注。嗯，全神贯注。")
t=time.time(); genie.tts(character_name="amia", text="博士，今天的公招池子已经刷新了。", play=False, save_path=r"tools\genie-tts\output\mem2_amia.wav")
mem(f"after tts #1 ({time.time()-t:.0f}s)")
for name in ["rosmontis","angelina","muelsyse"]:
    t=time.time(); genie.load_character(character_name=name, onnx_model_dir=MODEL_DIR, language="zh")
    mem(f"load x{['rosmontis','angelina','muelsyse'].index(name)+2} ({time.time()-t:.0f}s)")
genie.set_reference_audio(character_name="rosmontis", audio_path=r"迷迭香.wav",
    audio_text="该出任务了吗？嗯，我知道的，我会保护好罗德岛的干员们的，一定。")
genie.set_reference_audio(character_name="angelina", audio_path=r"安洁莉娜.wav",
    audio_text="博士，今天没有急件要送，我来帮你整理一下文件吧。放心放心，这么久了，这些文件的分类我早就一清二楚了。")
genie.set_reference_audio(character_name="muelsyse", audio_path=r"缪尔赛斯01_trimmed.wav",
    audio_text="你是说把工作时间和行程的决定权交给我吗？那就意味着我在备忘录上写什么？")
for name in ["rosmontis","angelina","muelsyse"]:
    t=time.time()
    genie.tts(character_name=name, text="这是一条测试语音。", play=False, save_path=rf"tools\genie-tts\output\mem2_{name}.wav")
    mem(f"tts as {name} ({time.time()-t:.0f}s)")
print("DONE")
