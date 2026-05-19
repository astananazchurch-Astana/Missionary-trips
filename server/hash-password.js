import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const password = process.argv[2];

if (!password) {
  console.error("Usage: npm run hash:password -- <password>");
  process.exit(1);
}

const salt = randomBytes(16).toString("hex");
const hash = await scrypt(password, salt, 64);

console.log(`ADMIN_PASSWORD_SALT=${salt}`);
console.log(`ADMIN_PASSWORD_HASH=${hash.toString("hex")}`);
