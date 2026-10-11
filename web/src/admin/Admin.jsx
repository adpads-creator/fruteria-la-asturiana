import { useCallback, useEffect, useRef, useState } from "react";
import {
  init, login, completeNewPassword, startReset, finishReset,
  currentSession, logout, api, emailOf,
} from "./auth.js";
import { toJpeg, blobToBase64 } from "./image.js";

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

  const submit = (e) => {
    e.preventDefault();
    run(async () => {
      if (mode === "login") {
        const r = await login(email, password);
        if (r.status === "new-password") {
          setPending(r.user);
          setPassword("");
          setMode("new");
        } else onDone();
      } else if (mode === "new") {
        checkNew();
        await completeNewPassword(pending, password);
        onDone();
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
        setMode("login");
      }
    });
  };

  const titles = {
    login: "Entrar al panel",
    new: "Crea tu contraseña",
    forgot: "Recuperar contraseña",
    reset: "Nueva contraseña",
  };

  return (
    <main className="card narrow">
      <h1>🍎 {titles[mode]}</h1>
      {mode === "new" && <p>Es tu primer acceso. Elige una contraseña de al menos 12 caracteres.</p>}
      {info && <p className="ok">{info}</p>}
      <form onSubmit={submit}>
        {(mode === "login" || mode === "forgot") && (
          <label>
            Email
            <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
        )}
        {mode === "reset" && (
          <label>
            Código recibido por email
            <input inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value)} />
          </label>
        )}
        {mode !== "forgot" && (
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
          {busy ? "Un momento…" : mode === "forgot" ? "Enviar código" : mode === "login" ? "Entrar" : "Guardar"}
        </button>
      </form>
      {mode === "login" && (
        <button className="link" onClick={() => { setMode("forgot"); setError(""); setInfo(""); }}>
          He olvidado mi contraseña
        </button>
      )}
      {(mode === "forgot" || mode === "reset") && (
        <button className="link" onClick={() => { setMode("login"); setError(""); setInfo(""); }}>
          Volver
        </button>
      )}
    </main>
  );
}

function Photos() {
  const [photos, setPhotos] = useState(null);
  const [caption, setCaption] = useState("");
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/gallery.json?t=${Date.now()}`, { cache: "no-store" });
      setPhotos(res.ok ? await res.json() : []);
    } catch {
      setPhotos([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const upload = async (e) => {
    const files = [...e.target.files];
    e.target.value = "";
    if (!files.length) return;
    setBusy(true);
    setError("");
    let list = photos;
    try {
      for (let i = 0; i < files.length; i++) {
        setProgress(`Subiendo ${i + 1} de ${files.length}…`);
        const blob = await toJpeg(files[i]);
        list = await api("POST", "/photos", { image: await blobToBase64(blob), caption });
        setPhotos(list);
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
      setPhotos(await api("DELETE", `/photos/${p.id}`));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <div className="card">
        <h2>Subir fotos</h2>
        <p>Elige una o varias fotos de la tienda. Aparecerán en el carrusel "La tienda" de la web en menos de un minuto.</p>
        <label>
          Texto de la foto (opcional)
          <input value={caption} maxLength={140} onChange={(e) => setCaption(e.target.value)} placeholder="Ej: Fresas de hoy" />
        </label>
        <input ref={input} type="file" accept="image/*" multiple hidden onChange={upload} />
        <button className="primary big" disabled={busy} onClick={() => input.current.click()}>
          📷 Elegir fotos
        </button>
        {progress && <p className="ok">{progress}</p>}
        {error && <p className="err" role="alert">{error}</p>}
      </div>
      <h2>Fotos en la web {photos ? `(${photos.length})` : ""}</h2>
      {photos === null && <p>Cargando…</p>}
      {photos?.length === 0 && <p className="muted">Todavía no hay fotos. Sube la primera.</p>}
      <div className="thumbs">
        {photos?.map((p) => (
          <figure key={p.id}>
            <img src={p.src} alt={p.caption || "Foto de la tienda"} loading="lazy" />
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
        <p>Recibirá un email con una contraseña temporal para entrar a este panel. Podrá subir y borrar fotos e invitar a más gente, así que invita solo a quien confíes.</p>
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
  const [tab, setTab] = useState("photos");
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
        <button className="link" onClick={() => { logout(); refresh(); }}>Salir</button>
      </header>
      <nav className="tabs">
        <button className={tab === "photos" ? "on" : ""} onClick={() => setTab("photos")}>📷 Fotos</button>
        <button className={tab === "users" ? "on" : ""} onClick={() => setTab("users")}>👥 Usuarios</button>
      </nav>
      <main className="wrap">{tab === "photos" ? <Photos /> : <Users me={emailOf(session)} />}</main>
    </>
  );
}
