// File: backend/controllers/userController.js

import { 
    registerUser as registerSvc, 
    loginUser as loginSvc, 
    getMe as getMeSvc,
    updateUserApiKeys as updateKeysSvc,
    getUserApiKeys as getKeysSvc,      // 👈 New Import
    deleteUserApiKey as deleteKeySvc,  // 👈 New Import
    verifyEmail as verifyEmailSvc,
    resendVerification as resendVerificationSvc,
    updateEmail as updateEmailSvc,
    requestPasswordReset as requestPasswordResetSvc,
    resetPassword as resetPasswordSvc
} from "../services/userService.js";
import User from "../dbStructure/user.js";

/**
 * Mark the logged-in user as having seen the onboarding tour. Idempotent and
 * only ever sets the timestamp ONCE (first login), so the tour never auto-shows
 * again on any device. POST /api/users/onboarded
 */
export const markOnboarded = async (req, res) => {
  try {
    await User.updateOne(
      { _id: req.user.id, $or: [{ onboardedAt: { $exists: false } }, { onboardedAt: null }] },
      { $set: { onboardedAt: new Date() } }
    );
    res.status(200).json({ onboarded: true });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

/**
 * Start a password reset (emails a link). Always 200 — never reveal if the
 * email is registered. POST /api/users/forgot-password { email }
 */
export const forgotPassword = async (req, res) => {
  try {
    await requestPasswordResetSvc(req.body?.email);
  } catch (err) {
    console.error("[forgotPassword]", err.message);
  }
  res.status(200).json({ message: "If that email is registered, a reset link is on its way." });
};

/**
 * Complete a password reset from the token. POST /api/users/reset-password { token, password }
 */
export const resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body || {};
    await resetPasswordSvc(token, password);
    res.status(200).json({ message: "Password updated — you can sign in now." });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

/**
 * Verify an email from the token in the verification link.
 * GET /api/users/verify/:token
 */
export const verifyEmail = async (req, res) => {
  try {
    const token = req.params.token || req.query.token;
    const result = await verifyEmailSvc(token);
    res.status(200).json({ message: "Email verified — you're all set.", ...result });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

/**
 * Resend the verification email for the logged-in user.
 * POST /api/users/resend-verification
 */
export const resendVerification = async (req, res) => {
  try {
    const result = await resendVerificationSvc(req.user.id);
    res.status(200).json({
      message: result.alreadyVerified ? "Email already verified." : "Verification email sent.",
      ...result,
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

/**
 * Change the logged-in user's email, then send a verification link to it.
 * PUT /api/users/email  { email }
 */
export const updateEmail = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "A new email address is required" });
    const result = await updateEmailSvc(req.user.id, email);
    res.status(200).json({
      message: result.sent
        ? "Email updated — check the new inbox for a verification link."
        : "Email updated. We couldn't send the verification email yet; use \"Resend\" once mail is configured.",
      ...result,
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

/**
 * Handles user registration request.
 * POST /api/users/register
 */
export const registerUser = async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ message: "Username, email, and password are required" });
    }

    const { token, ...userData } = await registerSvc(username, email, password);
    res.status(201).json({ token, user: userData });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

/**
 * Handles user login request.
 * POST /api/users/login
 */
export const loginUser = async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) {
      return res.status(400).json({ message: "Identifier and password are required" });
    }

    const { token, ...userData } = await loginSvc(identifier, password);
    res.status(200).json({ token, user: userData });
  } catch (err) {
    res.status(401).json({ message: err.message });
  }
};

/**
 * Handles request to get the current authenticated user's profile.
 * GET /api/users/me
 */
export const getMe = async (req, res) => {
  try {
    const user = await getMeSvc(req.user.id);
    res.status(200).json({ user });
  } catch (err) {
    res.status(404).json({ message: err.message });
  }
};

/**
 * Handles request to update or add API keys for the current user.
 * POST /api/users/keys
 */
export const updateApiKeys = async (req, res) => {
    try {
        const userId = req.user.id;
        const { exchange, apiKey, apiSecret } = req.body;

        if (!exchange || !apiKey || !apiSecret) {
            return res.status(400).json({ message: 'Exchange, apiKey, and apiSecret are required' });
        }
        
        const updatedKeys = await updateKeysSvc(userId, exchange, apiKey, apiSecret);
        res.status(200).json({ message: 'API keys updated successfully', keys: updatedKeys });
    } catch (err) {
        console.error('[UserController] UpdateKeys error:', err.message);
        res.status(500).json({ message: "Failed to update API keys", error: err.message });
    }
};

/**
 * Handles request to fetch masked API keys.
 * GET /api/users/keys
 */
export const getApiKeys = async (req, res) => {
    try {
        const keys = await getKeysSvc(req.user.id);
        res.status(200).json(keys);
    } catch (err) {
        res.status(500).json({ message: "Failed to fetch keys", error: err.message });
    }
};

/**
 * Handles request to delete a specific exchange key.
 * DELETE /api/users/keys/:exchange
 */
export const deleteApiKey = async (req, res) => {
    try {
        const { exchange } = req.params;
        await deleteKeySvc(req.user.id, exchange);
        res.status(200).json({ message: `Key for ${exchange} deleted` });
    } catch (err) {
        res.status(500).json({ message: "Failed to delete key", error: err.message });
    }
};
