import os, random, httpx
from dotenv import load_dotenv

load_dotenv()

SIGNAL_HINTS = {
    "Hesitation": [
        "A pause where there should be none.",
        "Words that stumble before they reach the air.",
        "The truth and something else compete for the tongue.",
    ],
    "Stress": [
        "Something presses from beneath the surface.",
        "The body knows what the mouth will not say.",
        "Tension, even in stillness.",
    ],
    "Confidence": [
        "Certainty is not always earned.",
        "The boldest voices carry the most to hide.",
        "Fearlessness where others would tremble.",
    ],
    "Agreement": [
        "Agreement is the wolf's camouflage.",
        "They nod where others would push back.",
        "Harmony can be performed.",
    ],
    "Skepticism": [
        "The suspicious eye may see truly — or distract.",
        "Those who doubt most have often done the most.",
        "Skepticism is both shield and weapon.",
    ],
    "Frustration": [
        "Fire in the chest. From justice — or from fear of it?",
        "The wolf bares its teeth when cornered.",
        "What angers a guilty soul looks much like what angers an innocent one.",
    ],
    "Interest": [
        "They study the room. To understand it, or to hunt it?",
        "Attention is either curiosity or calculation.",
        "The hunter is always watching.",
    ],
    "Confusion": [
        "Fog surrounds this one — deliberate or genuine?",
        "Confusion is easy to fake and easy to feel.",
        "The lost sheep and the wolf wear the same expression.",
    ],
    "Uncertainty": [
        "Even they do not know what they will do next.",
        "Uncertainty protects those who perform it.",
        "The unclear spirit may be innocent — or masterful.",
    ],
    "Engagement": [
        "They are here, and very much watching.",
        "Present in body. Present in scheme.",
        "The engaged mind is always planning something.",
    ],
}

CLOSINGS = [
    "The oracle has spoken. Interpret wisely.",
    "What you do with this vision is yours alone.",
    "The spirits offer no verdict. Only shadow.",
    "Truth hides in plain sight. As always.",
    "The oracle's eye does not lie. But it does not explain.",
    "Beware the obvious. The wolf is rarely where you look first.",
    "No innocence is certain here. Not even your own.",
]


def generate_hint(signals: list[dict]) -> str:
    top = sorted(signals, key=lambda x: x.get("probability", 0), reverse=True)[:2]
    parts = []
    for signal in top:
        options = SIGNAL_HINTS.get(signal["type"], ["The oracle sees something beyond words."])
        parts.append(random.choice(options))
    return " ".join(parts) + " " + random.choice(CLOSINGS)


def mock_signals() -> list[dict]:
    signal_types = list(SIGNAL_HINTS.keys())
    n = random.randint(2, 4)
    chosen = random.sample(signal_types, n)
    return [
        {
            "type": t,
            "probability": round(random.uniform(0.55, 0.97), 2),
            "rationale": f"Observable behavioral cue detected in vocal pattern and facial alignment.",
        }
        for t in chosen
    ]


async def analyze_video(video_bytes: bytes, filename: str) -> dict:
    api_key = os.environ.get("INTERHUMAN_API_KEY", "")

    if not api_key or api_key == "your_key_here":
        await _fake_delay()
        signals = mock_signals()
        return {"signals": signals, "hint": generate_hint(signals), "mocked": True}

    try:
        # ⚠️  Verify exact endpoint + payload shape at docs.interhuman.ai
        # The API may be async (upload → poll or webhook). If so, adapt this to
        # POST upload, get job_id, then GET /jobs/{id} until complete.
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                "https://api.interhuman.ai/v1/analyze",
                headers={"Authorization": f"Bearer {api_key}"},
                files={"video": (filename, video_bytes, "video/webm")},
            )
            resp.raise_for_status()
            data = resp.json()
            signals = data.get("signals", [])
            return {"signals": signals, "hint": generate_hint(signals), "mocked": False}
    except Exception:
        signals = mock_signals()
        return {"signals": signals, "hint": generate_hint(signals), "mocked": True}


async def _fake_delay():
    import asyncio
    await asyncio.sleep(random.uniform(1.5, 3.0))
