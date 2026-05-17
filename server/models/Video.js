const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Video = sequelize.define('Video', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    title: {
        type: DataTypes.STRING,
        allowNull: false
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    videoUrl: {
        type: DataTypes.STRING,
        allowNull: false
    },
    thumbnailUrl: {
        type: DataTypes.STRING,
        allowNull: true
    },
    duration: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    views: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    sourceType: {
        type: DataTypes.ENUM('upload', 'external'),
        defaultValue: 'upload'
    },
    subject: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: 'General'
    },
    orderIndex: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    status: {
        type: DataTypes.ENUM('pending', 'approved', 'rejected'),
        defaultValue: 'pending'
    },
    isEducational: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    moderationScore: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    visualConfidence: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    transcriptConfidence: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    moderationReason: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    approvedAt: {
        type: DataTypes.DATE,
        allowNull: true
    },
    reviewedByAI: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    }
}, {
    timestamps: true,
    tableName: 'Videos',
    freezeTableName: true
});

module.exports = Video;