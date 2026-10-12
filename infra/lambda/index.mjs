import { randomUUID } from "node:crypto";
import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { CloudFrontClient, CreateInvalidationCommand } from "@aws-sdk/client-cloudfront";
import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
} from "@aws-sdk/client-cognito-identity-provider";

const { BUCKET, DISTRIBUTION_ID, USER_POOL_ID } = process.env;
const s3 = new S3Client({});
const cf = new CloudFrontClient({});
const idp = new CognitoIdentityProviderClient({});

const ALBUMS = {
  shop: { manifest: "gallery.json", max: 200 },
  hero: { manifest: "hero.json", max: 12 },
};
const MAX_BYTES = 3.5 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const USERNAME = /^[\w-]{1,128}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const reply = (statusCode, body) => ({
  statusCode,
  headers: { "content-type": "application/json", "cache-control": "no-store" },
  body: JSON.stringify(body),
});

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const audit = (claims, action, detail) =>
  console.log(JSON.stringify({ audit: true, user: claims.email, sub: claims.sub, action, ...detail }));

function albumOf(name) {
  const album = ALBUMS[name];
  if (!album) throw new HttpError(400, "Álbum no válido");
  return album;
}

async function readManifest(album) {
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: album.manifest }));
    const list = JSON.parse(await res.Body.transformToString());
    return Array.isArray(list) ? list : [];
  } catch (err) {
    if (err.name === "NoSuchKey") return [];
    throw err;
  }
}

async function writeManifest(album, list) {
  // Solo campos públicos: el manifiesto lo puede leer cualquiera.
  const clean = list.map(({ id, src, caption, createdAt }) => ({ id, src, caption, createdAt }));
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: album.manifest,
      Body: JSON.stringify(clean),
      ContentType: "application/json",
      CacheControl: "no-cache",
    })
  );
  try {
    await cf.send(
      new CreateInvalidationCommand({
        DistributionId: DISTRIBUTION_ID,
        InvalidationBatch: {
          CallerReference: randomUUID(),
          Paths: { Quantity: 1, Items: [`/${album.manifest}`] },
        },
      })
    );
  } catch (err) {
    console.warn("Invalidation failed", err);
  }
  return clean;
}

function parseBody(event) {
  try {
    const raw = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString() : event.body;
    return JSON.parse(raw || "{}");
  } catch {
    throw new HttpError(400, "Petición no válida");
  }
}

// Quita EXIF/XMP/comentarios (APP1-APP15, COM): las fotos del móvil pueden llevar la ubicación GPS.
export function stripJpegMetadata(buf) {
  const bad = () => new HttpError(415, "La imagen no es un JPEG válido");
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) throw bad();
  const out = [buf.subarray(0, 2)];
  let i = 2;
  let sawFrame = false;
  while (i < buf.length) {
    if (buf[i] !== 0xff) throw bad();
    while (buf[i] === 0xff && i < buf.length) i++;
    const marker = buf[i];
    const segStart = i - 1;
    i++;
    if (marker === 0xda) {
      if (!sawFrame) throw bad();
      out.push(Buffer.from([0xff]), buf.subarray(segStart + 1));
      return Buffer.concat(out);
    }
    if (marker === 0xd9 || i + 2 > buf.length) throw bad();
    const len = buf.readUInt16BE(i);
    if (len < 2 || i + len > buf.length) throw bad();
    const end = i + len;
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) sawFrame = true;
    const drop = (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe;
    if (!drop) out.push(Buffer.from([0xff]), buf.subarray(segStart + 1, end));
    i = end;
  }
  throw bad();
}

async function addPhoto(event, claims) {
  const { image, caption, album: albumName = "shop" } = parseBody(event);
  const album = albumOf(albumName);
  if (typeof image !== "string" || !image) throw new HttpError(400, "Falta la imagen");
  const raw = Buffer.from(image, "base64");
  if (raw.length === 0 || raw.length > MAX_BYTES) throw new HttpError(413, "La imagen es demasiado grande");
  const bytes = stripJpegMetadata(raw);

  const list = await readManifest(album);
  if (list.length >= album.max) throw new HttpError(409, `Máximo ${album.max} fotos aquí. Borra alguna antes de subir más`);

  const id = randomUUID();
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: `gallery/${id}.jpg`,
      Body: bytes,
      ContentType: "image/jpeg",
      CacheControl: "public,max-age=31536000,immutable",
    })
  );
  const entry = {
    id,
    src: `/gallery/${id}.jpg`,
    caption: typeof caption === "string" ? caption.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 140) : "",
    createdAt: new Date().toISOString(),
  };
  const next = await writeManifest(album, [entry, ...list]);
  audit(claims, "photo.add", { album: albumName, id });
  return reply(201, next);
}

async function removePhoto(albumName, id, claims) {
  const album = albumOf(albumName);
  if (!UUID.test(id || "")) throw new HttpError(400, "Identificador no válido");
  const list = await readManifest(album);
  if (!list.some((p) => p.id === id)) throw new HttpError(404, "La foto no existe");
  const next = await writeManifest(album, list.filter((p) => p.id !== id));
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: `gallery/${id}.jpg` }));
  audit(claims, "photo.remove", { album: albumName, id });
  return reply(200, next);
}
async function listUsers() {
  const res = await idp.send(new ListUsersCommand({ UserPoolId: USER_POOL_ID, Limit: 60 }));
  return (res.Users || []).map((u) => ({
    username: u.Username,
    email: u.Attributes?.find((a) => a.Name === "email")?.Value ?? u.Username,
    status: u.UserStatus,
    createdAt: u.UserCreateDate,
  }));
}

async function inviteUser(event, claims) {
  const { email } = parseBody(event);
  const clean = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!EMAIL.test(clean) || clean.length > 254) throw new HttpError(400, "Email no válido");
  try {
    await idp.send(
      new AdminCreateUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: clean,
        UserAttributes: [
          { Name: "email", Value: clean },
          { Name: "email_verified", Value: "true" },
        ],
        DesiredDeliveryMediums: ["EMAIL"],
      })
    );
  } catch (err) {
    if (err.name === "UsernameExistsException") throw new HttpError(409, "Ese email ya tiene acceso");
    throw err;
  }
  audit(claims, "user.invite", { email: clean });
  return reply(201, await listUsers());
}

async function removeUser(username, claims) {
  if (!USERNAME.test(username || "")) throw new HttpError(400, "Usuario no válido");
  if (username === claims.sub || username === claims["cognito:username"]) {
    throw new HttpError(400, "No puedes eliminar tu propio acceso");
  }
  const users = await listUsers();
  if (!users.some((u) => u.username === username)) throw new HttpError(404, "El usuario no existe");
  if (users.length <= 1) throw new HttpError(400, "Tiene que quedar al menos un administrador");
  await idp.send(new AdminDeleteUserCommand({ UserPoolId: USER_POOL_ID, Username: username }));
  audit(claims, "user.remove", { username });
  return reply(200, await listUsers());
}

export const handler = async (event) => {
  const claims = event.requestContext?.authorizer?.jwt?.claims;
  if (!claims) return reply(401, { error: "No autorizado" });
  try {
    switch (event.routeKey) {
      case "POST /photos":
        return await addPhoto(event, claims);
      case "DELETE /photos/{album}/{id}":
        return await removePhoto(event.pathParameters?.album, event.pathParameters?.id, claims);
      case "GET /users":
        return reply(200, await listUsers());
      case "POST /users":
        return await inviteUser(event, claims);
      case "DELETE /users/{username}":
        return await removeUser(event.pathParameters?.username, claims);
      default:
        return reply(404, { error: "No encontrado" });
    }
  } catch (err) {
    if (err instanceof HttpError) return reply(err.status, { error: err.message });
    console.error(err);
    return reply(500, { error: "Error interno" });
  }
};
