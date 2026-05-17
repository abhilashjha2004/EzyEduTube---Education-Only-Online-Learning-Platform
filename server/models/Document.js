const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Document = sequelize.define('Document', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    title: {
        type: DataTypes.STRING,
        allowNull: false
    },
    documentUrl: {
        type: DataTypes.STRING,
        allowNull: false
    },
    type: {
        type: DataTypes.ENUM('pdf', 'link', 'other'),
        defaultValue: 'pdf'
    }
}, {
    tableName: 'Documents',
    freezeTableName: true,
    timestamps: true
});

module.exports = Document;
