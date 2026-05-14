const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const crypto = require('crypto');

// Lazy-load User to avoid circular import issues at startup
let User;
const getUser = () => {
    if (!User) User = require('../models').User;
    return User;
};

// Guard: skip strategy registration if Google env vars are missing
if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_CALLBACK_URL) {
    console.warn('⚠️  Google OAuth env vars not set – Google login will be disabled.');
} else {
    passport.use(
        new GoogleStrategy(
            {
                clientID: process.env.GOOGLE_CLIENT_ID,
                clientSecret: process.env.GOOGLE_CLIENT_SECRET,
                // Force the correct Render backend callback URL, ignoring any incorrect env vars
                callbackURL: 'https://ezyedutube-backend.onrender.com/api/auth/google/callback'
            },
            async (_accessToken, _refreshToken, profile, done) => {
                try {
                    const UserModel = getUser();
                    let user = await UserModel.findOne({ where: { googleId: profile.id } });

                    if (!user) {
                        let username = profile.displayName.replace(/\s+/g, '_').toLowerCase();
                        const exists = await UserModel.findOne({ where: { username } });
                        if (exists) username += '_' + Date.now().toString().slice(-4);

                        user = await UserModel.create({
                            username,
                            googleId: profile.id,
                            avatar: profile.photos?.[0]?.value || '',
                            email: profile.emails?.[0]?.value || null,
                            password: crypto.randomBytes(16).toString('hex'),
                            role: 'user'
                        });
                    }

                    return done(null, user);
                } catch (err) {
                    return done(err, null);
                }
            }
        )
    );

    console.log('✅  Google Passport strategy registered');
}