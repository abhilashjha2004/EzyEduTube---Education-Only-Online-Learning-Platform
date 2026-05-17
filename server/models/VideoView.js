const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const VideoView = sequelize.define('VideoView', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    videoId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    userId: {
        type: DataTypes.INTEGER,
        allowNull: true // Null if guest/anonymous
    },
    ipAddress: {
        type: DataTypes.STRING,
        allowNull: false
    },
    userAgent: {
        type: DataTypes.TEXT,
        allowNull: true // Store user agent as simple device fingerprint for guests
    },
    viewedAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    }
}, {
    tableName: 'VideoViews',
    freezeTableName: true,
    timestamps: false
});

module.exports = VideoView;
