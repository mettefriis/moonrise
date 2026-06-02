import os, random, httpx, logging
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

load_dotenv()

SIGNAL_TEMPLATES = {
    "Hesitation": [
        "{name} paused before answering — as if choosing between two truths.",
        "The oracle noticed {name} hesitate. Something was weighed before it was said.",
        "{name}'s words came slowly. What was held back may matter more than what was spoken.",
    ],
    "Stress": [
        "{name} is under pressure. Whether from guilt or from being falsely accused, the oracle cannot say.",
        "The oracle reads tension in {name}. Something is weighing on them.",
        "{name} carries stress that goes beyond this moment. The source is unclear.",
    ],
    "Confidence": [
        "{name} spoke with unusual certainty. Confidence this steady is either honesty — or a very practised lie.",
        "The oracle sees boldness in {name}. Those with nothing to hide rarely need to project this much calm.",
        "{name} showed no fear. That is either a good sign or a very bad one.",
    ],
    "Agreement": [
        "{name} agreed readily with others. The oracle warns: agreement can be camouflage.",
        "The oracle noticed {name} nodding along. Those who never push back are sometimes hiding why.",
        "{name} aligned with the group. Whether from conviction or strategy, only the village can judge.",
    ],
    "Skepticism": [
        "{name} questioned everything. Healthy suspicion — or a deliberate distraction from themselves?",
        "The oracle saw {name} casting doubt. The loudest voice of suspicion sometimes belongs to the guilty.",
        "{name} was hard to convince. This could mean sharp instincts, or a reason to muddy the waters.",
    ],
    "Frustration": [
        "{name} showed frustration. The oracle has seen this in both the wrongly accused and the cornered wolf.",
        "Something angered {name}. Whether it is injustice or fear of exposure, watch them closely.",
        "The oracle reads agitation in {name}. Frustration this visible often means something is at stake.",
    ],
    "Interest": [
        "{name} was watching carefully. The attentive eye belongs to the curious — and to the calculating.",
        "The oracle noticed {name} observing more than speaking. Those who study the room are planning something.",
        "{name} paid close attention. Whether to understand or to hunt, the oracle cannot determine.",
    ],
    "Confusion": [
        "{name} appeared confused — but the oracle has seen confusion performed as often as it is felt.",
        "The oracle reads uncertainty in {name}'s expression. Genuine disorientation, or a convincing act?",
        "{name} seemed lost. The wolf sometimes wears the face of the bewildered sheep.",
    ],
    "Uncertainty": [
        "{name} was unsure — which may mean innocence, or may mean they have not yet decided what to do next.",
        "The oracle sees wavering in {name}. Uncertainty is the most honest of signals, and the easiest to fake.",
        "{name} did not seem certain of their own position. Keep watching.",
    ],
    "Engagement": [
        "{name} was fully present — tracking everything, reacting to everything. That level of attention is rarely accidental.",
        "The oracle noticed {name} engaged with unusual intensity. The deeply invested have the most to gain or lose.",
        "{name} was not passive. The engaged mind is always running a calculation.",
    ],
}

CLOSINGS = [
    "The oracle has spoken.",
    "Interpret this as you will.",
    "The spirits offer no verdict — only what they saw.",
    "What you do with this knowledge is yours alone.",
    "The oracle does not accuse. It only illuminates.",
    "Trust your instincts. The oracle trusts them too.",
]


def generate_hint(signals: list[dict], subject_name: str = "This person") -> str:
    top = sorted(signals, key=lambda x: x.get("probability", 0), reverse=True)[:2]
    parts = []
    for signal in top:
        options = SIGNAL_TEMPLATES.get(signal["type"], ["{name} showed something the oracle could not name."])
        template = random.choice(options)
        parts.append(template.format(name=subject_name))
    closing = random.choice(CLOSINGS)
    return " ".join(parts) + " " + closing


def mock_signals() -> list[dict]:
    signal_types = list(SIGNAL_TEMPLATES.keys())
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


async def analyze_video(video_bytes: bytes, filename: str, subject_name: str = "This person") -> dict:
    api_key = os.environ.get("INTERHUMAN_API_KEY", "")

    if not api_key or api_key == "your_key_here":
        await _fake_delay()
        signals = mock_signals()
        return {"signals": signals, "hint": generate_hint(signals, subject_name), "mocked": True}

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                "https://api.interhuman.ai/v1/analyze",
                headers={"Authorization": f"Bearer {api_key}"},
                files={"video": (filename, video_bytes, "video/webm")},
            )
            resp.raise_for_status()
            data = resp.json()
            signals = data.get("signals", [])
            return {"signals": signals, "hint": generate_hint(signals, subject_name), "mocked": False}
    except Exception as e:
        logger.error("Interhuman API error: %s", e, exc_info=True)
        signals = mock_signals()
        return {"signals": signals, "hint": generate_hint(signals, subject_name), "mocked": True}


async def _fake_delay():
    import asyncio
    await asyncio.sleep(random.uniform(1.5, 3.0))
