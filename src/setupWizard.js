const { 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    StringSelectMenuBuilder 
} = require('discord.js');
const { 
    getRadarrProfiles, 
    getSonarrProfiles, 
    getPairedRootFolders, 
    createBothProfiles 
} = require('./profiles');
const { saveProfileConfig, getProfileConfig } = require('./config');

async function sendSetupPrompt(channel) {
    const config = getProfileConfig();
    const driveInfo = (config.radarrRootFolder && config.sonarrRootFolder)
        ? `✅ **Current Storage**: \`${config.radarrRootFolder}\` & \`${config.sonarrRootFolder}\``
        : `⚠️ **Storage Drive**: Not yet selected`;

    const profileInfo = (config.radarrQualityProfileId && config.sonarrQualityProfileId)
        ? `✅ **Quality Profile**: \`${config.profileName || 'Configured'}\` (Radarr ID: ${config.radarrQualityProfileId}, Sonarr ID: ${config.sonarrQualityProfileId})`
        : `⚠️ **Quality Profile**: Not yet selected`;

    const embed = new EmbedBuilder()
        .setTitle('⚙️ MovieBot Setup: Quality & Root Folders')
        .setDescription(
            'Welcome to **MovieBot**! 🎉\n\n' +
            'Before MovieBot can send and download movies or TV series, it needs to know:\n' +
            '1. **Target Storage Drive** (where movies & series are saved).\n' +
            '2. **Quality Profile** (resolution and download preferences).\n\n' +
            '### Current Status\n' +
            `${driveInfo}\n` +
            `${profileInfo}\n\n` +
            'Use the buttons below to configure MovieBot automatically:'
        )
        .addFields(
            { name: '💎 1080p Standard', value: 'WEB-DL & Bluray 1080p. Perfect balance of sharpness & storage.', inline: false },
            { name: '🌟 4K / 2160p Ultra-HD', value: 'High bitrate 4K releases for 4K HDR home theaters.', inline: false },
            { name: '📂 Select Storage Drive', value: 'Choose which hard drive / root folder to save downloads to.', inline: false }
        )
        .setColor('#5865F2');

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('setup_quick_1080p')
            .setLabel('Create 1080p Profile')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('💎'),
        new ButtonBuilder()
            .setCustomId('setup_quick_4k')
            .setLabel('Create 4K Profile')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🌟'),
        new ButtonBuilder()
            .setCustomId('setup_select_drive')
            .setLabel('Choose Storage Drive')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('📂')
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('setup_select_existing')
            .setLabel('Choose Existing Profile')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('📋'),
        new ButtonBuilder()
            .setCustomId('setup_open_custom_modal')
            .setLabel('Custom Profile Name')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('✏️')
    );

    await channel.send({ embeds: [embed], components: [row1, row2] });
}

async function handleSetupInteraction(interaction, client, { sendWeeklyMovies, sendWeeklySeries }) {
    // 1. Choose Storage Drive
    if (interaction.customId === 'setup_select_drive') {
        await interaction.deferReply({ ephemeral: true });

        try {
            const pairs = await getPairedRootFolders();
            if (pairs.length === 0) {
                return interaction.editReply('❌ No root folders found in Radarr or Sonarr.');
            }

            const options = pairs.slice(0, 25).map(pair => ({
                label: pair.label.slice(0, 100),
                description: `${pair.freeSpace} | Movies: ${pair.radarrPath}`.slice(0, 100),
                value: `${pair.radarrPath}|||${pair.sonarrPath}`
            }));

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('setup_drive_selected')
                .setPlaceholder('Select storage drive for downloads')
                .addOptions(options);

            const row = new ActionRowBuilder().addComponents(selectMenu);

            return interaction.editReply({
                content: '📂 **Select your preferred storage drive:**',
                components: [row]
            });
        } catch (error) {
            console.error(`[${new Date().toISOString()}] Error fetching root folders:`, error.message);
            return interaction.editReply(`❌ Failed to retrieve storage drives: ${error.message}`);
        }
    }

    // 2. Handle Storage Drive Selection
    if (interaction.isStringSelectMenu() && interaction.customId === 'setup_drive_selected') {
        await interaction.deferReply({ ephemeral: true });
        const [radarrRootFolder, sonarrRootFolder] = interaction.values[0].split('|||');

        saveProfileConfig({ radarrRootFolder, sonarrRootFolder });

        await interaction.editReply(
            `✅ **Storage Drive Configured!**\n\n` +
            `• **Movies Folder**: \`${radarrRootFolder}\`\n` +
            `• **Series Folder**: \`${sonarrRootFolder}\`\n\n` +
            `MovieBot will download future media to these folders.`
        );

        // Check if both profile and root folders are ready
        const { isSetupComplete } = require('./config');
        if (isSetupComplete()) {
            if (sendWeeklyMovies) await sendWeeklyMovies(client);
            if (sendWeeklySeries) await sendWeeklySeries(client);
        }
        return;
    }

    // 3. Open Modal for Quick Presets or Custom
    if (interaction.customId.startsWith('setup_quick_') || interaction.customId === 'setup_open_custom_modal') {
        let defaultPreset = '1080p';
        let defaultName = 'MovieBot-1080p';

        if (interaction.customId === 'setup_quick_4k') {
            defaultPreset = '4k';
            defaultName = 'MovieBot-4K';
        } else if (interaction.customId === 'setup_quick_any') {
            defaultPreset = 'any';
            defaultName = 'MovieBot-Any';
        } else if (interaction.customId === 'setup_open_custom_modal') {
            defaultPreset = '1080p';
            defaultName = 'MovieBot-HD';
        }

        const modal = new ModalBuilder()
            .setCustomId(`setup_modal_submit_${defaultPreset}`)
            .setTitle('Create Quality Profile');

        const nameInput = new TextInputBuilder()
            .setCustomId('profile_name')
            .setLabel('Quality Profile Name')
            .setStyle(TextInputStyle.Short)
            .setValue(defaultName)
            .setRequired(true);

        const presetInput = new TextInputBuilder()
            .setCustomId('profile_preset')
            .setLabel('Preset Tier (1080p, 4k, or any)')
            .setStyle(TextInputStyle.Short)
            .setValue(defaultPreset)
            .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(nameInput),
            new ActionRowBuilder().addComponents(presetInput)
        );

        return interaction.showModal(modal);
    }

    // 4. Handle Existing Profile Selection
    if (interaction.customId === 'setup_select_existing') {
        await interaction.deferReply({ ephemeral: true });

        try {
            const [radarrProfiles, sonarrProfiles] = await Promise.all([
                getRadarrProfiles(),
                getSonarrProfiles()
            ]);

            const options = [];
            radarrProfiles.forEach(rp => {
                const sp = sonarrProfiles.find(s => s.name.toLowerCase() === rp.name.toLowerCase());
                if (sp) {
                    options.push({
                        label: `${rp.name} (Matched)`.slice(0, 100),
                        description: `Radarr ID: ${rp.id}, Sonarr ID: ${sp.id}`.slice(0, 100),
                        value: `${rp.id}:${sp.id}:${rp.name}`
                    });
                }
            });

            if (options.length === 0 && radarrProfiles.length > 0 && sonarrProfiles.length > 0) {
                options.push({
                    label: `Radarr "${radarrProfiles[0].name}" & Sonarr "${sonarrProfiles[0].name}"`.slice(0, 100),
                    description: `Radarr ID: ${radarrProfiles[0].id}, Sonarr ID: ${sonarrProfiles[0].id}`.slice(0, 100),
                    value: `${radarrProfiles[0].id}:${sonarrProfiles[0].id}:Default`
                });
            }

            if (options.length === 0) {
                return interaction.editReply('❌ No existing profiles found in Radarr or Sonarr.');
            }

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('setup_existing_selected')
                .setPlaceholder('Select a profile to use for MovieBot')
                .addOptions(options.slice(0, 25));

            const row = new ActionRowBuilder().addComponents(selectMenu);

            return interaction.editReply({
                content: 'Select the existing profile pair you would like MovieBot to use:',
                components: [row]
            });
        } catch (error) {
            console.error(`[${new Date().toISOString()}] Error fetching existing profiles:`, error.message);
            return interaction.editReply(`❌ Failed to retrieve existing profiles: ${error.message}`);
        }
    }

    // 5. Handle Existing Profile Dropdown selection
    if (interaction.isStringSelectMenu() && interaction.customId === 'setup_existing_selected') {
        await interaction.deferReply({ ephemeral: true });
        const [radarrId, sonarrId, profileName] = interaction.values[0].split(':');

        // Ensure root folder is also set (auto-pick drive with most free space if not set yet)
        const config = getProfileConfig();
        let radarrRootFolder = config.radarrRootFolder;
        let sonarrRootFolder = config.sonarrRootFolder;

        if (!radarrRootFolder || !sonarrRootFolder) {
            const pairs = await getPairedRootFolders();
            if (pairs.length > 0) {
                radarrRootFolder = pairs[0].radarrPath;
                sonarrRootFolder = pairs[0].sonarrPath;
            }
        }

        saveProfileConfig({
            radarrQualityProfileId: parseInt(radarrId, 10),
            sonarrQualityProfileId: parseInt(sonarrId, 10),
            radarrRootFolder,
            sonarrRootFolder,
            profileName
        });

        await interaction.editReply(
            `✅ **Quality Profile Configured!**\n\n` +
            `• **Profile**: **${profileName}** (Radarr ID: ${radarrId}, Sonarr ID: ${sonarrId})\n` +
            `• **Root Folders**: \`${radarrRootFolder}\` & \`${sonarrRootFolder}\`\n\n` +
            `🚀 MovieBot is now active! Triggering initial movie & series check...`
        );

        if (sendWeeklyMovies) await sendWeeklyMovies(client);
        if (sendWeeklySeries) await sendWeeklySeries(client);
        return;
    }

    // 6. Handle Modal Submission
    if (interaction.isModalSubmit() && interaction.customId.startsWith('setup_modal_submit_')) {
        await interaction.deferReply();

        const name = interaction.fields.getTextInputValue('profile_name');
        const preset = interaction.fields.getTextInputValue('profile_preset').toLowerCase();

        try {
            console.log(`[${new Date().toISOString()}] Creating quality profiles via Discord setup: "${name}" (${preset})...`);
            const result = await createBothProfiles(name, preset);

            // Ensure root folder is also set (auto-pick drive with most free space if not set yet)
            const config = getProfileConfig();
            let radarrRootFolder = config.radarrRootFolder;
            let sonarrRootFolder = config.sonarrRootFolder;

            if (!radarrRootFolder || !sonarrRootFolder) {
                const pairs = await getPairedRootFolders();
                if (pairs.length > 0) {
                    radarrRootFolder = pairs[0].radarrPath;
                    sonarrRootFolder = pairs[0].sonarrPath;
                }
            }

            saveProfileConfig({
                radarrQualityProfileId: result.radarrProfileId,
                sonarrQualityProfileId: result.sonarrProfileId,
                radarrRootFolder,
                sonarrRootFolder,
                profileName: name
            });

            const successEmbed = new EmbedBuilder()
                .setTitle('✅ Setup Complete!')
                .setDescription(
                    `MovieBot has configured your profiles and root folders:\n\n` +
                    `• **Profile Name**: ${name} (\`${preset.toUpperCase()}\`)\n` +
                    `• **Radarr Profile ID**: \`${result.radarrProfileId}\`\n` +
                    `• **Sonarr Profile ID**: \`${result.sonarrProfileId}\`\n` +
                    `• **Movies Folder**: \`${radarrRootFolder}\`\n` +
                    `• **Series Folder**: \`${sonarrRootFolder}\`\n\n` +
                    `🚀 **MovieBot is fully operational!** Dispatching initial recommendations...`
                )
                .setColor('#2ECC71');

            await interaction.editReply({ embeds: [successEmbed] });

            if (sendWeeklyMovies) await sendWeeklyMovies(client);
            if (sendWeeklySeries) await sendWeeklySeries(client);

        } catch (error) {
            console.error(`[${new Date().toISOString()}] Error during profile creation setup:`, error.message);
            await interaction.editReply(`❌ **Failed to complete setup:** ${error.response ? JSON.stringify(error.response.data) : error.message}`);
        }
    }
}

module.exports = {
    sendSetupPrompt,
    handleSetupInteraction
};
