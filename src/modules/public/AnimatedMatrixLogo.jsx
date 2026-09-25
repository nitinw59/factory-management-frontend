// ─── ANIMATED MATRIX LOGO (kiosk idle screen) ────────────────────────────────
// Vector re-trace of /matrix_logo.png (a 211×162 raster — it turns soft when
// scaled up to TV size, and can't be "drawn on" the way a path can). The two
// shapes below are that logo's two interlocking pieces, traced from its alpha
// channel and checked against the source (~96% overlap; long edges straightened).
//
// Sequence, all CSS/SVG so it costs nothing to run on a low-power TV stick:
//   0.0–2.1s  each shape's outline draws itself on (stroke-dashoffset)
//   1.4–2.6s  solid fill fades in behind the outline, outline fades away
//   2.8s →    a diagonal light sheen sweeps across, clipped to the logo shape,
//             repeating; a soft blurred glow breathes behind; the whole mark
//             floats gently
// Mounted fresh each time the idle screen appears (the page conditionally
// renders it), so the draw-on plays from the start every cycle.

const SHAPES = [
    'M16.3 131.6L28.4 131.6L28.4 39.3L86.8 69L142 33.8L196 33.8L196 50.6L208.2 50.6L208.2 21.5L138.2 21.5L85.3 55L22.8 21.3L16.3 19Z',
    'M37.8 66.4L37.8 79L85 104.3L89.8 102L133.4 74.5L133.4 133L209.6 133L209.6 97.4L198.6 97.4L198.6 121L145.4 121L145.4 52.5L85.8 90.2Z',
];

const LOGO_FILL = '#8b8f83'; // the PNG's own gray

const CSS = `
.wls-logo-stage {
    position: relative;
    display: flex; align-items: center; justify-content: center;
    width: 100%; height: 100%;
}
.wls-logo-aura {
    position: absolute; left: 50%; top: 50%;
    width: 80vmin; height: 80vmin; margin: -40vmin 0 0 -40vmin;
    background: radial-gradient(closest-side, rgba(150,158,140,0.20), rgba(150,158,140,0.06) 55%, transparent 100%);
    opacity: 0;
    animation: wls-aura-in 1.6s ease-out 0.4s forwards, wls-aura-breathe 5s ease-in-out 2s infinite;
}
.wls-logo-pop {
    animation: wls-logo-pop 1.3s cubic-bezier(0.2, 0.8, 0.2, 1) both;
}
.wls-logo-svg {
    display: block;
    width: min(52vw, 90vh);
    height: auto;
    overflow: visible;
    animation: wls-logo-float 6s ease-in-out 1.3s infinite;
}
.wls-logo-stroke {
    fill: none;
    stroke: #eef2e6;
    stroke-width: 1.4;
    stroke-linejoin: round;
    stroke-dasharray: 1;
    stroke-dashoffset: 1;
    animation: wls-logo-draw 3s ease-in-out forwards;
}
.wls-logo-fill {
    opacity: 0;
    animation: wls-logo-fillin 1.2s ease-out 1.4s forwards;
}
.wls-logo-glow {
    opacity: 0;
    animation: wls-logo-glow 3.2s ease-in-out 1.8s infinite;
}
.wls-logo-sheen {
    animation: wls-logo-sheen 3.6s ease-in-out 2.8s infinite;
    transform: translateX(-90px) skewX(-20deg);
}
@keyframes wls-logo-pop {
    from { opacity: 0; transform: scale(0.9); }
    to   { opacity: 1; transform: scale(1); }
}
@keyframes wls-logo-float {
    0%, 100% { transform: translateY(0); }
    50%      { transform: translateY(-1.2vh); }
}
@keyframes wls-logo-draw {
    0%   { stroke-dashoffset: 1; opacity: 1; }
    70%  { stroke-dashoffset: 0; opacity: 1; }
    100% { stroke-dashoffset: 0; opacity: 0; }
}
@keyframes wls-logo-fillin {
    from { opacity: 0; }
    to   { opacity: 1; }
}
@keyframes wls-logo-glow {
    0%, 100% { opacity: 0.10; }
    50%      { opacity: 0.55; }
}
@keyframes wls-logo-sheen {
    0%   { transform: translateX(-90px) skewX(-20deg); }
    55%, 100% { transform: translateX(330px) skewX(-20deg); }
}
@keyframes wls-aura-in      { to { opacity: 1; } }
@keyframes wls-aura-breathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.08); } }
`;

export default function AnimatedMatrixLogo() {
    return (
        <div className="wls-logo-stage">
            <style>{CSS}</style>
            <div className="wls-logo-aura" />
            <div className="wls-logo-pop">
                <svg className="wls-logo-svg" viewBox="10 13 206 126" role="img" aria-label="MATRIX">
                    <defs>
                        <linearGradient id="wls-logo-sheen-grad" x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0"   stopColor="#ffffff" stopOpacity="0" />
                            <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.85" />
                            <stop offset="1"   stopColor="#ffffff" stopOpacity="0" />
                        </linearGradient>
                        <clipPath id="wls-logo-clip">
                            {SHAPES.map((d, i) => <path key={i} d={d} />)}
                        </clipPath>
                        <filter id="wls-logo-blur" x="-25%" y="-25%" width="150%" height="150%">
                            <feGaussianBlur stdDeviation="5" />
                        </filter>
                    </defs>

                    {/* soft blurred glow behind — opacity-only animation, cheap */}
                    <g className="wls-logo-glow" filter="url(#wls-logo-blur)" fill="#c9d0bd">
                        {SHAPES.map((d, i) => <path key={i} d={d} />)}
                    </g>

                    {/* solid mark */}
                    <g className="wls-logo-fill" fill={LOGO_FILL}>
                        {SHAPES.map((d, i) => <path key={i} d={d} />)}
                    </g>

                    {/* light sheen, visible only inside the logo shape */}
                    <g clipPath="url(#wls-logo-clip)">
                        <rect className="wls-logo-sheen" x="0" y="0" width="50" height="160" fill="url(#wls-logo-sheen-grad)" />
                    </g>

                    {/* outline that draws itself on first */}
                    {SHAPES.map((d, i) => (
                        <path
                            key={i}
                            d={d}
                            pathLength="1"
                            className="wls-logo-stroke"
                            style={{ animationDelay: `${i * 0.3}s` }}
                        />
                    ))}
                </svg>
            </div>
        </div>
    );
}
