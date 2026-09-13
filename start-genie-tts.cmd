@echo off
REM Genie-TTS local server (GPT-SoVITS V2ProPlus ONNX, CPU inference)
REM Port 8001. MAIC's genie-tts provider talks to this via TTS_GENIE_BASE_URL.
REM Reference audio registry: tools\genie-tts\voices.json
cd /d "%~dp0"
set GENIE_DATA_DIR=%~dp0tools\genie-tts\GenieData
set HF_ENDPOINT=https://hf-mirror.com
"%~dp0tools\genie-tts\venv\Scripts\python.exe" -c "import genie_tts as genie; genie.start_server(host='127.0.0.1', port=8001)"
