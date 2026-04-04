from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import base64
import tempfile
import os
from whisper_handler import transcribe_audio
from ai_structurer import structure_testimony

app = FastAPI(title="TestiForge AI Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5000", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class TranscribeRequest(BaseModel):
    audioBuffer: str

class StructureRequest(BaseModel):
    text: str

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

@app.post("/transcribe")
async def transcribe(request: TranscribeRequest):
    try:
        # Decode base64 audio
        audio_data = base64.b64decode(request.audioBuffer)
        
        # Save to temp file
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp_file:
            tmp_file.write(audio_data)
            tmp_path = tmp_file.name
        
        # Transcribe
        transcription = transcribe_audio(tmp_path)
        
        # Clean up
        os.unlink(tmp_path)
        
        return {"transcription": transcription}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/structure")
async def structure(request: StructureRequest):
    try:
        structured_data = structure_testimony(request.text)
        return structured_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/process-full")
async def process_full(audio: UploadFile = File(...)):
    try:
        # Save uploaded audio
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp_file:
            content = await audio.read()
            tmp_file.write(content)
            tmp_path = tmp_file.name
        
        # Transcribe
        transcription = transcribe_audio(tmp_path)
        
        # Structure
        structured_data = structure_testimony(transcription)
        
        # Clean up
        os.unlink(tmp_path)
        
        return {
            "transcription": transcription,
            "structured_data": structured_data
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)