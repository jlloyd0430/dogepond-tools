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
                .setRequired(true)),
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

// Function to fetch all pages of data from the Doggy.Market API
async function fetchAllPages(slug) {
    let allData = [];
    let page = 1;
    let hasMoreData = true;

    while (hasMoreData) {
        try {
            const response = await axios.get(`https://api.doggy.market/nfts/${slug}?page=${page}`);
            const data = response.data.recentlyListed; // Adjust this based on the data you're fetching

            if (data.length > 0) {
                allData = allData.concat(data);
                console.log(`Fetched page ${page} with ${data.length} items`);
                page++; // Move to the next page
            } else {
                hasMoreData = false; // No more data
            }
        } catch (error) {
            console.error('Error fetching page:', error);
            hasMoreData = false; // Stop loop in case of an error
        }
    }

    return allData;
}

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
        await interaction.deferReply();

        try {
            console.log(`Fetching snapshot for slug: ${slug}`);
            const allData = await fetchAllPages(slug);
            console.log('Fetched data:', allData);

            if (allData.length === 0) {
                await interaction.editReply('No data found for this collection.');
            } else {
                // Count occurrences of each wallet
                const walletCounts = allData.reduce((acc, item) => {
                    acc[item.sellerAddress] = (acc[item.sellerAddress] || 0) + 1;
                    return acc;
                }, {});

                // Convert to CSV
                const records = Object.entries(walletCounts).map(([address, count]) => ({ Address: address, Count: count }));
                const filePath = `./wallets_${slug}.csv`;

                stringify(records, { header: true, columns: ['Address', 'Count'] }, (err, output) => {
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
                        await interaction.editReply({ content: 'Wallets holding inscriptions in the collection:', files: [file] });

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

    if (commandName === 'scrape') {
        const slug = interaction.options.getString('slug');
        await interaction.deferReply();

        try {
            console.log(`Fetching inscriptions for slug: ${slug}`);
            const allData = await fetchAllPages(slug);
            console.log('Fetched data:', allData);

            if (allData.length === 0) {
                await interaction.editReply('No inscriptions found for this collection.');
            } else {
                // Extract only the inscription IDs
                const ids = allData.map(item => item.inscriptionId);

                // Convert to CSV
                const records = ids.map(id => ({ InscriptionID: id }));
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
            }
        } catch (error) {
            console.error('Error fetching inscriptions:', error);
            await interaction.editReply('An error occurred while fetching the inscriptions.');
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
