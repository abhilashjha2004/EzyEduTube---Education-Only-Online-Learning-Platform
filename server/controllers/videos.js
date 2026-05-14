const { Op } = require('sequelize');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { Video, Comment, User, Course, Document } = require('../models');
const { uploadToCloudinary } = require('../config/cloudinary');
const AIClassifier = require('../services/AIClassifier');

// ─── Cloudinary availability check ────────────────────────────────────────────
const cloudinaryConfigured = () =>
    !!(process.env.CLOUDINARY_CLOUD_NAME &&
       process.env.CLOUDINARY_CLOUD_NAME !== 'your_cloud_name' &&
       process.env.CLOUDINARY_API_KEY &&
       process.env.CLOUDINARY_API_KEY !== 'your_api_key');

// ─── Smart upload: Cloudinary if configured, else save locally ────────────────
const saveFile = async (buffer, originalName, subfolder, resourceType = 'auto') => {
    if (cloudinaryConfigured()) {
        return await uploadToCloudinary(buffer, subfolder, resourceType);
    }
    // Local fallback — save to server/uploads/<subfolder>/
    const uploadDir = path.join(__dirname, '..', 'uploads', subfolder);
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    const safeName = `${Date.now()}-${originalName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const filePath = path.join(uploadDir, safeName);
    fs.writeFileSync(filePath, buffer);
    // Return a URL relative to the server
    return `/uploads/${subfolder}/${safeName}`;
};

// ─── Validation Helpers ───────────────────────────────────────────────────────

const ALLOWED_DOMAINS = [
    'youtube.com', 'youtu.be', 'vimeo.com', 'coursera.org',
    'udemy.com', 'edx.org', 'khanacademy.org', 'wikipedia.org'
];

const isEducationalLink = (url) => {
    try {
        const domain = new URL(url).hostname.replace('www.', '');
        return ALLOWED_DOMAINS.some(d => domain.includes(d));
    } catch { return false; }
};

const checkYouTubeCategory = async (url) => {
    try {
        const { data } = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/91.0.4472.124 Safari/537.36' },
            timeout: 5000 // Prevent hanging requests from causing 504 Gateway Timeout
        });
        const $ = cheerio.load(data);
        const genre = $('meta[itemprop="genre"]').attr('content');
        const categoryMatch = data.match(/"category":"(.*?)"/);
        const foundCategory = genre || (categoryMatch && categoryMatch[1]) || 'Unknown';
        
        const title = $('title').text() || $('meta[name="title"]').attr('content') || '';
        const description = $('meta[name="description"]').attr('content') || '';

        const EDU_CATEGORIES = ['Education', 'Science & Technology', 'Howto & Style', 'News & Politics', 'Nonprofits & Activism'];
        let isEdu = EDU_CATEGORIES.includes(foundCategory);
        if (foundCategory === 'Unknown') isEdu = true; // Let AIClassifier decide if category is missing

        return { 
            isEdu, 
            fetchedTitle: title, 
            fetchedDesc: description 
        };
    } catch (error) { 
        console.error('YouTube Fetch Warning (non-fatal):', error.message);
        // If YouTube blocks the request (e.g., 429 Too Many Requests), don't fail the upload.
        // Instead, assume true and let the AIClassifier handle title/desc validation.
        return { isEdu: true, fetchedTitle: '', fetchedDesc: '' }; 
    }
};

// ─── Helper ────────────────────────────────────────────────────────────────────
const formatVideo = (video) => ({
    ...video.toJSON(),
    _id: video.id,   // backward-compat alias
    likes: video.likedBy ? video.likedBy.length : 0
});

// ─── GET ALL VIDEOS ────────────────────────────────────────────────────────────
const getAllVideos = async (req, res) => {
    try {
        console.log(`[GET /api/videos] Request received. User authenticated: ${req.user ? 'Yes (' + req.user.id + ')' : 'No (Guest)'}`);
        
        // Fetching all videos globally without filtering by logged-in user or history
        const videos = await Video.findAll({
            include: [
                { model: User, as: 'uploader', attributes: ['id', 'username', 'avatar'] },
                { model: Course, as: 'course', attributes: ['id', 'title'] }
            ],
            order: [['createdAt', 'DESC']]
        });
        
        console.log(`[GET /api/videos] Successfully fetched ${videos.length} videos from the global Video table.`);
        res.json(videos.map(formatVideo));
    } catch (err) {
        console.error('[GET /api/videos] Error fetching videos:', err.message);
        res.status(500).json({ message: err.message });
    }
};

// ─── GET SINGLE VIDEO ─────────────────────────────────────────────────────────
const getVideoById = async (req, res) => {
    try {
        const video = await Video.findByPk(req.params.id, {
            include: [
                { model: User, as: 'uploader', attributes: ['id', 'username', 'avatar'] },
                { model: Course, as: 'course', attributes: ['id', 'title'] },
                {
                    model: Comment, as: 'comments',
                    include: [{ model: User, as: 'user', attributes: ['id', 'username', 'avatar'] }],
                    order: [['createdAt', 'DESC']]
                }
            ]
        });
        if (!video) return res.status(404).json({ message: 'Video not found' });

        // Increment views
        await video.increment('views');

        const comments = video.comments || [];
        res.json({ video: formatVideo(video), comments });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// ─── UPLOAD VIDEO ─────────────────────────────────────────────────────────────
const uploadVideo = async (req, res) => {
    try {
        const uploaderId = req.user.id;
        const isExternal = req.body.isExternal === 'true';
        let videoUrl = '';
        let sourceType = 'upload';

        if (isExternal) {
            const externalLink = req.body.externalLink;
            if (!externalLink) return res.status(400).json({ message: 'External link is required' });
            if (!isEducationalLink(externalLink))
                return res.status(400).json({ message: 'Blocked: Only links from major educational platforms are allowed.' });

            let extraText = '';
            if (externalLink.includes('youtube.com') || externalLink.includes('youtu.be')) {
                const { isEdu, fetchedTitle, fetchedDesc } = await checkYouTubeCategory(externalLink);
                if (!isEdu)
                    return res.status(400).json({ message: 'Content Blocked: This YouTube video is not categorised as educational.' });
                extraText = `${fetchedTitle} ${fetchedDesc}`;
            }

            // Apply AI text guard to external links too
            const aiResult = AIClassifier.analyzeText(req.body.title || '', req.body.description || '', extraText);
            if (!aiResult.allowed) {
                return res.status(400).json({
                    message: `Upload Rejected by AI Guard: ${aiResult.reason}. Content appears non-educational.`
                });
            }
            videoUrl = externalLink;
            sourceType = 'external';
        } else {
            const videoFile = req.files && req.files['video'] ? req.files['video'][0] : null;
            if (!videoFile) return res.status(400).json({ message: 'Video file is required' });

            // AI content guard
            const tempPath = path.join(os.tmpdir(), `${Date.now()}_${videoFile.originalname}`);
            fs.writeFileSync(tempPath, videoFile.buffer);

            let aiResult = { allowed: true };
            try {
                aiResult = await AIClassifier.analyzeContent(tempPath, req.body.title, req.body.description);
            } catch (aiErr) {
                console.warn('AI Classifier error (non-fatal):', aiErr.message);
            } finally {
                if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
            }

            if (!aiResult.allowed) {
                return res.status(400).json({
                    message: `Upload Rejected by AI Guard: ${aiResult.reason}. Content appears non-educational.`
                });
            }

            // Save video (Cloudinary or local)
            videoUrl = await saveFile(videoFile.buffer, videoFile.originalname, 'videos', 'video');
        }

        // Thumbnail
        let thumbnailUrl = '';
        const thumbFile = req.files && req.files['thumbnail'] ? req.files['thumbnail'][0] : null;
        if (thumbFile) {
            try {
                thumbnailUrl = await saveFile(thumbFile.buffer, thumbFile.originalname, 'thumbnails', 'image');
            } catch { /* non-fatal */ }
        }

        // Resource documents
        const resourceFiles = req.files && req.files['resources'] ? req.files['resources'] : [];
        const documentRecords = [];
        for (const file of resourceFiles) {
            try {
                const docUrl = await saveFile(file.buffer, file.originalname, 'documents', 'raw');
                documentRecords.push({ title: file.originalname, documentUrl: docUrl, type: 'pdf' });
            } catch { /* skip */ }
        }

        // Create video record in MySQL
        const newVideo = await Video.create({
            title: req.body.title,
            description: req.body.description || '',
            subject: req.body.subject || 'General',
            videoUrl,
            thumbnailUrl,
            sourceType,
            duration: parseInt(req.body.duration) || 0,
            uploaderId,
            courseId: req.body.courseId || null,
            orderIndex: 0
        });

        // Attach documents
        if (documentRecords.length > 0) {
            await Document.bulkCreate(
                documentRecords.map(d => ({ ...d, courseId: req.body.courseId || null }))
            );
        }

        console.log(`✅  Video saved: "${newVideo.title}" | URL: ${videoUrl.slice(0, 60)}`);
        res.status(201).json(formatVideo(newVideo));
    } catch (err) {
        console.error('Upload Error Detailed:', err);
        res.status(500).json({ message: err.message || 'An unexpected error occurred during upload.' });
    }
};

// ─── DELETE VIDEO (Admin) ─────────────────────────────────────────────────────
const deleteVideoAdmin = async (req, res) => {
    try {
        const video = await Video.findByPk(req.params.id);
        if (!video) return res.status(404).json({ message: 'Video not found' });

        await Comment.destroy({ where: { videoId: req.params.id } });
        await video.destroy();

        res.json({ message: 'Video deleted by admin' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// ─── DELETE VIDEO (Owner) ─────────────────────────────────────────────────────
const deleteVideoUser = async (req, res) => {
    try {
        const video = await Video.findByPk(req.params.id);
        if (!video) return res.status(404).json({ message: 'Video not found' });
        if (video.uploaderId !== req.user.id)
            return res.status(403).json({ message: 'Not authorized to delete this video' });

        await Comment.destroy({ where: { videoId: req.params.id } });
        await video.destroy();

        res.json({ message: 'Video deleted' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// ─── POST COMMENT ─────────────────────────────────────────────────────────────
const postComment = async (req, res) => {
    try {
        const { userId, content } = req.body;
        if (!userId || !content) return res.status(400).json({ message: 'userId and content required' });

        const newComment = await Comment.create({
            content,
            userId,
            videoId: req.params.id
        });

        const populated = await Comment.findByPk(newComment.id, {
            include: [{ model: User, as: 'user', attributes: ['id', 'username', 'avatar'] }]
        });

        res.status(201).json({ ...populated.toJSON(), _id: populated.id });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// ─── LIKE / UNLIKE ────────────────────────────────────────────────────────────
const likeVideo = async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) return res.status(401).json({ message: 'Login required' });

        const video = await Video.findByPk(req.params.id, {
            include: [{ model: User, as: 'likedBy', attributes: ['id'] }]
        });
        if (!video) return res.status(404).json({ message: 'Video not found' });

        const alreadyLiked = video.likedBy.some(u => u.id === parseInt(userId));
        if (alreadyLiked) {
            await video.removeLikedBy(userId);
        } else {
            await video.addLikedBy(userId);
        }

        const updated = await Video.findByPk(req.params.id, {
            include: [{ model: User, as: 'likedBy', attributes: ['id'] }]
        });

        res.json({ likes: updated.likedBy.length, liked: !alreadyLiked });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// ─── SUBSCRIBE / UNSUBSCRIBE ──────────────────────────────────────────────────
const subscribeVideo = async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) return res.status(401).json({ message: 'Login required' });

        const video = await Video.findByPk(req.params.id, { attributes: ['uploaderId'] });
        if (!video) return res.status(404).json({ message: 'Video not found' });

        const uploaderId = video.uploaderId;
        if (uploaderId === parseInt(userId))
            return res.status(400).json({ message: 'Cannot subscribe to yourself' });

        const channel = await User.findByPk(uploaderId, {
            include: [{ model: User, as: 'subscribers', attributes: ['id'] }]
        });
        if (!channel) return res.status(404).json({ message: 'Channel not found' });

        const alreadySubbed = channel.subscribers.some(s => s.id === parseInt(userId));

        if (alreadySubbed) {
            await channel.removeSubscribers(userId);
        } else {
            await channel.addSubscribers(userId);
        }

        const updated = await User.findByPk(uploaderId, {
            include: [{ model: User, as: 'subscribers', attributes: ['id'] }]
        });

        res.json({ subscribers: updated.subscribers.length, subscribed: !alreadySubbed });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// ─── INCREMENT VIEW ────────────────────────────────────────────────────────────
const incrementView = async (req, res) => {
    try {
        const video = await Video.findByPk(req.params.id);
        if (!video) return res.status(404).json({ message: 'Video not found' });
        await video.increment('views');
        res.json({ views: video.views + 1 });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// ─── SHARE COUNT ───────────────────────────────────────────────────────────────
const shareVideo = async (req, res) => {
    try {
        const video = await Video.findByPk(req.params.id);
        if (!video) return res.status(404).json({ message: 'Video not found' });
        res.json({ message: 'Share recorded', shares: 0 });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

module.exports = {
    getAllVideos,
    getVideoById,
    uploadVideo,
    deleteVideoAdmin,
    deleteVideoUser,
    postComment,
    likeVideo,
    subscribeVideo,
    incrementView,
    shareVideo
};
