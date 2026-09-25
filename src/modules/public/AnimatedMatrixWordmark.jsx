// ─── ANIMATED "MATRIX OVERSEAS" WORDMARK (kiosk idle screen) ─────────────────
// The company name set like a logo: MATRIX large and heavy, OVERSEAS beneath
// it in wide-tracked capitals, flanked by two hairlines. Companion to
// AnimatedMatrixLogo (the MC monogram) — the kiosk alternates between them.
//
// Sequence (pure CSS, cheap enough for a TV stick):
//   0.0–1.6s  MATRIX letters resolve one by one (slide up + blur → sharp)
//   0.9–2.3s  OVERSEAS letters follow
//   1.7–2.9s  the hairlines draw outward from OVERSEAS
//   3.2s →    a slanted light sheen sweeps across the text, repeating; a soft
//             glow breathes behind; the whole block floats gently
// Mounted fresh each time the idle screen appears, so it plays from the start.
//
// Three stacked copies of the same markup keep every effect simple: the BASE
// (letters animate in), a blurred GLOW, and a SHEEN copy whose text is a moving
// gradient clipped to the letters. Only the base has per-letter transforms —
// background-clip:text doesn't survive transformed children — so the sheen and
// glow copies stay static and identical in layout.

const TOP = 'MATRIX';
const BOTTOM = 'OVERSEAS';
const INK = '#8b8f83'; // same gray as the MC logo

const CSS = `
.wls-wm-stage {
    position: relative;
    display: flex; align-items: center; justify-content: center;
    width: 100%; height: 100%;
}
.wls-wm-aura {
    position: absolute; left: 50%; top: 50%;
    width: 90vmin; height: 90vmin; margin: -45vmin 0 0 -45vmin;
    background: radial-gradient(closest-side, rgba(150,158,140,0.18), rgba(150,158,140,0.05) 55%, transparent 100%);
    opacity: 0;
    animation: wls-wm-aura-in 1.6s ease-out 0.3s forwards, wls-wm-aura-breathe 5s ease-in-out 2s infinite;
}
.wls-wm-float {
    animation: wls-wm-float 6s ease-in-out 2.4s infinite;
}
.wls-wm-layers {
    position: relative;
    display: flex; justify-content: center;
    font-family: "Helvetica Neue", Helvetica, Arial, system-ui, sans-serif;
    font-size: min(11vw, 20vh);
    line-height: 1;
    color: ${INK};
}
.wls-wm-layer { display: flex; justify-content: center; }
.wls-wm-glow, .wls-wm-sheen { position: absolute; inset: 0; pointer-events: none; }

.wls-wm-block { display: flex; flex-direction: column; align-items: center; }
.wls-wm-top {
    font-weight: 800; letter-spacing: 0.14em; margin-right: -0.14em; white-space: nowrap;
}
.wls-wm-bottom {
    align-self: stretch;
    display: flex; align-items: center; gap: 0.9em;
    margin-top: 0.14em;
    font-size: 0.26em;
}
.wls-wm-sub {
    font-weight: 600; letter-spacing: 0.55em; margin-right: -0.55em; white-space: nowrap;
}
.wls-wm-rule {
    flex: 1; height: max(2px, 0.3vh);
    transform: scaleX(0);
    animation: wls-wm-rule 1.2s ease-out 1.7s forwards;
}
.wls-wm-rule-l { background: linear-gradient(90deg, transparent, ${INK}); transform-origin: right center; }
.wls-wm-rule-r { background: linear-gradient(270deg, transparent, ${INK}); transform-origin: left center; }

.wls-wm-l { display: inline-block; }
.wls-wm-base .wls-wm-l {
    opacity: 0;
    animation: wls-wm-letter 0.9s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
}

/* glow copy: blurred, light, breathing — opacity-only animation */
.wls-wm-glow { color: #cfd6c2; filter: blur(0.06em); opacity: 0; animation: wls-wm-glow 3.2s ease-in-out 2s infinite; }
.wls-wm-glow .wls-wm-rule, .wls-wm-sheen .wls-wm-rule { visibility: hidden; }

/* sheen copy: transparent text with a moving highlight band clipped to the letters */
.wls-wm-sheen {
    color: transparent;
    background: linear-gradient(105deg, transparent 0%, transparent 44%, rgba(255,255,255,0.95) 50%, transparent 56%, transparent 100%);
    background-size: 300% 100%;
    background-position: 100% 0;
    -webkit-background-clip: text;
    background-clip: text;
    animation: wls-wm-sweep 4.2s ease-in-out 3.2s infinite;
}

@keyframes wls-wm-letter {
    from { opacity: 0; transform: translateY(0.3em) scale(1.12); filter: blur(10px); }
    to   { opacity: 1; transform: none; filter: blur(0); }
}
@keyframes wls-wm-rule  { to { transform: scaleX(1); } }
@keyframes wls-wm-float {
    0%, 100% { transform: translateY(0); }
    50%      { transform: translateY(-1.2vh); }
}
@keyframes wls-wm-glow  { 0%, 100% { opacity: 0.10; } 50% { opacity: 0.55; } }
@keyframes wls-wm-sweep {
    0%        { background-position: 100% 0; }
    60%, 100% { background-position: 0% 0; }
}
@keyframes wls-wm-aura-in      { to { opacity: 1; } }
@keyframes wls-wm-aura-breathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.08); } }
`;

// One copy of the wordmark. `animated` staggers the letters in (base layer
// only); the overlay copies render the same text with no per-letter motion.
const Letters = ({ text, animated, startDelay, step }) =>
    [...text].map((ch, i) => (
        <span
            key={i}
            className="wls-wm-l"
            style={animated ? { animationDelay: `${(startDelay + i * step).toFixed(2)}s` } : undefined}
        >
            {ch}
        </span>
    ));

const Block = ({ animated }) => (
    <div className="wls-wm-block">
        <div className="wls-wm-top">
            <Letters text={TOP} animated={animated} startDelay={0.1} step={0.11} />
        </div>
        <div className="wls-wm-bottom">
            <span className="wls-wm-rule wls-wm-rule-l" />
            <span className="wls-wm-sub">
                <Letters text={BOTTOM} animated={animated} startDelay={0.9} step={0.09} />
            </span>
            <span className="wls-wm-rule wls-wm-rule-r" />
        </div>
    </div>
);

export default function AnimatedMatrixWordmark() {
    return (
        <div className="wls-wm-stage">
            <style>{CSS}</style>
            <div className="wls-wm-aura" />
            <div className="wls-wm-float">
                <div className="wls-wm-layers" role="img" aria-label="MATRIX OVERSEAS">
                    <div className="wls-wm-layer wls-wm-glow" aria-hidden="true"><Block animated={false} /></div>
                    <div className="wls-wm-layer wls-wm-base"><Block animated /></div>
                    <div className="wls-wm-layer wls-wm-sheen" aria-hidden="true"><Block animated={false} /></div>
                </div>
            </div>
        </div>
    );
}
