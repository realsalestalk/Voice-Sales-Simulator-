# Generate a narration line in the Sam-matched voice: Kokoro style blend + pace + gentle pitch lift.
# Model: Kokoro-82M (Apache-2.0), taken from the npm package `expo-kokoro` (build/kokoro-quantized.onnx
# and build/voices/*.bin, combined into voices.bin as an npz). Set SAM_TTS_DIR to that folder.
# This is NOT a clone of Sam's voice: it is a blend of three stock voices chosen because it measured
# closest to Sam's approved recordings (MFCC timbre distance and pitch), with a +1 semitone lift.
import os, sys, subprocess, numpy as np, soundfile as sf
TTS_DIR = os.environ.get('SAM_TTS_DIR', '/tmp/tts')
MODEL = os.path.join(TTS_DIR, 'package/build/kokoro-quantized.onnx')
VOICES = os.path.join(TTS_DIR, 'voices.bin')
from kokoro_onnx import Kokoro
_k = None
V = None
BLEND = {'am_puck': 1.0, 'am_fenrir': 1.0, 'am_adam': 1.0}
SPEED = 0.9
PITCH = 2 ** (1.0 / 12)
def style():
    global V
    if V is None: V = np.load(VOICES)
    return (sum(w * V[n] for n, w in BLEND.items()) / sum(BLEND.values())).astype(np.float32)
def say(text, out_mp3):
    global _k
    if _k is None: _k = Kokoro(MODEL, VOICES)
    s, sr = _k.create(text, voice=style(), speed=SPEED, lang='en-us')
    tmp = out_mp3 + '.raw.wav'; sf.write(tmp, s, sr)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', tmp, '-af',
        f'rubberband=pitch={PITCH:.5f}:formant=preserved,loudnorm=I=-16:TP=-1.5,apad=pad_dur=0.12',
        '-ac', '1', '-ar', '44100', '-b:a', '64k', out_mp3], check=True)
    import os; os.remove(tmp)
if __name__ == '__main__':
    say(sys.argv[1], sys.argv[2])
