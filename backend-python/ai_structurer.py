import openai
import os
from typing import Dict, List
import json

# Initialize OpenAI (or use local LLM)
openai.api_key = os.getenv("OPENAI_API_KEY")

def structure_testimony(text: str) -> Dict:
    """
    Structure raw testimony into court-ready format
    """
    
    prompt = f"""You are a trauma-informed legal assistant. Convert the following testimony into a structured, court-ready format.

RULES:
1. DO NOT add or infer facts not explicitly stated
2. Preserve the user's original language and emotional context
3. If information is missing, mark as [NOT STATED]
4. Maintain chronological order where possible
5. Flag any inconsistencies gently without judgment

TESTIMONY:
{text}

OUTPUT JSON FORMAT:
{{
    "timeline": [
        {{
            "timestamp": "time or sequence number",
            "event": "description of event",
            "location": "where it happened or [NOT STATED]",
            "people": ["person1", "person2"],
            "emotions": ["emotion1", "emotion2"]
        }}
    ],
    "keyFacts": ["fact1", "fact2", "fact3"],
    "summary": "concise summary (2-3 sentences)",
    "entities": {{
        "persons": ["list", "of", "people", "mentioned"],
        "locations": ["list", "of", "locations"],
        "dates": ["list", "of", "dates", "or", "time", "references"]
    }},
    "inconsistencies": ["any unclear or conflicting information"],
    "emotionalIndicators": ["fear", "anxiety", "sadness", "etc"],
    "missingInfo": ["what information would strengthen this testimony"]
}}

Now process the testimony above:"""

    try:
        response = openai.ChatCompletion.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": "You are a trauma-informed legal assistant specializing in testimony structuring."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,
            max_tokens=1500
        )
        
        structured = json.loads(response.choices[0].message.content)
        return structured
        
    except Exception as e:
        # Fallback basic structuring if OpenAI fails
        return fallback_structure(text)

def fallback_structure(text: str) -> Dict:
    """
    Basic fallback structuring without AI
    """
    sentences = text.split('.')
    
    return {
        "timeline": [
            {
                "timestamp": f"Event {i+1}",
                "event": sentence.strip(),
                "location": "[NOT STATED]",
                "people": [],
                "emotions": []
            }
            for i, sentence in enumerate(sentences[:5]) if sentence.strip()
        ],
        "keyFacts": [s.strip() for s in sentences[:3] if s.strip()],
        "summary": text[:200] + "...",
        "entities": {
            "persons": [],
            "locations": [],
            "dates": []
        },
        "inconsistencies": [],
        "emotionalIndicators": [],
        "missingInfo": ["More specific dates would strengthen this testimony"]
    }

def enhance_testimony_quality(original: str, structured: Dict) -> Dict:
    """
    Add quality assessment and recommendations
    """
    prompt = f"""Analyze this testimony for legal completeness:

ORIGINAL: {original[:500]}

STRUCTURED: {json.dumps(structured)[:500]}

Provide:
1. Quality score (0-100)
2. Missing critical elements
3. Recommendations for strengthening

Return as JSON: {{"score": int, "missing": [], "recommendations": []}}"""

    try:
        response = openai.ChatCompletion.create(
            model="gpt-3.5-turbo",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2
        )
        
        quality = json.loads(response.choices[0].message.content)
        structured["qualityAssessment"] = quality
        return structured
        
    except:
        structured["qualityAssessment"] = {
            "score": 50,
            "missing": ["Legal context", "Specific dates"],
            "recommendations": ["Provide more specific timeline details"]
        }
        return structured