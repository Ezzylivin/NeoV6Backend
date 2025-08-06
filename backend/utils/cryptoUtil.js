// File: backend/utils/cryptoUtil.js
import CryptoJS from 'crypto-js';

const ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET;

if (!ENCRYPTION_SECRET || ENCRYPTION_SECRET.length < 32) {
  throw new Error(
    "CRITICAL: ENCRYPTION_SECRET is not defined or is not 32 characters long in .env file."
  );
}

export const encrypt = (text) => {
  return CryptoJS.AES.encrypt(text, ENCRYPTION_SECRET).toString();
};

export const decrypt = (ciphertext) => {
  const bytes = CryptoJS.AES.decrypt(ciphertext, ENCRYPTION_SECRET);
  return bytes.toString(CryptoJS.enc.Utf8);
};
