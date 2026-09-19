require('dotenv').config();
const axios = require('axios');

const { getProfileConfig } = require('../src/config');

async function checkProfiles() {
    console.log('==============================================');
    console.log('       Radarr & Sonarr Quality Profiles       ');
    console.log('==============================================\n');

    const config = getProfileConfig();

    // Check Radarr
    if (process.env.RADARR_URL && process.env.RADARR_API_KEY) {
        try {
            const res = await axios.get(`${process.env.RADARR_URL}/api/v3/qualityprofile`, {
                headers: { 'X-Api-Key': process.env.RADARR_API_KEY }
            });
            console.log(`🎬 Radarr Profiles (${process.env.RADARR_URL}):`);
            res.data.forEach(p => {
                const current = config.radarrQualityProfileId === p.id ? ' (ACTIVE)' : '';
                console.log(`   - ID: ${p.id}  -> "${p.name}"${current}`);
            });
        } catch (err) {
            console.error('❌ Failed to fetch Radarr profiles:', err.response ? err.response.statusText : err.message);
        }
    } else {
        console.log('⚠️ Radarr URL or API Key missing in .env');
    }

    console.log('');

    // Check Sonarr
    if (process.env.SONARR_URL && process.env.SONARR_API_KEY) {
        try {
            const res = await axios.get(`${process.env.SONARR_URL}/api/v3/qualityprofile`, {
                headers: { 'X-Api-Key': process.env.SONARR_API_KEY }
            });
            console.log(`📺 Sonarr Profiles (${process.env.SONARR_URL}):`);
            res.data.forEach(p => {
                const current = config.sonarrQualityProfileId === p.id ? ' (ACTIVE)' : '';
                console.log(`   - ID: ${p.id}  -> "${p.name}"${current}`);
            });
        } catch (err) {
            console.error('❌ Failed to fetch Sonarr profiles:', err.response ? err.response.statusText : err.message);
        }
    } else {
        console.log('⚠️ Sonarr URL or API Key missing in .env');
    }

    console.log('\n==============================================');
}

checkProfiles();
