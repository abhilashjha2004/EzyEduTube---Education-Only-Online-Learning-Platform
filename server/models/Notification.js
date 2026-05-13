const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Notification = sequelize.define('Notification', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    type: {
        type: DataTypes.ENUM('new_video', 'comment', 'like', 'welcome', 'system'),
        defaultValue: 'system'
    },
    title: {
        type: DataTypes.STRING,
        allowNull: false
    },
    message: {
        type: DataTypes.TEXT,
        defaultValue: ''
    },
    link: {
        type: DataTypes.STRING,
        defaultValue: ''
    },
    read: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    }
}, {
    tableName: 'Notifications',
    timestamps: true
});

module.exports = Notification;
