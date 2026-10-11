export const owners = [
  { name: "Andrea", phone: "+34611440166" },
  { name: "Pablo", phone: "+34611441541" },
];

export const address = {
  street: "Av. Federico García Lorca, 13, local 6",
  city: "Granada",
};

export const mapUrl =
  "https://www.google.com/maps/search/?api=1&query=" +
  encodeURIComponent("Frutería la Asturiana, Av. Federico García Lorca 13, Granada");

export const hero = [
  { src: "/img/fruta/mercado.jpg", alt: "Verduras frescas: brócoli, zanahorias, ajos y tomates" },
  { src: "/img/fruta/fresas.jpg", alt: "Fresas frescas en cajas" },
  { src: "/img/fruta/naranjas.jpg", alt: "Naranjas enteras y abiertas" },
  { src: "/img/fruta/ambersweet.jpg", alt: "Naranjas recién recogidas" },
  { src: "/img/fruta/fresa-corte.jpg", alt: "Fresas partidas por la mitad" },
];

export const seasons = {
  primavera: { label: "Primavera", emoji: "🌸", items: ["Fresas", "Cerezas", "Espárragos", "Alcachofas", "Guisantes", "Habas"] },
  verano: { label: "Verano", emoji: "☀️", items: ["Melocotones", "Sandía", "Melón", "Albaricoques", "Tomates", "Pimientos"] },
  otono: { label: "Otoño", emoji: "🍂", items: ["Uvas", "Granadas", "Caquis", "Higos", "Calabaza", "Setas"] },
  invierno: { label: "Invierno", emoji: "❄️", items: ["Naranjas", "Mandarinas", "Limones", "Kiwis", "Coles", "Espinacas"] },
};

export function currentSeason(date = new Date()) {
  const m = date.getMonth() + 1;
  if (m >= 3 && m <= 5) return "primavera";
  if (m >= 6 && m <= 8) return "verano";
  if (m >= 9 && m <= 11) return "otono";
  return "invierno";
}

export const services = [
  { icon: "🏪", title: "Compra en tienda", text: "Elige tú mismo cada pieza, con consejo de Pablo y Andrea." },
  { icon: "🧺", title: "Recogida en tienda", text: "Encárganos tu pedido por WhatsApp y pasa a por él." },
  { icon: "🛵", title: "Entrega a domicilio", text: "Te lo llevamos a casa. Pregúntanos por tu zona." },
];
