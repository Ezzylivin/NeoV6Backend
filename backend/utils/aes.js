import CryptoJS from 'crypto-js';

const ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET;

// A critical startup check. If the secret key is missing or weak, the app will refuse to start.
// This prevents running in an insecure state.
if (!ENCRYPTION_SECRET || ENCRYPTION_SECRET.length < 32) {
  console.error("\n--- CRITICAL SECURITY ERROR ---");
  console.error("ENCRYPTION_SECRET is not defined in your .env file or is not at least 32 characters long.");
  console.error("The application cannot run without a secure encryption key.");
  console.error("Please generate a secret key and add it to your .env file.");
  console.error("Example: openssl rand -base64 32");
  process.exit(1); // Stop the server from starting.
}

/**
 * Encrypts a plain text string using AES.
 * @param {string} text - The plain text to encrypt (e.g., an API secret).
 * @returns {string} The AES encrypted ciphertext.
 */
export const encrypt = (text) => {
  if (!text) return null;
  return CryptoJS.AES.encrypt(text, ENCRYPTION_SECRET).toString();
};

/**
 * Decrypts an AES ciphertext string back to plain text.
 * @param {string} ciphertext - The encrypted text to decrypt.
 * @returns {string} The original plain text.
 */
export const decrypt = (ciphertext) => {
  if (!ciphertext) return null;
  const bytes = CryptoJS.AES.decrypt(ciphertext, ENCRYPTION_SECRET);
  // It's possible decryption fails if the ciphertext is corrupted or the wrong key is used.
  // We wrap this in a try...catch to prevent crashes.
  try {
    const originalText = bytes.toString(CryptoJS.enc.Utf8);
    if (!originalText) {
      throw new Error('Decryption resulted in an empty string. Possible key mismatch or corruption.');
    }
    return originalText;
  } catch (error) {
    console.error('Decryption failed:', error);
    // Return null or an empty string to indicate failure, rather than crashing.
    return null;
  }
};
