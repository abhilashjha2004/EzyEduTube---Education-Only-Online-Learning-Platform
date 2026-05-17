const { Op } = require('sequelize');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { Video, Comment, User, Course, Document, VideoView } = require('../models');
const { uploadToCloudinary, cloudinary } = require('../config/cloudinary');
const AIClassifier = require('../services/AIClassifier');
const MetadataFetcher = require('../services/MetadataFetcher');

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
const formatVideo = (video) => {
    try {
        const json = video.toJSON ? video.toJSON() : video;
        let likesArray = [];
        if (video.likedBy && Array.isArray(video.likedBy)) {
            likesArray = video.likedBy.map(u => u.id || u._id || u);
        } else if (json.likedBy && Array.isArray(json.likedBy)) {
            likesArray = json.likedBy.map(u => u.id || u._id || u);
        }
        return {
            ...json,
            _id: json.id,
            likes: likesArray
        };
    } catch (err) {
        console.error('[formatVideo Debug] Warning formatting video:', err.message);
        return {
            ...video,
            _id: video.id,
            likes: []
        };
    }
};

// ─── GET ALL VIDEOS ────────────────────────────────────────────────────────────
const getAllVideos = async (req, res) => {
    try {
        console.log(`[GET /api/videos] Request received. User authenticated: ${req.user ? 'Yes (' + req.user.id + ')' : 'No (Guest)'}`);

        // Determine moderation feature launch date (e.g. May 11, 2026) for legacy null check
        const MODERATION_LAUNCH_DATE = new Date('2026-05-11T00:00:00.000Z');
        const whereClause = {
            [Op.or]: [
                { status: 'approved', isEducational: true },
                { status: 'approved', reviewedByAI: false },
                {
                    status: null,
                    createdAt: { [Op.lt]: MODERATION_LAUNCH_DATE }
                }
            ]
        };

        let videos = [];
        try {
            console.log('[GET /api/videos] Attempting to query Video.findAll with full associations...');
            videos = await Video.findAll({
                where: whereClause,
                include: [
                    { model: User, as: 'uploader', attributes: ['id', 'username', 'avatar'] },
                    { model: Course, as: 'course', attributes: ['id', 'title'] },
                    { model: User, as: 'likedBy', attributes: ['id'] }
                ],
                order: [['createdAt', 'DESC']]
            });
            console.log(`[GET /api/videos] Rich query successful. Fetched ${videos.length} videos.`);
        } catch (queryErr) {
            console.error('[GET /api/videos] Rich query failed, executing fallback query without includes:', queryErr.message);
            // Fallback: Query all videos without associations to guarantee API returns data.
            const rawVideos = await Video.findAll({
                where: whereClause,
                order: [['createdAt', 'DESC']]
            });
            
            // Populating minimal mock/safe uploader, course, and likes for each raw video to prevent React crashes.
            videos = await Promise.all(rawVideos.map(async (v) => {
                const videoJson = v.toJSON ? v.toJSON() : v;
                
                // Safe uploader fetch fallback
                let uploader = null;
                if (videoJson.uploaderId) {
                    try {
                        uploader = await User.findByPk(videoJson.uploaderId, {
                            attributes: ['id', 'username', 'avatar']
                        });
                    } catch (e) {
                        console.error(`[GET /api/videos] Safe uploader fetch failed for user ${videoJson.uploaderId}:`, e.message);
                    }
                }
                
                // Safe course fetch fallback
                let course = null;
                if (videoJson.courseId) {
                    try {
                        course = await Course.findByPk(videoJson.courseId, {
                            attributes: ['id', 'title']
                        });
                    } catch (e) {
                        console.error(`[GET /api/videos] Safe course fetch failed for course ${videoJson.courseId}:`, e.message);
                    }
                }

                // Safe likes fetch fallback
                let likedBy = [];
                try {
                    likedBy = await v.getLikedBy({ attributes: ['id'] }).catch(() => []);
                } catch (e) {
                    console.error('[GET /api/videos] Safe likes fetch failed:', e.message);
                }

                v.uploader = uploader;
                v.course = course;
                v.likedBy = likedBy;
                
                return v;
            }));
            console.log(`[GET /api/videos] Fallback query processed ${videos.length} videos successfully.`);
        }

        res.json(videos.map(formatVideo));
    } catch (err) {
        console.error('[GET /api/videos] Critical global error fetching videos:', err.message);
        res.status(500).json({ message: err.message });
    }
};

// ─── GET SINGLE VIDEO ─────────────────────────────────────────────────────────
const getVideoById = async (req, res) => {
    try {
        console.log(`[GET /api/videos/${req.params.id}] Fetching video...`);
        let video = null;
        try {
            video = await Video.findByPk(req.params.id, {
                include: [
                    { model: User, as: 'uploader', attributes: ['id', 'username', 'avatar'] },
                    { model: Course, as: 'course', attributes: ['id', 'title'] },
                    { model: User, as: 'likedBy', attributes: ['id'] },
                    {
                        model: Comment, as: 'comments',
                        include: [{ model: User, as: 'user', attributes: ['id', 'username', 'avatar'] }],
                        order: [['createdAt', 'DESC']]
                    }
                ]
            });
        } catch (queryErr) {
            console.error(`[GET /api/videos/${req.params.id}] Rich single-query failed, executing fallback:`, queryErr.message);
            const rawVideo = await Video.findByPk(req.params.id);
            if (rawVideo) {
                const videoJson = rawVideo.toJSON ? rawVideo.toJSON() : rawVideo;
                
                let uploader = null;
                if (videoJson.uploaderId) {
                    uploader = await User.findByPk(videoJson.uploaderId, { attributes: ['id', 'username', 'avatar'] }).catch(() => null);
                }
                
                let course = null;
                if (videoJson.courseId) {
                    course = await Course.findByPk(videoJson.courseId, { attributes: ['id', 'title'] }).catch(() => null);
                }
                
                let likedBy = [];
                try {
                    likedBy = await rawVideo.getLikedBy({ attributes: ['id'] }).catch(() => []);
                } catch { }
                
                let comments = [];
                try {
                    comments = await Comment.findAll({
                        where: { videoId: req.params.id },
                        include: [{ model: User, as: 'user', attributes: ['id', 'username', 'avatar'] }],
                        order: [['createdAt', 'DESC']]
                    }).catch(() => []);
                } catch { }

                rawVideo.uploader = uploader;
                rawVideo.course = course;
                rawVideo.likedBy = likedBy;
                rawVideo.comments = comments;
                
                video = rawVideo;
            }
        }

        if (!video) return res.status(404).json({ message: 'Video not found' });

        const comments = video.comments || [];
        res.json({ video: formatVideo(video), comments });
    } catch (err) {
        console.error(`[GET /api/videos/${req.params.id}] Critical global error:`, err.message);
        res.status(500).json({ message: err.message });
    }
};

// ─── UPLOAD VIDEO ─────────────────────────────────────────────────────────────
const YouTubeValidator = require('../services/YouTubeValidator');


const uploadVideo = async (req, res) => {
    try {
        const uploaderId = req.user.id;
        const isExternal = req.body.isExternal === 'true';
        let videoUrl = '';
        let sourceType = 'upload';

        let title = req.body.title || '';
        let description = req.body.description || '';
        let tags = '';

        let contentType = 'Video';
        let platform = 'Direct Upload';

        if (isExternal) {
            const externalLink = req.body.externalLink;
            if (!externalLink) return res.status(400).json({ message: 'External link is required' });

            try {
                const parsed = new URL(externalLink);
                platform = parsed.hostname.replace('www.', '');
            } catch (e) {
                platform = 'Unknown Link';
            }
            contentType = 'External Link';

            if (externalLink.includes('youtube.com') || externalLink.includes('youtu.be')) {
                const validation = await YouTubeValidator.validate(externalLink);
                if (!validation.isValid) {
                    return res.status(400).json({ message: `Content Blocked by YouTube Validator: ${validation.reason}` });
                }
                if (validation.data) {
                    title = title || validation.data.title;
                    description = description || validation.data.description;
                    tags = validation.data.tags.join(', ');
                }
            } else {
                const metadata = await MetadataFetcher.fetch(externalLink);
                title = title || metadata.title;
                description = description || metadata.description;
                if (metadata.tags && metadata.tags.length > 0) {
                    tags = tags ? `${tags}, ${metadata.tags.join(', ')}` : metadata.tags.join(', ');
                }
            }
            videoUrl = externalLink;
            sourceType = 'external';
        } else {
            // Frontend direct Cloudinary URL
            if (req.body.videoUrl) {
                videoUrl = req.body.videoUrl;
            } else {
                return res.status(400).json({ message: 'Video URL is required for upload mode' });
            }
        }

        // Thumbnail
        let thumbnailUrl = req.body.thumbnailUrl || '';

        // Run AI Moderation SYNCHRONOUSLY before saving to DB
        console.log(`\n==================================================`);
        console.log(`[UPLOAD DEBUG] ⏳ Starting strict synchronous AI moderation...`);
        console.log(`[UPLOAD DEBUG] Title: "${title}"`);
        console.log(`[UPLOAD DEBUG] Extracted Video URL: ${videoUrl}`);
        console.log(`==================================================\n`);
        
        const aiResult = await AIClassifier.analyzeVideoAsync({
            videoId: 'temp', // Not saved yet
            videoUrl,
            title,
            description,
            tags,
            isExternal,
            contentType,
            platform
        });

        console.log("[MODERATION RESULT]", aiResult);

        if (!aiResult.allowed) {
            console.log(`[UPLOAD DEBUG] ❌ Moderation Decision: REJECTED`);
            console.log(`[UPLOAD DEBUG] 📝 Rejection Reason: ${aiResult.reason}`);
            
            // Auto-delete from Cloudinary if it was a local file upload (not an external link)
            if (!isExternal && videoUrl.includes('cloudinary.com')) {
                try {
                    // Extract public ID from Cloudinary URL (e.g. ezyedutube/videos/filename)
                    const urlParts = videoUrl.split('/');
                    const filenameWithExt = urlParts.pop();
                    const folder = urlParts.pop(); // videos
                    const parentFolder = urlParts.pop(); // ezyedutube
                    const filename = filenameWithExt.split('.')[0];
                    const publicId = `${parentFolder}/${folder}/${filename}`;
                    
                    console.log(`[UPLOAD DEBUG] 🗑️ Triggering Cloudinary Cleanup for: ${publicId}`);
                    const deleteResult = await cloudinary.uploader.destroy(publicId, { resource_type: "video" });
                    console.log(`[UPLOAD DEBUG] 🗑️ Cloudinary Delete Result:`, deleteResult);
                } catch (cleanupErr) {
                    console.error('[UPLOAD DEBUG] ❌ Failed to delete video from Cloudinary:', cleanupErr);
                }
            } else {
                console.log(`[UPLOAD DEBUG] Skipped Cloudinary cleanup (external link or invalid URL).`);
            }
            
            // Reject request with proper error message. Prevent DB save.
            console.log("[DB INSERT BLOCKED]");
            return res.status(400).json({ 
                success: false,
                message: "This resource is not educational and cannot be uploaded.",
                reason: aiResult.reason
            });
        }

        // Final Safeguard before DB insertion
        if (!aiResult.allowed) {
            console.log("[DB INSERT BLOCKED]");
            return res.status(400).json({
                success: false,
                message: "This resource is not educational and cannot be uploaded."
            });
        }

        console.log(`[UPLOAD DEBUG] ✅ Moderation Decision: APPROVED for: "${title}"`);
        console.log(`[UPLOAD DEBUG] 💾 Triggering DB Save...`);

        // Create approved video record in MySQL
        const newVideo = await Video.create({
            title: title,
            description: description,
            subject: req.body.subject || 'General',
            videoUrl,
            thumbnailUrl,
            sourceType,
            duration: parseInt(req.body.duration) || 0,
            uploaderId,
            courseId: req.body.courseId || null,
            orderIndex: 0,
            status: 'approved',
            isEducational: true,
            moderationScore: aiResult.score,
            reviewedByAI: true,
            approvedAt: new Date()
        });

        console.log("[VIDEO SAVED]");

        res.status(201).json({
            success: true,
            message: "Upload successful. Video passed strict AI moderation.",
            video: formatVideo(newVideo)
        });
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

        res.json({ likes: updated.likedBy.map(u => u.id), liked: !alreadyLiked });
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

        res.json({ subscribers: updated.subscribers.map(s => s.id), subscribed: !alreadySubbed });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// ─── INCREMENT VIEW ────────────────────────────────────────────────────────────
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey_eduhub_2026';

const incrementView = async (req, res) => {
    try {
        const video = await Video.findByPk(req.params.id);
        if (!video) return res.status(404).json({ message: 'Video not found' });

        // Cooldown period: 24 hours
        const COOLDOWN_HOURS = 24;
        const cooldownTime = new Date(Date.now() - COOLDOWN_HOURS * 60 * 60 * 1000);

        // Optional User identification from JWT
        const authHeader = req.headers.authorization;
        let userId = null;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            try {
                const decoded = jwt.verify(token, JWT_SECRET);
                userId = decoded.id;
            } catch (err) {
                // Ignore, treat as guest
            }
        }

        const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
        const userAgent = req.headers['user-agent'] || 'unknown';

        let existingView = null;

        if (userId) {
            // Registered user tracking: check userId + videoId
            existingView = await VideoView.findOne({
                where: {
                    videoId: video.id,
                    userId: userId,
                    viewedAt: {
                        [Op.gt]: cooldownTime
                    }
                }
            });
        } else {
            // Guest user tracking: check ipAddress + userAgent + videoId
            existingView = await VideoView.findOne({
                where: {
                    videoId: video.id,
                    ipAddress: ipAddress,
                    userAgent: userAgent,
                    userId: null,
                    viewedAt: {
                        [Op.gt]: cooldownTime
                    }
                }
            });
        }

        if (existingView) {
            // Duplicate/refresh detected within 24h: bypass view incrementing
            return res.json({ views: video.views });
        }

        // Create view entry
        await VideoView.create({
            videoId: video.id,
            userId: userId,
            ipAddress: ipAddress,
            userAgent: userAgent
        });

        // Increment views
        await video.increment('views', { by: 1 });
        const updatedVideo = await Video.findByPk(video.id);

        res.json({ views: updatedVideo.views });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// ─── DELETE COMMENT ────────────────────────────────────────────────────────────
const deleteComment = async (req, res) => {
    try {
        const { commentId } = req.params;
        const comment = await Comment.findByPk(commentId, {
            include: [{ model: Video, as: 'video' }]
        });
        if (!comment) return res.status(404).json({ message: 'Comment not found' });

        const userId = req.user.id;
        const isCommentOwner = comment.userId === userId;
        const isVideoOwner = comment.video && comment.video.uploaderId === userId;

        if (!isCommentOwner && !isVideoOwner) {
            return res.status(403).json({ message: 'Unauthorized to delete this comment' });
        }

        await comment.destroy();
        res.json({ success: true, message: 'Comment deleted successfully' });
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
    deleteComment,
    shareVideo
};
