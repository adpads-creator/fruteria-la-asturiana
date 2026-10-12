import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import {
  init, login, completeNewPassword, startReset, finishReset,
  startTotpSetup, finishTotpSetup, sendTotp, totpUri,
  currentSession, logout, api, emailOf,
} from "./auth.js";
import { toJpeg, blobToBase64 } from "./image.js";

function TotpSetup({ user, email, onDone }) {
  const [secret, setSecret] = useState("");
  const [qr, setQr] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    startTotpSetup(user)
      .then(async (s) => {
        setSecret(s);
        setQr(await QRCode.toDataURL(totpUri(email, s), { margin: 1, width: 220 }));
      })
      .catch((e) => setError(e.message));
  }, [user, email]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await finishTotpSetup(user, code);
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="card narrow">
      <h1>🔐 Protege tu acceso</h1>
      <ol className="steps">
        <li>Instala en el móvil <strong>Google Authenticator</strong> o <strong>Microsoft Authenticator</strong> (gratis).</li>
        <li>En la app, pulsa <em>Añadir</em> y escanea este código.</li>
        <li>Escribe aquí el número de 6 cifras que te muestra.</li>
      </ol>
      {qr ? <img className="qr" src={qr} alt="Código QR para la app de verificación" /> : !error && <p>Preparando…</p>}
      {secret && (
        <details>
          <summary>¿No puedes escanearlo?</summary>
          <p>Introduce esta clave a mano: <code className="secret">{secret.match(/.{1,4}/g).join(" ")}</code></p>
        </details>
      )}
      <form onSubmit={submit}>
        <label>
          Código de 6 cifras
          <input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" required value={code} onChange={(e) => setCode(e.target.value)} />
        </label>
        {error && <p className="err" role="alert">{error}</p>}
        <button className="primary" disabled={busy || !secret}>{busy ? "Comprobando…" : "Activar"}</button>
      </form>
    </main>
  );
}

function Login({ onDone }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const run = async (fn) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const checkNew = () => {
    if (password.length < 12) throw new Error("La contraseña debe tener al menos 12 caracteres.");
    if (password !== password2) throw new Error("Las contraseñas no coinciden.");
  };

  const next = (r) => {
    setPassword("");
    setPassword2("");
    setCode("");
    setInfo("");
    if (r.status === "ok") return onDone();
    setPending(r.user);
    setMode(r.status === "new-password" ? "new" : r.status);
  };

  const submit = (e) => {
    e.preventDefault();
    run(async () => {
      if (mode === "login") {
        next(await login(email, password));
      } else if (mode === "new") {
        checkNew();
        next(await completeNewPassword(pending, password));
      } else if (mode === "totp") {
        next(await sendTotp(pending, code));
      } else if (mode === "forgot") {
        setPending(await startReset(email));
        setInfo("Te hemos enviado un código por email.");
        setPassword("");
        setMode("reset");
      } else if (mode === "reset") {
        checkNew();
        await finishReset(pending, code, password);
        setInfo("Contraseña cambiada. Ya puedes entrar.");
        setPassword("");
        setPassword2("");
        setCode("");
        setMode("login");
      }
    });
  };

  if (mode === "mfa-setup") return <TotpSetup user={pending} email={email.trim().toLowerCase()} onDone={onDone} />;

  const titles = {
    login: "Entrar al panel",
    new: "Crea tu contraseña",
    totp: "Código de verificación",
    forgot: "Recuperar contraseña",
    reset: "Nueva contraseña",
  };

  return (
    <main className="card narrow">
      <h1>🍎 {titles[mode]}</h1>
      {mode === "new" && <p>Es tu primer acceso. Elige una contraseña de al menos 12 caracteres.</p>}
      {mode === "totp" && <p>Abre tu app de verificación y escribe el código de 6 cifras de "Frutería La Asturiana".</p>}
      {info && <p className="ok">{info}</p>}
      <form onSubmit={submit}>
        {(mode === "login" || mode === "forgot") && (
          <label>
            Email
            <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
        )}
        {(mode === "reset" || mode === "totp") && (
          <label>
            {mode === "totp" ? "Código de 6 cifras" : "Código recibido por email"}
            <input inputMode="numeric" autoComplete="one-time-code" required autoFocus value={code} onChange={(e) => setCode(e.target.value)} />
          </label>
        )}
        {(mode === "login" || mode === "new" || mode === "reset") && (
          <label>
            {mode === "login" ? "Contraseña" : "Nueva contraseña"}
            <input
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
        )}
        {(mode === "new" || mode === "reset") && (
          <label>
            Repite la contraseña
            <input type="password" autoComplete="new-password" required value={password2} onChange={(e) => setPassword2(e.target.value)} />
          </label>
        )}
        {error && <p className="err" role="alert">{error}</p>}
        <button className="primary" disabled={busy}>
          {busy ? "Un momento…" : mode === "forgot" ? "Enviar código" : mode === "login" ? "Entrar" : mode === "totp" ? "Verificar" : "Guardar"}
        </button>
      </form>
      {mode === "login" && (
        <button className="link" onClick={() => { setMode("forgot"); setError(""); setInfo(""); }}>
          He olvidado mi contraseña
        </button>
      )}
      {mode !== "login" && (
        <button className="link" onClick={() => { setMode("login"); setPending(null); setError(""); setInfo(""); }}>
          Volver
        </button>
      )}
    </main>
  );
}

const ALBUMS = {
  hero: {
    title: "Fotos de portada",
    help: "Son las fotos grandes del principio de la web, con el título encima. Usa fotos horizontales y luminosas. Mientras no subas ninguna, se ven las fotos de fruta de ejemplo.",
    captions: false,
    max: 12,
  },
  shop: {
    title: "Fotos de la tienda",
    help: 'Aparecen en el carrusel "La tienda", más abajo en la web. Puedes añadir un texto a cada foto.',
    captions: true,
    max: 200,
  },
};

function Photos({ album }) {
  const cfg = ALBUMS[album];
  const [photos, setPhotos] = useState(null);
  const [caption, setCaption] = useState("");
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef(null);
  const manifest = album === "hero" ? "/hero.json" : "/gallery.json";

  const load = useCallback(async () => {
    setPhotos(null);
    try {
      const res = await fetch(`${manifest}?t=${Date.now()}`, { cache: "no-store" });
      setPhotos(res.ok ? await res.json() : []);
    } catch {
      setPhotos([]);
    }
  }, [manifest]);

  useEffect(() => { load(); setError(""); setCaption(""); }, [load]);

  const upload = async (e) => {
    const files = [...e.target.files];
    e.target.value = "";
    if (!files.length) return;
    setBusy(true);
    setError("");
    try {
      for (let i = 0; i < files.length; i++) {
        setProgress(`Subiendo ${i + 1} de ${files.length}…`);
        const blob = await toJpeg(files[i]);
        setPhotos(await api("POST", "/photos", { album, image: await blobToBase64(blob), caption: cfg.captions ? caption : "" }));
      }
      setCaption("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      setProgress("");
    }
  };

  const remove = async (p) => {
    if (!window.confirm("¿Borrar esta foto de la web?")) return;
    setBusy(true);
    setError("");
    try {
      setPhotos(await api("DELETE", `/photos/${album}/${p.id}`));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const full = photos && photos.length >= cfg.max;

  return (
    <section>
      <div className="card">
        <h2>{cfg.title}</h2>
        <p>{cfg.help}</p>
        {cfg.captions && (
          <label>
            Texto de la foto (opcional)
            <input value={caption} maxLength={140} onChange={(e) => setCaption(e.target.value)} placeholder="Ej: Fresas de hoy" />
          </label>
        )}
        <input ref={input} type="file" accept="image/*" multiple hidden onChange={upload} />
        <button className="primary big" disabled={busy || full} onClick={() => input.current.click()}>
          📷 Elegir fotos
        </button>
        {full && <p className="muted">Has llegado al máximo de {cfg.max} fotos. Borra alguna para subir más.</p>}
        {progress && <p className="ok">{progress}</p>}
        {error && <p className="err" role="alert">{error}</p>}
      </div>
      <h2>Publicadas {photos ? `(${photos.length})` : ""}</h2>
      {photos === null && <p>Cargando…</p>}
      {photos?.length === 0 && <p className="muted">Todavía no hay fotos. Sube la primera.</p>}
      <div className="thumbs">
        {photos?.map((p) => (
          <figure key={p.id}>
            <img src={p.src} alt={p.caption || "Foto subida"} loading="lazy" />
            {p.caption && <figcaption>{p.caption}</figcaption>}
            <button className="danger" disabled={busy} onClick={() => remove(p)}>Borrar</button>
          </figure>
        ))}
      </div>
    </section>
  );
}
function Users({ me }) {
  const [users, setUsers] = useState(null);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api("GET", "/users").then(setUsers).catch((e) => setError(e.message));
  }, []);

  const invite = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setInfo("");
    try {
      setUsers(await api("POST", "/users", { email }));
      setInfo(`Invitación enviada a ${email}. Recibirá un email con una contraseña temporal.`);
      setEmail("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (u) => {
    if (!window.confirm(`¿Quitar el acceso a ${u.email}?`)) return;
    setBusy(true);
    setError("");
    try {
      setUsers(await api("DELETE", `/users/${encodeURIComponent(u.username)}`));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <form className="card" onSubmit={invite}>
        <h2>Invitar a otra persona</h2>
        <p>Recibirá un email con una contraseña temporal para entrar a este panel. La primera vez tendrá que configurar una app de verificación en su móvil. Podrá subir y borrar fotos e invitar a más gente, así que invita solo a quien confíes.</p>
        <label>
          Email
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <button className="primary" disabled={busy}>Enviar invitación</button>
        {info && <p className="ok">{info}</p>}
        {error && <p className="err" role="alert">{error}</p>}
      </form>
      <h2>Quién tiene acceso</h2>
      {users === null && !error && <p>Cargando…</p>}
      <ul className="users">
        {users?.map((u) => (
          <li key={u.username}>
            <span>
              {u.email}
              {u.email === me && <em> (tú)</em>}
              {u.status === "FORCE_CHANGE_PASSWORD" && <small> · pendiente de aceptar</small>}
            </span>
            {u.email !== me && <button className="danger" disabled={busy} onClick={() => remove(u)}>Quitar</button>}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function Admin() {
  const [state, setState] = useState("loading");
  const [session, setSession] = useState(null);
  const [tab, setTab] = useState("hero");
  const [fatal, setFatal] = useState("");

  const refresh = useCallback(async () => {
    const s = await currentSession();
    setSession(s);
    setState(s ? "in" : "out");
  }, []);

  useEffect(() => {
    init().then(refresh).catch((e) => { setFatal(e.message); setState("error"); });
  }, [refresh]);

  if (state === "loading") return <p className="center">Cargando…</p>;
  if (state === "error") return <p className="center err">{fatal}</p>;
  if (state === "out") return <Login onDone={refresh} />;

  return (
    <>
      <header className="bar">
        <strong>🍎 Panel de la frutería</strong>
        <span className="who">{emailOf(session)}</span>
        <a href="/" target="_blank" rel="noopener">Ver la web</a>
        <button className="link" onClick={() => logout().then(refresh)}>Salir</button>
      </header>
      <nav className="tabs">
        <button className={tab === "hero" ? "on" : ""} onClick={() => setTab("hero")}>🖼️ Portada</button>
        <button className={tab === "shop" ? "on" : ""} onClick={() => setTab("shop")}>📷 Tienda</button>
        <button className={tab === "users" ? "on" : ""} onClick={() => setTab("users")}>👥 Usuarios</button>
      </nav>
      <main className="wrap">{tab === "users" ? <Users me={emailOf(session)} /> : <Photos album={tab} />}</main>
    </>
  );
}
