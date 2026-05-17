const sequelize = require('../config/database');

const migrate = async () => {
    try {
        await sequelize.authenticate();
        console.log('✅ Connected to database for migration.');

        const queryInterface = sequelize.getQueryInterface();

        const tableInfo = await queryInterface.describeTable('Videos');

        const columnsToAdd = [
            { name: 'isEducational', type: sequelize.Sequelize.BOOLEAN, defaultValue: false },
            { name: 'moderationScore', type: sequelize.Sequelize.INTEGER, defaultValue: 0 },
            { name: 'moderationReason', type: sequelize.Sequelize.TEXT, allowNull: true },
            { name: 'approvedAt', type: sequelize.Sequelize.DATE, allowNull: true },
            { name: 'reviewedByAI', type: sequelize.Sequelize.BOOLEAN, defaultValue: false },
        ];

        for (const col of columnsToAdd) {
            if (!tableInfo[col.name]) {
                await queryInterface.addColumn('Videos', col.name, {
                    type: col.type,
                    defaultValue: col.defaultValue,
                    allowNull: col.allowNull !== undefined ? col.allowNull : true,
                });
                console.log(`➕ Added column: ${col.name}`);
            } else {
                console.log(`⏭️ Column already exists: ${col.name}`);
            }
        }

        console.log('✅ Migration completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
};

migrate();
