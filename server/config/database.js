const { Sequelize } = require('sequelize');
const dotenv = require('dotenv');

dotenv.config();

const sequelize = new Sequelize(
    process.env.MYSQLDATABASE || process.env.DB_NAME || 'railway',
    process.env.MYSQLUSER || process.env.DB_USER || 'root',
    process.env.MYSQLPASSWORD || process.env.DB_PASSWORD || '',
    {
        host: process.env.MYSQLHOST || process.env.DB_HOST || '127.0.0.1',
        port: process.env.MYSQLPORT || process.env.DB_PORT || 3306,
        dialect: 'mysql',
        logging: false,
        pool: {
            max: 5,
            min: 0,
            acquire: 30000,
            idle: 10000
        }
    }
);

module.exports = sequelize;