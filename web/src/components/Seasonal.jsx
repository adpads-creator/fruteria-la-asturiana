import { useState } from "react";
import { seasons, currentSeason } from "../data/content.js";

export default function Seasonal() {
  const [key, setKey] = useState(currentSeason());
  const s = seasons[key];
  return (
    <section id="temporada">
      <h2>Qué hay de temporada</h2>
      <p className="lead">La oferta cambia durante el año. Esto es lo que suele estar en su mejor momento; la disponibilidad real puedes consultarla con nosotros.</p>
      <div className="tabs" role="tablist" aria-label="Estación">
        {Object.entries(seasons).map(([k, v]) => (
          <button
            key={k}
            role="tab"
            aria-selected={k === key}
            className={k === key ? "tab on" : "tab"}
            onClick={() => setKey(k)}
          >
            {v.emoji} {v.label}
          </button>
        ))}
      </div>
      <ul className="chips" role="tabpanel">
        {s.items.map((it) => (
          <li key={it}>{it}</li>
        ))}
      </ul>
    </section>
  );
}
