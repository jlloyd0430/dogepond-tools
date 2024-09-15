const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, AttachmentBuilder, MessageEmbed } = require('discord.js');
const axios = require('axios');
const fs = require('fs');
const { stringify } = require('csv-stringify');
require('dotenv').config();

// Create a new Discord client instance
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Define the commands
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
                .setRequired(true)),
    new SlashCommandBuilder()
        .setName('trendingnft')
        .setDescription('Get the top 10 trending NFT collections by 24-hour volume'),
    new SlashCommandBuilder()
        .setName('trendingtoken')
        .setDescription('Get the top 10 trending tokens by 24-hour volume'),
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

        await interaction.deferReply();

        try {
            console.log(`Fetching snapshot for slug: ${slug}`);
            const response = await axios.get(`http://localhost:8080/nfts/${slug}/holders`, { // Using your local proxy
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36',
                    'Accept': 'application/json',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Connection': 'keep-alive'
                }
            });

            const data = response.data;

            console.log('API response:', data);

            if (!Array.isArray(data) || data.length === 0) {
                await interaction.editReply('No holders found for this collection.');
                return;
            }

            // Create CSV file
            const records = data.map(holder => ({ Address: holder.owner, Count: holder.items }));
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
            const response = await axios.get(`http://localhost:8080/collection/${slug}/stats`, { // Using your local proxy
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36',
                    'Accept': 'application/json',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Connection': 'keep-alive'
                }
            });

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

    // Other commands (scrape, trendingnft, trendingtoken)
});

client.login(process.env.DISCORD_TOKEN);
