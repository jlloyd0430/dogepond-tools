const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const axios = require('axios');
const fs = require('fs');
const { stringify } = require('csv-stringify');
require('dotenv').config();

// Create a new Discord client instance
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Define the /snapshot, /stats, and /scrape commands
const commands = [
    new SlashCommandBuilder()
        .setName('snapshot')
        .setDescription('Get a list of all wallets that hold inscriptions in the collection')
        .addStringOption(option =>
            option.setName('slug')
                .setDescription('The slug of the collection')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('api')
                .setDescription('The API to use (OW or DM)')
                .setRequired(true)
                .addChoices(
                    { name: 'Ordinals Wallet', value: 'OW' },
                    { name: 'Doggy Market', value: 'DM' }
                )),
    new SlashCommandBuilder()
        .setName('stats')
        .setDescription('Get statistics of the collection')
        .addStringOption(option =>
            option.setName('slug')
                .setDescription('The slug of the collection')
                .setRequired(true)),
    new SlashCommandBuilder()
        .setName('scrape')
        .setDescription('Scrape all inscription IDs from a collection')
        .addStringOption(option =>
            option.setName('slug')
                .setDescription('The slug of the collection')
                .setRequired(true))
];

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    try {
        console.log('Started refreshing application (/) commands.');

        const guilds = client.guilds.cache.map(guild => guild.id);
        for (const guildId of guilds) {
            await rest.put(
                Routes.applicationGuildCommands(client.user.id, guildId),
                { body: commands },
            );
        }

        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
});

client.on('guildCreate', async guild => {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    try {
        await rest.put(
            Routes.applicationGuildCommands(client.user.id, guild.id),
            { body: commands },
        );

        console.log(`Successfully registered commands for guild: ${guild.id}`);
    } catch (error) {
        console.error(error);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    const { commandName } = interaction;

    if (commandName === 'snapshot') {
        const slug = interaction.options.getString('slug');
        const api = interaction.options.getString('api');

        await interaction.deferReply();

        try {
            let url;
            if (api === 'OW') {
                url = `https://dogeturbo.ordinalswallet.com/collection/${slug}/inscriptions`;
            } else if (api === 'DM') {
                url = `https://api.doggy.market/nfts/${slug}`;
            }

            console.log(`Fetching snapshot for slug: ${slug} using ${api} API`);
            const response = await axios.get(url);
            const data = response.data;

            console.log('API response:', data);

            let inscriptions;
            if (api === 'OW') {
                if (!Array.isArray(data)) {
                    console.error('Unexpected API response format:', data);
                    await interaction.editReply('Unexpected API response format.');
                    return;
                }

                inscriptions = data.map(item => ({ inscriptionId: item.id, inscriptionNumber: item.number }));
            } else if (api === 'DM') {
                if (!Array.isArray(data.recentlyListed)) {
                    console.error('Unexpected API response format:', data);
                    await interaction.editReply('Unexpected API response format.');
                    return;
                }

                inscriptions = data.recentlyListed.map(item => ({ inscriptionId: item.inscriptionId, inscriptionNumber: item.inscriptionNumber }));
            }

            if (inscriptions.length === 0) {
                await interaction.editReply('No inscriptions found for this collection.');
            } else {
                // Convert to CSV
                const records = inscriptions.map(inscription => ({ InscriptionID: inscription.inscriptionId, InscriptionNumber: inscription.inscriptionNumber }));

                // Create CSV file
                const filePath = `./inscriptions_${slug}.csv`;
                stringify(records, { header: true, columns: ['InscriptionID', 'InscriptionNumber'] }, (err, output) => {
                    if (err) {
                        console.error('Error generating CSV:', err);
                        interaction.editReply('An error occurred while generating the CSV file.');
                        return;
                    }

                    fs.writeFile(filePath, output, async (err) => {
                        if (err) {
                            console.error('Error writing CSV file:', err);
                            await interaction.editReply('An error occurred while writing the CSV file.');
                            return;
                        }

                        const file = new AttachmentBuilder(filePath);
                        await interaction.editReply({ content: 'Inscriptions in the collection:', files: [file] });

                        // Clean up the file after sending
                        fs.unlink(filePath, (err) => {
                            if (err) {
                                console.error('Error deleting CSV file:', err);
                            }
                        });
                    });
                });
            }
        } catch (error) {
            console.error('Error fetching snapshot:', error);
            await interaction.editReply('An error occurred while fetching the snapshot.');
        }
    }

    if (commandName === 'stats') {
        const slug = interaction.options.getString('slug');

        await interaction.deferReply();

        try {
            console.log(`Fetching stats for slug: ${slug}`);
            const response = await axios.get(`https://dogeturbo.ordinalswallet.com/collection/${slug}/stats`);
            const data = response.data;

            console.log('API response:', data);

            if (typeof data !== 'object') {
                console.error('Unexpected API response format:', data);
                await interaction.editReply('Unexpected API response format.');
                return;
            }

            // Create a response message with the stats
            const statsMessage = `
**Collection Stats for ${slug}:**
- **Total Supply:** ${data.total_supply}
- **Floor Price:** ${data.floor_price}
- **Listed:** ${data.listed}
- **Sales:** ${data.sales}
- **Volume (Day):** ${data.volume_day}
- **Volume (Total):** ${data.volume_total}
- **Owners:** ${data.owners}
            `;

            await interaction.editReply(statsMessage);
        } catch (error) {
            console.error('Error fetching stats:', error);
            await interaction.editReply('An error occurred while fetching the stats.');
        }
    }

    if (commandName === 'scrape') {
        const slug = interaction.options.getString('slug');

        await interaction.deferReply();

        try {
            console.log(`Fetching inscriptions for slug: ${slug}`);
            const response = await axios.get(`https://dogeturbo.ordinalswallet.com/collection/${slug}/inscriptions`);
            const data = response.data;

            console.log('API response:', data);

            if (!Array.isArray(data)) {
                console.error('Unexpected API response format:', data);
                await interaction.editReply('Unexpected API response format.');
                return;
            }

            // Extract only the IDs
            const ids = data.map(item => item.id);

            // Convert to CSV
            const records = ids.map(id => ({ InscriptionID: id }));

            // Create CSV file
            const filePath = `./inscriptions_${slug}.csv`;
            stringify(records, { header: true, columns: ['InscriptionID'] }, (err, output) => {
                if (err) {
                    console.error('Error generating CSV:', err);
                    interaction.editReply('An error occurred while generating the CSV file.');
                    return;
                }

                fs.writeFile(filePath, output, async (err) => {
                    if (err) {
                        console.error('Error writing CSV file:', err);
                        await interaction.editReply('An error occurred while writing the CSV file.');
                        return;
                    }

                    const file = new AttachmentBuilder(filePath);
                    await interaction.editReply({ content: 'Inscriptions in the collection:', files: [file] });

                    // Clean up the file after sending
                    fs.unlink(filePath, (err) => {
                        if (err) {
                            console.error('Error deleting CSV file:', err);
                        }
                    });
                });
            });
        } catch (error) {
            console.error('Error fetching inscriptions:', error);
            await interaction.editReply('An error occurred while fetching the inscriptions.');
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
