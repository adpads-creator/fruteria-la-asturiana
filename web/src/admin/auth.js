import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
} from "amazon-cognito-identity-js";

let pool = null;
let config = null;

export async function init() {
  if (config) return config;
  const res = await fetch("/admin-config.json", { cache: "no-store" });
  if (!res.ok) throw new Error("No se pudo cargar la configuración del panel");
  config = await res.json();
  pool = new CognitoUserPool({ UserPoolId: config.userPoolId, ClientId: config.clientId });
  return config;
}

const fail = (err) => Promise.reject(new Error(translate(err)));

export function translate(err) {
  switch (err?.code || err?.name) {
    case "NotAuthorizedException":
      return "Email o contraseña incorrectos.";
    case "UserNotFoundException":
      return "Email o contraseña incorrectos.";
    case "InvalidPasswordException":
      return "La contraseña debe tener al menos 12 caracteres, con mayúscula, minúscula y número.";
    case "CodeMismatchException":
    case "EnableSoftwareTokenMFAException":
      return "El código no es correcto. Comprueba la hora del móvil y usa el código actual.";
    case "ExpiredCodeException":
      return "El código ha caducado. Pide uno nuevo.";
    case "LimitExceededException":
    case "TooManyRequestsException":
      return "Demasiados intentos. Espera unos minutos.";
    case "NetworkError":
      return "Sin conexión.";
    default:
      return err?.message || "Ha ocurrido un error.";
  }
}

// Cognito puede encadenar retos: contraseña nueva -> alta de MFA -> código MFA.
function handlers(user, resolve, reject) {
  return {
    onSuccess: () => resolve({ status: "ok" }),
    onFailure: (e) => reject(new Error(translate(e))),
    newPasswordRequired: () => resolve({ status: "new-password", user }),
    mfaSetup: () => resolve({ status: "mfa-setup", user }),
    totpRequired: () => resolve({ status: "totp", user }),
    mfaRequired: () => reject(new Error("Método de verificación no soportado.")),
    selectMFAType: () => user.sendMFASelectionAnswer("SOFTWARE_TOKEN_MFA", handlers(user, resolve, reject)),
  };
}

export function login(email, password) {
  const user = new CognitoUser({ Username: email.trim().toLowerCase(), Pool: pool });
  const details = new AuthenticationDetails({ Username: email.trim().toLowerCase(), Password: password });
  return new Promise((resolve, reject) => user.authenticateUser(details, handlers(user, resolve, reject)));
}

export function completeNewPassword(user, password) {
  return new Promise((resolve, reject) => user.completeNewPasswordChallenge(password, {}, handlers(user, resolve, reject)));
}

export function startTotpSetup(user) {
  return new Promise((resolve, reject) =>
    user.associateSoftwareToken({
      associateSecretCode: (secret) => resolve(secret),
      onFailure: (e) => reject(new Error(translate(e))),
    })
  );
}

export function finishTotpSetup(user, code) {
  return new Promise((resolve, reject) =>
    user.verifySoftwareToken(code.replace(/\s/g, ""), "app", {
      onSuccess: () => resolve({ status: "ok" }),
      onFailure: (e) => reject(new Error(translate(e))),
    })
  );
}

export function sendTotp(user, code) {
  return new Promise((resolve, reject) =>
    user.sendMFACode(code.replace(/\s/g, ""), handlers(user, resolve, reject), "SOFTWARE_TOKEN_MFA")
  );
}

export function totpUri(email, secret) {
  const issuer = "Frutería La Asturiana";
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}`;
}

export function startReset(email) {
  const user = new CognitoUser({ Username: email.trim().toLowerCase(), Pool: pool });
  return new Promise((resolve, reject) => {
    user.forgotPassword({
      onSuccess: () => resolve(user),
      onFailure: (e) => reject(new Error(translate(e))),
      inputVerificationCode: () => resolve(user),
    });
  });
}

export function finishReset(user, code, password) {
  return new Promise((resolve, reject) => {
    user.confirmPassword(code.trim(), password, {
      onSuccess: () => resolve(),
      onFailure: (e) => reject(new Error(translate(e))),
    });
  });
}

export function currentSession() {
  const user = pool?.getCurrentUser();
  if (!user) return Promise.resolve(null);
  return new Promise((resolve) => {
    user.getSession((err, session) => {
      if (err || !session?.isValid()) resolve(null);
      else resolve({ user, session });
    });
  });
}

export function logout() {
  const user = pool?.getCurrentUser();
  if (!user) return Promise.resolve();
  // Revoca también el refresh token en Cognito, no solo en este navegador.
  return new Promise((resolve) =>
    user.getSession((err) => {
      if (err) {
        user.signOut();
        resolve();
        return;
      }
      user.globalSignOut({ onSuccess: resolve, onFailure: () => { user.signOut(); resolve(); } });
    })
  );
}

export async function api(method, path, body) {
  const s = await currentSession();
  if (!s) throw new Error("La sesión ha caducado. Vuelve a entrar.");
  const res = await fetch(config.apiUrl + path, {
    method,
    headers: {
      authorization: s.session.getIdToken().getJwtToken(),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) throw new Error("La sesión ha caducado. Vuelve a entrar.");
  if (!res.ok) return fail({ message: data.error || `Error ${res.status}` });
  return data;
}

export function emailOf(session) {
  return session.session.getIdToken().payload.email;
}
