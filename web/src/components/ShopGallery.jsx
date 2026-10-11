import Carousel from "./Carousel.jsx";

const found = import.meta.glob("/src/assets/tienda/*.{jpg,jpeg,png,webp}", {
  eager: true,
  query: "?url",
  import: "default",
});

const slides = Object.entries(found)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([path, src]) => ({ src, alt: `Frutería La Asturiana: ${path.split("/").pop().replace(/\.[^.]+$/, "").replace(/[-_]/g, " ")}` }));

export default function ShopGallery() {
  if (slides.length === 0) return null;
  return (
    <section id="tienda" className="alt">
      <h2>La tienda</h2>
      <Carousel slides={slides} aspect="16 / 9" className="shop" />
    </section>
  );
}
