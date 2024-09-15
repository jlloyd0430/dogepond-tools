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
            const response = await axios.get(`https://api.doggy.market/nfts/${slug}/holders`);
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

    if (commandName === 'trendingnft') {
        await interaction.deferReply();

        try {
            console.log(`Fetching top 10 trending NFT collections`);
            const response = await axios.get('https://api.doggy.market/nfts/trending?offset=0&limit=10&sortBy=volume24h&sortOrder=desc');
            const projects = response.data.slice(0, 10); // Get top 10 projects by 24-hour volume

            const embeds = projects.map(project => formatProjectInfo(project));

            await interaction.editReply({ content: '**Top 24-hour Trending NFT Collections:**', embeds: embeds });
        } catch (error) {
            console.error('Error fetching trending NFT collections:', error);
            await interaction.editReply('An error occurred while fetching the trending NFT collections.');
        }
    }

    if (commandName === 'trendingtoken') {
        await interaction.deferReply();

        try {
            console.log(`Fetching top 10 trending tokens`);
            const response = await axios.get('https://api.doggy.market/token/trending?period=all&offset=0&limit=10&sortBy=volume24h&sortOrder=desc');
            const tokens = response.data.data.slice(0, 10); // Get top 10 tokens by 24-hour volume

            const embeds = tokens.map(token => formatTokenInfo(token));

            await interaction.editReply({ content: '**Top 24-hour Trending Tokens:**', embeds: embeds });
        } catch (error) {
            console.error('Error fetching trending tokens:', error);
            await interaction.editReply('An error occurred while fetching the trending tokens.');
        }
    }
});

async function formatProjectInfo(project) {
    const imageUrl = await verifyImageUrl(project.collection.image);
    return new MessageEmbed()
        .setTitle(`Collection: ${project.collection.name}`)
        .setDescription(project.collection.description)
        .setImage(imageUrl)
        .addFields(
            { name: 'Volume (24h)', value: `${project.volume24h}`, inline: true },
            { name: 'Trades (24h)', value: `${project.trades24h}`, inline: true },
            { name: 'Listed', value: `${project.listed}`, inline: true },
        );
}

async function formatTokenInfo(token) {
    const imageUrl = await verifyImageUrl(token.pic);
    return new MessageEmbed()
        .setTitle(`Token: ${token.tick}`)
        .setImage(imageUrl)
        .addFields(
            { name: 'Volume (24h)', value: `${token.volume24h}`, inline: true },
            { name: 'Trades (24h)', value: `${token.trades24h}`, inline: true },
            { name: 'Listings', value: `${token.listings}`, inline: true },
            { name: 'Market Cap', value: `${token.marketcap}`, inline: true },
        );
}

async function verifyImageUrl(url) {
    if (!url) return 'https://via.placeholder.com/150';

    try {
        await axios.head(url);
        return url;
    } catch (error) {
        // If the initial URL check fails, try the alternative URL pattern
        const alternateUrl = url.replace('https://doggy.market/drc-20/', 'https://api.doggy.market/static/drc-20/');
        try {
            await axios.head(alternateUrl);
            return alternateUrl;
        } catch (alternateError) {
            // If both URLs fail, return a placeholder
            return 'https://via.placeholder.com/150';
        }
    }
}

client.login(process.env.DISCORD_TOKEN);
