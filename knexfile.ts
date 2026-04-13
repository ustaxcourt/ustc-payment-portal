require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH || '.env' });
const { knexConfigs } = require('./src/db/knexConfig');

module.exports = knexConfigs;
