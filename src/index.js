require('dotenv').config();
const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { startCronJobs, sendWeeklyMovies, sendWeeklySeries, hasMoviesRunBefore, hasSeriesRunBefore } = require('./cron');
const { getState, updateState } = require('./state');
const { addMovieToRadarr } = require('./radarr');
const { addSeriesToSonarr } = require('./sonarr');
const { getSeriesDetails } = require('./tmdb');
const { isSetupComplete } = require('./config');
const { verifySetup } = require('./profiles');
const { sendSetupPrompt, handleSetupInteraction } = require('./setupWizard');

// Initialize Discord Client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// When bot turns on
client.once('clientReady', async () => {
    console.log(`[${new Date().toISOString()}] ✅ Logged in to Discord as ${client.user.tag}!`);
    console.log(`[${new Date().toISOString()}] 🤖 Initializing weekly cron jobs...`);
    const cronTasks = startCronJobs(client);
    console.log(`[${new Date().toISOString()}] Bot is now fully operational and listening for interactions.`);
    
    // Check if Quality Profiles and Root Folders are configured and valid on live servers
    const setupValid = await verifySetup();
    if (!setupValid) {
        console.log(`[${new Date().toISOString()}] ⚠️ Trendarr media setup (Profiles / Root Folders) is not configured or missing on Radarr/Sonarr! Sending setup wizard to Discord...`);
        const channelId = process.env.DISCORD_CHANNEL_ID;
        try {
            const channel = await client.channels.fetch(channelId);
            if (channel) {
                await sendSetupPrompt(channel);
            }
        } catch (e) {
            console.error(`[${new Date().toISOString()}] Error sending setup card:`, e.message);
        }
    } else {
        // Only post a full selection on the very first run. Regular restarts stay quiet
        // and just leave a single small notice (replacing the previous one).
        const firstMovies = !hasMoviesRunBefore();
        const firstSeries = !hasSeriesRunBefore();

        if (firstMovies) {
            console.log(`[${new Date().toISOString()}] First run: sending initial movie selection...`);
            await sendWeeklyMovies(client);
        }
        if (firstSeries) {
            console.log(`[${new Date().toISOString()}] First run: sending initial series selection...`);
            await sendWeeklySeries(client);
        }

        if (!firstMovies && !firstSeries) {
            console.log(`[${new Date().toISOString()}] Restart detected: skipping selection until next scheduled run.`);
            await sendRestartNotice(cronTasks);
        }
    }
});

// Post a tiny "restarted" message and delete the previous one, so frequent restarts
// never stack up in the channel. Disable completely with RESTART_NOTICE=false.
async function sendRestartNotice({ movieTask, seriesTask }) {
    if (String(process.env.RESTART_NOTICE).toLowerCase() === 'false') return;

    try {
        const channel = await client.channels.fetch(process.env.DISCORD_CHANNEL_ID);
        if (!channel) return;

        const previous = getState().restartNotice;
        if (previous && previous.messageId) {
            try {
                const prevChannel = await client.channels.fetch(previous.channelId);
                await prevChannel.messages.delete(previous.messageId);
            } catch (e) {
                // Already deleted or not accessible anymore, nothing to do
            }
        }

        const nextRuns = [movieTask?.getNextRun(), seriesTask?.getNextRun()].filter(Boolean);
        const next = nextRuns.length ? new Date(Math.min(...nextRuns.map(d => d.getTime()))) : null;
        const nextText = next ? ` Next selection <t:${Math.floor(next.getTime() / 1000)}:R>.` : '';

        const msg = await channel.send(`-# 🔄 Trendarr restarted, no new selection posted.${nextText}`);
        updateState({ restartNotice: { channelId: channel.id, messageId: msg.id } });
    } catch (e) {
        console.error(`[${new Date().toISOString()}] Error sending restart notice:`, e.message);
    }
}

// Allow triggering setup anytime by typing !setup in Discord
client.on('messageCreate', async message => {
    if (message.author.bot) return;
    if (message.content.trim() === '!setup' || message.content.trim() === '!profiles') {
        await sendSetupPrompt(message.channel);
    }
});

// Listen for button clicks, modals, and select menus
client.on('interactionCreate', async interaction => {
    // 0. Handle Setup Wizard interactions
    if (interaction.customId && interaction.customId.startsWith('setup_')) {
        return handleSetupInteraction(interaction, client, { sendWeeklyMovies, sendWeeklySeries });
    }

    // Only process buttons from this point on
    if (!interaction.isButton()) return;

    // 1. Handle "Add to Radarr" button click
    if (interaction.customId.startsWith('add_movie_')) {

        const tmdbId = interaction.customId.replace('add_movie_', '');

        // Defer reply so discord doesn't timeout the interaction while Radarr looks up and processes
        await interaction.deferReply({ ephemeral: true }); // ephemeral = only the user clicking it sees this response

        try {
            console.log(`[${new Date().toISOString()}] User requested adding movie TMDB ID: ${tmdbId}`);
            await addMovieToRadarr(tmdbId);
            await interaction.editReply(`✅ Successfully added movie (TMDB: ${tmdbId}) to Radarr. Searching indexers now...`);
            
            // Update the original button to be grayed out/disabled to prevent double-adds
            try {
                const originalMessage = interaction.message;
                const updatedRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`added_${tmdbId}`)
                        .setLabel('Added to Radarr!')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('✔️')
                        .setDisabled(true)
                );
                await originalMessage.edit({ components: [updatedRow] });
            } catch (err) {
                 console.error(`[${new Date().toISOString()}] Failed to update button state, but movie was added:`, err.message);
            }

        } catch (error) {
            // Check if it's already in Radarr (400 Bad Request usually from Radarr Validation)
            let isDuplicate = false;
            if (error.response && error.response.status === 400 && error.response.data && Array.isArray(error.response.data)) {
                if (error.response.data.some(e => e.errorMessage && e.errorMessage.toLowerCase().includes('already exists'))) {
                    isDuplicate = true;
                }
            }

            if (isDuplicate) {
                 console.log(`[${new Date().toISOString()}] Movie TMDB ID: ${tmdbId} is already in Radarr.`);
                 await interaction.editReply('⚠️ This movie is **already** in your Radarr library!');
            } else {
                 console.error(`[${new Date().toISOString()}] Error adding TMDB ID: ${tmdbId} to Radarr:`, error.message);
                 await interaction.editReply('❌ **Failed to add movie to Radarr.** Please check the bot logs for more details.');
            }
        }
    }

    // 2. Handle "Add to Sonarr" button click
    if (interaction.customId.startsWith('add_series_')) {
        const tmdbId = interaction.customId.replace('add_series_', '');

        await interaction.deferReply({ ephemeral: true });

        try {
            console.log(`[${new Date().toISOString()}] User requested adding series TMDB ID: ${tmdbId}`);
            
            // Lookup full details from TMDB to get TVDB ID and official title
            const details = await getSeriesDetails(tmdbId);
            if (!details) {
                return interaction.editReply('❌ Failed to fetch series details from TMDB. Please try again later.');
            }

            const tvdbId = details.external_ids?.tvdb_id || null;
            const seriesTitle = details.name;

            await addSeriesToSonarr(tvdbId, seriesTitle);
            await interaction.editReply(`✅ Successfully added series **"${seriesTitle}"** to Sonarr! Monitoring all episodes and searching indexers now...`);

            // Update the original button to be grayed out/disabled
            try {
                const originalMessage = interaction.message;
                const updatedRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`added_series_${tmdbId}`)
                        .setLabel('Added to Sonarr!')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('✔️')
                        .setDisabled(true)
                );
                await originalMessage.edit({ components: [updatedRow] });
            } catch (err) {
                console.error(`[${new Date().toISOString()}] Failed to update button state, but series was added:`, err.message);
            }

        } catch (error) {
            // Check if it's already in Sonarr (400 Bad Request with "already exists")
            let isDuplicate = false;
            if (error.response && error.response.status === 400 && error.response.data && Array.isArray(error.response.data)) {
                if (error.response.data.some(e => e.errorMessage && e.errorMessage.toLowerCase().includes('already exists'))) {
                    isDuplicate = true;
                }
            }

            if (isDuplicate) {
                console.log(`[${new Date().toISOString()}] Series TMDB ID: ${tmdbId} is already in Sonarr.`);
                await interaction.editReply('⚠️ This series is **already** in your Sonarr library!');
            } else {
                console.error(`[${new Date().toISOString()}] Error adding series TMDB ID: ${tmdbId} to Sonarr:`, error.message);
                await interaction.editReply('❌ **Failed to add series to Sonarr.** Please check the bot logs for more details.');
            }
        }
    }
});


// Catch unhandled errors so bot doesn't crash on network blips
process.on('unhandledRejection', error => {
    console.error(`[${new Date().toISOString()}] Unhandled promise rejection:`, error);
});

// Login using Token
client.login(process.env.DISCORD_BOT_TOKEN);
