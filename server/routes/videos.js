const express = require('express');
const router = express.Router();
const multer = require('multer');
const authMiddleware = require('../middleware/authMiddleware');
const isAdmin = require('../middleware/isAdmin');
const videoController = require('../controllers/videos');
const { uploadVideoFields } = require('../config/cloudinary');
const { uploadLimiter } = require('../middleware/rateLimiter');

// --- ROUTES ---

// GET ALL VIDEOS
router.get('/', videoController.getAllVideos);

// GET SINGLE VIDEO
router.get('/:id', videoController.getVideoById);


// UPLOAD VIDEO (Handles direct cloudinary URLs and final backend processing)
// We still pass uploadVideoFields just in case local fallback is used or thumbnails/resources are sent
router.post('/upload', uploadLimiter, authMiddleware, uploadVideoFields, videoController.uploadVideo);

// DELETE VIDEO (Admin Only)
router.delete('/:id', authMiddleware, isAdmin, videoController.deleteVideoAdmin);

// DELETE VIDEO (User owning the video)
router.delete('/my-video/:id', authMiddleware, videoController.deleteVideoUser);

// POST COMMENT
router.post('/:id/comments', videoController.postComment);

// DELETE COMMENT
router.delete('/comments/:commentId', authMiddleware, videoController.deleteComment);

// LIKE / UNLIKE
router.post('/:id/like', videoController.likeVideo);

// SUBSCRIBE / UNSUBSCRIBE
router.post('/:id/subscribe', videoController.subscribeVideo);

// VIEW INCREMENT
router.post('/:id/view', videoController.incrementView);

// SHARE COUNT
router.post('/:id/share', videoController.shareVideo);

module.exports = router;
