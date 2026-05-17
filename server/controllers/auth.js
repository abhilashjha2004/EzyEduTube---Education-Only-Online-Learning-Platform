const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User } = require('../models');

// Use explicit production URL to avoid Vercel preview auth intercept
// We intentionally do NOT use process.env.CLIENT_URL here because Render dashboard overrides might contain old Vercel preview domains
const CLIENT_URL = 'https://ezy-edu-tube-education-only-online.vercel.app';
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey_eduhub_2026';

const googleConfigured = () =>
    !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

// ─── Helper: Build safe user payload ─────────────────────────────────────────
const safeUser = (user) => ({
    _id: user.id,
    id: user.id,
    username: user.username,
    email: user.email || '',
    avatar: user.avatar || '',
    role: user.role
});

// ─── Register ─────────────────────────────────────────────────────────────────
const register = async (req, res) => {
    try {
        const { username, password, email } = req.body;
        if (!username || !password)
            return res.status(400).json({ message: 'Username and password required' });
        if (password.length < 6)
            return res.status(400).json({ message: 'Password must be at least 6 characters' });

        const existing = await User.findOne({ where: { username } });
        if (existing)
            return res.status(400).json({ message: 'Username already taken' });

        const hashed = await bcrypt.hash(password, 10);
        const user = await User.create({ username, password: hashed, email: email || null });

        const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
        res.status(201).json({ user: safeUser(user), token });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// ─── Login ────────────────────────────────────────────────────────────────────
const login = async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ where: { username } });
        if (!user) return res.status(400).json({ message: 'Invalid username or password' });

        const match = await bcrypt.compare(password, user.password || '');
        if (!match) return res.status(400).json({ message: 'Invalid username or password' });

        const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ user: safeUser(user), token });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// ─── Get User By Id ───────────────────────────────────────────────────────────
const getUserById = async (req, res) => {
    try {
        const user = await User.findByPk(req.params.id, {
            attributes: { exclude: ['password'] },
            include: [{ model: User, as: 'subscribers', attributes: ['id'] }]
        });
        if (!user) return res.status(404).json({ message: 'User not found' });
        
        const payload = safeUser(user);
        payload.subscribers = user.subscribers ? user.subscribers.map(s => s.id) : [];
        res.json(payload);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// ─── Google OAuth ─────────────────────────────────────────────────────────────
const passport = require('passport');

const googleOAuthStart = (req, res, next) => {
    if (!googleConfigured()) {
        return res.status(503).json({
            message: 'Google OAuth is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to server/.env'
        });
    }
    passport.authenticate('google', { scope: ['profile', 'email'], session: false })(req, res, next);
};

const googleOAuthCallback = (req, res, next) => {
    if (!googleConfigured()) {
        return res.redirect(`${CLIENT_URL}/login?error=google_not_configured`);
    }
    passport.authenticate('google', {
        session: false,
        failureRedirect: `${CLIENT_URL}/login?error=google`
    })(req, res, (err) => {
        if (err) return res.redirect(`${CLIENT_URL}/login?error=google`);
        const user = req.user;
        const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
        const payload = JSON.stringify({ user: safeUser(user), token });
        res.redirect(`${CLIENT_URL}/auth/callback?user=${encodeURIComponent(payload)}`);
    });
};

module.exports = {
    register,
    login,
    getUserById,
    googleOAuthStart,
    googleOAuthCallback
};
