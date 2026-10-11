import { useEffect, useState } from "react";
import Carousel from "./Carousel.jsx";

export default function ShopGallery() {
  const [slides, setSlides] = useState([]);

  useEffect(() => {
    let alive = true;
    fetch("/gallery.json")
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => {
        if (!alive || !Array.isArray(list)) return;
        setSlides(list.map((p) => ({ src: p.src, alt: p.caption || "Foto de la Frutería La Asturiana", caption: p.caption })));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  if (slides.length === 0) return null;
  return (
    <section id="tienda" className="alt">
      <h2>La tienda</h2>
      <Carousel slides={slides} aspect="16 / 9" className="shop" />
    </section>
  );
}