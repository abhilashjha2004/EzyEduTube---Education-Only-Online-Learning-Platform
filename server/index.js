const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const passport = require('passport');

const { sequelize } = require('./models');
require('./config/passport');

const app = express();
const PORT = process.env.PORT || 5000;

// ─── CORS ─────────────────────────────────────────────────────────────────────
const allowedOrigins = [
    'https://ezy-edu-tube-education-only-online.vercel.app',

    process.env.CLIENT_URL || 'http://localhost:5174',
    process.env.ADMIN_URL || 'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5173',
    'http://localhost:5175',
    'http://localhost:3000'
];

app.use(cors({
    origin: function (origin, callback) {

        // Allow localhost
        if (!origin || origin.startsWith('http://localhost:')) {
            return callback(null, true);
        }

        // Allow all vercel frontend domains
        if (origin.includes('vercel.app')) {
            return callback(null, true);
        }

        // Allow manually added origins
        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }

        return callback(new Error('Not allowed by CORS'));
    },
    credentials: true
}));

// ─── Core Middleware ──────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(passport.initialize());
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// ─── Routes ───────────────────────────────────────────────────────────────────
const authRoutes = require('./routes/auth');
const videoRoutes = require('./routes/videos');
const courseRoutes = require('./routes/courses');
const downloadRoutes = require('./routes/download');
const notificationRoutes = require('./routes/notifications');

app.use('/api/auth', authRoutes);
app.use('/api/videos', videoRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/download', downloadRoutes);
app.use('/api/notifications', notificationRoutes);

app.get('/', (_req, res) => res.json({ message: 'EzyEduTube API is running ✅', db: 'MySQL' }));

// ─── MySQL Sync + Start Server ────────────────────────────────────────────────
const startServer = async () => {
    try {
        // Test DB connection
        await sequelize.authenticate();
        console.log('✅  MySQL connected successfully.');

        // Log models loaded
        console.log('📦  Models loaded:', Object.keys(sequelize.models).join(', '));
        console.log('🔄  Starting Sequelize synchronization...');

        // Explicit try-catch around sync for detailed error logging
        try {
            const { VideoView } = require('./models');
            await VideoView.sync();
            console.log('✅  VideoView table synced/created successfully.');
        } catch (syncErr) {
            console.error('❌  Sequelize Sync Failed!');
            console.error('Error Name:', syncErr.name);
            console.error('Error Message:', syncErr.message);
            console.error('Error Details:', syncErr.parent ? syncErr.parent : syncErr);
            throw syncErr; // Bubble up to stop server from starting with broken DB
        }

        app.listen(PORT, () => {
            console.log(`🚀  Server running on port ${PORT}`);
        });
    } catch (err) {
        console.error('❌  Critical Server Error:');
        console.error(err);
        process.exit(1);
    }
};

startServer();
