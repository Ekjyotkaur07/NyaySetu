import whisper
import torch

# Load model once at startup
model = whisper.load_model("base")

def transcribe_audio(audio_path: str) -> str:
    """
    Transcribe audio file using Whisper
    """
    try:
        # Transcribe with timestamp support
        result = model.transcribe(
            audio_path,
            task="transcribe",
            language="en",  # Auto-detect if needed
            fp16=torch.cuda.is_available(),
            word_timestamps=True
        )
        
        return result["text"]
    
    except Exception as e:
        raise Exception(f"Transcription failed: {str(e)}")

def transcribe_with_timestamps(audio_path: str) -> dict:
    """
    Get transcription with word-level timestamps
    """
    result = model.transcribe(
        audio_path,
        word_timestamps=True
    )
    
    segments = []
    for segment in result["segments"]:
        segments.append({
            "start": segment["start"],
            "end": segment["end"],
            "text": segment["text"],
            "words": [
                {"word": w["word"], "start": w["start"], "end": w["end"]}
                for w in segment.get("words", [])
            ]
        })
    
    return {
        "full_text": result["text"],
        "segments": segments
    }