import { useCallback, useEffect, useRef, useState } from "react";

export default function Carousel({ slides, interval = 5000, className = "", overlay = null, aspect }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchX = useRef(null);
  const count = slides.length;

  const go = useCallback((i) => setIndex((i + count) % count), [count]);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (paused || reduce || count < 2) return undefined;
    const id = setInterval(() => setIndex((i) => (i + 1) % count), interval);
    return () => clearInterval(id);
  }, [paused, count, interval]);

  const onKey = (e) => {
    if (e.key === "ArrowLeft") go(index - 1);
    if (e.key === "ArrowRight") go(index + 1);
  };

  const onTouchEnd = (e) => {
    if (touchX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    if (Math.abs(dx) > 40) go(index + (dx < 0 ? 1 : -1));
    touchX.current = null;
  };

  return (
    <div
      className={`carousel ${className}`}
      style={aspect ? { aspectRatio: aspect } : undefined}
      role="region"
      aria-roledescription="carrusel"
      tabIndex={0}
      onKeyDown={onKey}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={onTouchEnd}
    >
      {slides.map((s, i) => (
        <img
          key={s.src}
          src={s.src}
          alt={s.alt}
          className={i === index ? "slide active" : "slide"}
          loading={i === 0 ? "eager" : "lazy"}
          aria-hidden={i !== index}
        />
      ))}
      {overlay}
      {count > 1 && (
        <>
          <button className="nav prev" onClick={() => go(index - 1)} aria-label="Anterior">‹</button>
          <button className="nav next" onClick={() => go(index + 1)} aria-label="Siguiente">›</button>
          <div className="dots">
            {slides.map((s, i) => (
              <button
                key={s.src}
                className={i === index ? "dot on" : "dot"}
                onClick={() => go(i)}
                aria-label={`Ir a la imagen ${i + 1}`}
                aria-current={i === index}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
