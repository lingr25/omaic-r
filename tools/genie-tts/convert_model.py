import os
os.environ.setdefault("GENIE_DATA_DIR", r"tools\genie-tts\GenieData")
os.environ.setdefault("HF_ENDPOINT", "https://hf-mirror.com")
import genie_tts as genie
genie.convert_to_onnx(
    torch_ckpt_path=r"tools\genie-tts\models\gpt_v2.ckpt",
    torch_pth_path=r"tools\genie-tts\models\s2Gv2ProPlus.pth",
    output_dir=r"tools\genie-tts\models\base_v2proplus_onnx",
)
print("CONVERT DONE")
