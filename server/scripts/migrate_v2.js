const sequelize = require('../config/database');

const migrate = async () => {
    try {
        await sequelize.authenticate();
        console.log('✅ Connected to database for V2 migration.');

        const queryInterface = sequelize.getQueryInterface();
        const tableInfo = await queryInterface.describeTable('Videos');

        const columnsToAdd = [
            { name: 'status', type: sequelize.Sequelize.ENUM('pending', 'approved', 'rejected'), defaultValue: 'pending' },
            { name: 'visualConfidence', type: sequelize.Sequelize.INTEGER, defaultValue: 0 },
            { name: 'transcriptConfidence', type: sequelize.Sequelize.INTEGER, defaultValue: 0 },
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

        console.log('✅ V2 Migration completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
};

migrate();
