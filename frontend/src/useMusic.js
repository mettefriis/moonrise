import { useEffect, useRef } from "react";
import * as Tone from "tone";

// Salamander Grand Piano samples (Tone.js CDN, CC-BY 3.0)
const PIANO_SAMPLES = {
  A0:"A0.mp3", C1:"C1.mp3", "D#1":"Ds1.mp3", "F#1":"Fs1.mp3",
  A1:"A1.mp3", C2:"C2.mp3", "D#2":"Ds2.mp3", "F#2":"Fs2.mp3",
  A2:"A2.mp3", C3:"C3.mp3", "D#3":"Ds3.mp3", "F#3":"Fs3.mp3",
  A3:"A3.mp3", C4:"C4.mp3", "D#4":"Ds4.mp3", "F#4":"Fs4.mp3",
  A4:"A4.mp3", C5:"C5.mp3",
};

async function buildScene() {
  await Tone.start();

  // ── Effects ──────────────────────────────────────────────────────────────────
  const masterVol = new Tone.Volume(-3).toDestination();

  const reverb = new Tone.Reverb({ decay: 5, preDelay: 0.02, wet: 0.5 });
  await reverb.generate();
  reverb.connect(masterVol);

  const shortReverb = new Tone.Reverb({ decay: 1.8, wet: 0.35 });
  await shortReverb.generate();
  shortReverb.connect(masterVol);

  // ── Instruments ───────────────────────────────────────────────────────────────

  // Real grand piano (Salamander samples)
  const piano = new Tone.Sampler({
    urls: PIANO_SAMPLES,
    baseUrl: "https://tonejs.github.io/audio/salamander/",
  });
  piano.connect(reverb);
  piano.connect(masterVol);

  // Timpani — MembraneSynth (subtle, just accents the downbeat)
  const timpani = new Tone.MembraneSynth({
    pitchDecay: 0.06,
    octaves: 5,
    envelope: { attack: 0.001, decay: 0.9, sustain: 0, release: 0.5 },
    volume: -10,
  });
  timpani.connect(reverb);

  // ── Wait for samples ──────────────────────────────────────────────────────────
  await Tone.loaded();

  // ── Sequencer: 4-bar loop, 76 BPM, D minor ───────────────────────────────────
  //
  //  Bars 1–2: Dm   (D, F, A)
  //  Bars 3–4: Am   (A, C, E)
  //
  //  Piano carries bass + chord hits
  //  Strings hold the pad
  //  Timpani hits bar downbeats
  //  Cymbal swells on bar 3

  Tone.getTransport().bpm.value = 76;

  const loop = new Tone.Loop((time) => {
    const q = Tone.Time("4n").toSeconds();

    // ══ Bars 1–2: D minor ══

    // Downbeat: bass octave + chord crash
    piano.triggerAttackRelease(["D1","D2","D3","F3","A3"], "2n", time, 0.9);
    timpani.triggerAttackRelease("D2", "8n", time);

    // Beat 2 fill
    piano.triggerAttackRelease("F3", "8n", time + q * 1.5, 0.45);
    piano.triggerAttackRelease("A3", "8n", time + q * 1.75, 0.4);

    // Beat 3 bass pulse
    piano.triggerAttackRelease("A2", "4n", time + q * 2, 0.65);
    piano.triggerAttackRelease(["D3","F3"], "8n", time + q * 2.5, 0.5);

    // Beat 4 tension
    piano.triggerAttackRelease(["F3","A3","D4"], "4n", time + q * 3, 0.55);

    // Bar 2: melodic answer
    piano.triggerAttackRelease("D4", "4n", time + q * 4, 0.6);
    piano.triggerAttackRelease("C4", "8n", time + q * 5, 0.45);
    piano.triggerAttackRelease("A3", "4n", time + q * 5.5, 0.5);
    piano.triggerAttackRelease("D3", "4n", time + q * 7, 0.55);

    // ══ Bars 3–4: A minor ══


    // Downbeat: Am crash
    piano.triggerAttackRelease(["A1","A2","A3","C4","E4"], "2n", time + q * 8, 0.9);
    timpani.triggerAttackRelease("A2", "8n", time + q * 8);

    // Beat 2 fill
    piano.triggerAttackRelease("C4", "8n", time + q * 9.5, 0.4);
    piano.triggerAttackRelease("E4", "8n", time + q * 9.75, 0.35);

    // Beat 3 bass pulse
    piano.triggerAttackRelease("E2", "4n", time + q * 10, 0.6);
    piano.triggerAttackRelease(["A3","C4"], "8n", time + q * 10.5, 0.45);

    // Beat 4: tension (rising toward Dm)
    piano.triggerAttackRelease(["G3","B3","D4"], "4n", time + q * 11, 0.5);

    // Bar 4: resolution back toward Dm
    piano.triggerAttackRelease("F4", "8n", time + q * 12, 0.55);
    piano.triggerAttackRelease("E4", "8n", time + q * 12.5, 0.5);
    piano.triggerAttackRelease("D4", "4n", time + q * 13, 0.6);
    piano.triggerAttackRelease("A2", "4n", time + q * 14, 0.55);
    piano.triggerAttackRelease("D3", "4n", time + q * 15, 0.65);


  }, "4m");

  loop.start(0);
  Tone.getTransport().loop = true;
  Tone.getTransport().loopEnd = "4m";
  Tone.getTransport().start();

  return { piano, timpani, reverb, shortReverb, masterVol, loop };
}

let scene = null;

export function useMusic(shouldPlay) {
  const startedRef = useRef(false);

  useEffect(() => {
    if (!shouldPlay || startedRef.current) return;
    startedRef.current = true;

    buildScene()
      .then(s => { scene = s; })
      .catch(console.error);

    return () => {
      if (scene) {
        Tone.getTransport().stop();
        Object.values(scene).forEach(n => { try { n.dispose(); } catch {} });
        scene = null;
        startedRef.current = false;
      }
    };
  }, [shouldPlay]);
}
