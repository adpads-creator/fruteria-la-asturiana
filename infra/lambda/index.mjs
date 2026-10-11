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

const MANIFEST_KEY = "gallery.json";
const MAX_BYTES = 3.5 * 1024 * 1024;
const MAX_PHOTOS = 200;
const UUID = /^[0-9a-f-]{36}$/;
const USERNAME = /^[\w-]{1,128}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const reply = (statusCode, body) => ({
  statusCode,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function readManifest() {
  const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: MANIFEST_KEY }));
  const list = JSON.parse(await res.Body.transformToString());
  return Array.isArray(list) ? list : [];
}

async function writeManifest(list) {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: MANIFEST_KEY,
      Body: JSON.stringify(list),
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
          Paths: { Quantity: 1, Items: ["/gallery.json"] },
        },
      })
    );
  } catch (err) {
    console.warn("Invalidation failed", err);
  }
}

function parseBody(event) {
  try {
    const raw = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString() : event.body;
    return JSON.parse(raw || "{}");
  } catch {
    throw new HttpError(400, "Petición no válida");
  }
}

async function addPhoto(event, claims) {
  const { image, caption } = parseBody(event);
  if (typeof image !== "string" || !image) throw new HttpError(400, "Falta la imagen");
  const bytes = Buffer.from(image, "base64");
  if (bytes.length === 0 || bytes.length > MAX_BYTES) throw new HttpError(413, "La imagen es demasiado grande");
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (!isJpeg) throw new HttpError(415, "Solo se admiten imágenes JPEG");

  const list = await readManifest();
  if (list.length >= MAX_PHOTOS) throw new HttpError(409, `Máximo ${MAX_PHOTOS} fotos. Borra alguna antes de subir más`);

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
    caption: typeof caption === "string" ? caption.trim().slice(0, 140) : "",
    createdAt: new Date().toISOString(),
    by: claims.email,
  };
  const next = [entry, ...list];
  await writeManifest(next);
  return reply(201, next);
}

async function removePhoto(id) {
  if (!UUID.test(id || "")) throw new HttpError(400, "Identificador no válido");
  const list = await readManifest();
  if (!list.some((p) => p.id === id)) throw new HttpError(404, "La foto no existe");
  const next = list.filter((p) => p.id !== id);
  await writeManifest(next);
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: `gallery/${id}.jpg` }));
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

async function inviteUser(event) {
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
  return reply(200, await listUsers());
}

export const handler = async (event) => {
  const claims = event.requestContext?.authorizer?.jwt?.claims;
  if (!claims) return reply(401, { error: "No autorizado" });
  try {
    switch (event.routeKey) {
      case "POST /photos":
        return await addPhoto(event, claims);
      case "DELETE /photos/{id}":
        return await removePhoto(event.pathParameters?.id);
      case "GET /users":
        return reply(200, await listUsers());
      case "POST /users":
        return await inviteUser(event);
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
