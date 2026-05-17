const sequelize = require('../config/database');
const User = require('./User');
const Course = require('./Course');
const Video = require('./Video');
const Document = require('./Document');
const Enrollment = require('./Enrollment');
const Progress = require('./Progress');
const Comment = require('./Comment');
const Notification = require('./Notification');
const VideoView = require('./VideoView');

// ─── Associations ─────────────────────────────────────────────────────────────

// One Teacher → Many Courses
User.hasMany(Course, { foreignKey: 'teacherId', as: 'courses' });
Course.belongsTo(User, { foreignKey: 'teacherId', as: 'teacher' });

// One Course → Many Videos
Course.hasMany(Video, { foreignKey: 'courseId', as: 'videos', onDelete: 'CASCADE' });
Video.belongsTo(Course, { foreignKey: 'courseId', as: 'course' });

// One Course → Many Documents
Course.hasMany(Document, { foreignKey: 'courseId', as: 'documents', onDelete: 'CASCADE' });
Document.belongsTo(Course, { foreignKey: 'courseId', as: 'course' });

// One Student → Many Enrollments
User.hasMany(Enrollment, { foreignKey: 'studentId', as: 'enrollments' });
Enrollment.belongsTo(User, { foreignKey: 'studentId', as: 'student' });

// One Course → Many Enrollments
Course.hasMany(Enrollment, { foreignKey: 'courseId', as: 'enrollments', onDelete: 'CASCADE' });
Enrollment.belongsTo(Course, { foreignKey: 'courseId', as: 'course' });

// Video Progress (through enrollment)
User.hasMany(Progress, { foreignKey: 'studentId', as: 'progress' });
Progress.belongsTo(User, { foreignKey: 'studentId', as: 'student' });

Video.hasMany(Progress, { foreignKey: 'videoId', as: 'progress', onDelete: 'CASCADE' });
Progress.belongsTo(Video, { foreignKey: 'videoId', as: 'video' });

// One Video → Many Comments
Video.hasMany(Comment, { foreignKey: 'videoId', as: 'comments', onDelete: 'CASCADE' });
Comment.belongsTo(Video, { foreignKey: 'videoId', as: 'video' });

// One User → Many Comments
User.hasMany(Comment, { foreignKey: 'userId', as: 'comments' });
Comment.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// Notifications → Recipient User
User.hasMany(Notification, { foreignKey: 'recipientId', as: 'notifications', onDelete: 'CASCADE' });
Notification.belongsTo(User, { foreignKey: 'recipientId', as: 'recipient' });

// ─── Video Uploader (standalone videos not in a course) ───────────────────────
User.hasMany(Video, { foreignKey: 'uploaderId', as: 'uploads' });
Video.belongsTo(User, { foreignKey: 'uploaderId', as: 'uploader' });

// ─── Subscriptions (self-referential many-to-many) ───────────────────────────
User.belongsToMany(User, {
    through: 'Subscriptions',
    as: 'subscribers',
    foreignKey: 'channelId',
    otherKey: 'subscriberId'
});
User.belongsToMany(User, {
    through: 'Subscriptions',
    as: 'subscriptions',
    foreignKey: 'subscriberId',
    otherKey: 'channelId'
});

// ─── Video Likes (many-to-many) ────────────────────────────────────────────────
User.belongsToMany(Video, { through: 'Videolikes', as: 'likedVideos', foreignKey: 'userId' });
Video.belongsToMany(User, { through: 'Videolikes', as: 'likedBy', foreignKey: 'videoId' });

// ─── Video Views (one-to-many) ───────────────────────────────────────────────
Video.hasMany(VideoView, { foreignKey: 'videoId', as: 'videoViews', onDelete: 'CASCADE' });
VideoView.belongsTo(Video, { foreignKey: 'videoId', as: 'video' });

User.hasMany(VideoView, { foreignKey: 'userId', as: 'videoViews' });
VideoView.belongsTo(User, { foreignKey: 'userId', as: 'user' });

module.exports = {
    sequelize,
    User,
    Course,
    Video,
    Document,
    Enrollment,
    Progress,
    Comment,
    Notification,
    VideoView
};
