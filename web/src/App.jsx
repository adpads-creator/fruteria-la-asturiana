import { useEffect, useState } from "react";
import Carousel from "./components/Carousel.jsx";
import Seasonal from "./components/Seasonal.jsx";
import ShopGallery from "./components/ShopGallery.jsx";
import { owners, address, mapUrl, hero, services } from "./data/content.js";
import credits from "./data/credits.json";

const wa = (phone) => `https://wa.me/${phone.replace("+", "")}?text=${encodeURIComponent("Hola, quería hacer un pedido en la frutería.")}`;

// Si los dueños han subido fotos de portada, sustituyen a las de stock.
function useHeroSlides() {
  const [slides, setSlides] = useState(null);
  useEffect(() => {
    let alive = true;
    fetch("/hero.json")
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => {
        if (!alive) return;
        const own = Array.isArray(list) ? list.map((p) => ({ src: p.src, alt: p.caption || "Frutería La Asturiana" })) : [];
        setSlides(own.length ? own : hero);
      })
      .catch(() => alive && setSlides(hero));
    return () => { alive = false; };
  }, []);
  return slides ?? [];
}

export default function App() {
  const heroSlides = useHeroSlides();
  const usingStock = heroSlides === hero;
  return (
    <>
      <header className="top">
        <span className="logo">🍎 La Asturiana</span>
        <nav aria-label="Principal">
          <a href="#temporada">Temporada</a>
          <a href="#servicios">Servicios</a>
          <a href="#nosotros">Nosotros</a>
          <a href="#contacto">Contacto</a>
        </nav>
      </header>
      <main>
        <Carousel
          slides={heroSlides}
          className="hero"
          overlay={
            <div className="hero-text">
              <h1>Tu frutería de barrio en Granada</h1>
              <p>Fruta y verdura fresca de temporada, con el trato cercano de Pablo y Andrea.</p>
              <a className="btn" href="#contacto">Haz tu pedido</a>
            </div>
          }
        />
        <Seasonal />
        <section id="servicios" className="alt">
          <h2>Cómo comprar</h2>
          <div className="grid">
            {services.map((s) => (
              <article key={s.title}>
                <span aria-hidden="true">{s.icon}</span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </article>
            ))}
          </div>
        </section>
        <section id="nosotros">
          <h2>Pablo y Andrea</h2>
          <p className="lead">
            Somos un matrimonio joven con muchas ganas de trabajar. Cada día elegimos la fruta y la verdura con ilusión, para que en tu mesa haya producto bueno y trato de verdad. Comprar en el comercio de barrio es apostar por el barrio.
          </p>
        </section>
        <ShopGallery />
        <section id="contacto">
          <h2>Contacto</h2>
          <p className="lead">
            <strong>{address.street}</strong>, {address.city}
            <br />
            <a href={mapUrl} target="_blank" rel="noopener noreferrer">Ver en el mapa</a>
          </p>
          <div className="grid contact">
            {owners.map((o) => (
              <article key={o.name}>
                <h3>{o.name}</h3>
                <p>
                  <a href={`tel:${o.phone}`}>{o.phone.replace(/^\+34/, "+34 ").replace(/(\d{3})(\d{2})(\d{2})(\d{2})$/, "$1 $2 $3 $4")}</a>
                </p>
                <a className="btn small" href={wa(o.phone)} target="_blank" rel="noopener noreferrer">WhatsApp</a>
              </article>
            ))}
          </div>
          <p className="muted">Para el horario y los pedidos, escríbenos o llámanos.</p>
        </section>
      </main>
      <footer>
        <p>© {new Date().getFullYear()} Frutería La Asturiana</p>
        {usingStock && (
        <details>
          <summary>Créditos de las fotos</summary>
          <ul>
            {credits.map((c) => (
              <li key={c.id}>
                <a href={c.url} target="_blank" rel="noopener noreferrer">{c.title}</a> · {c.author || "Dominio público"} · {c.license}
              </li>
            ))}
          </ul>
        </details>
        )}
      </footer>
    </>
  );
}
