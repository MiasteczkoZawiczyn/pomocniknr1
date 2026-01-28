require('dotenv').config();
const { 
    Client, GatewayIntentBits, Partials, AttachmentBuilder, 
    REST, Routes, SlashCommandBuilder, ActionRowBuilder, 
    ButtonBuilder, ButtonStyle, EmbedBuilder 
} = require('discord.js');
const { PDFDocument, rgb, StandardFonts, degrees } = require('pdf-lib');
const axios = require('axios');
const express = require('express');

// --- SERWER DLA RENDER (Naprawa błędu portów) ---
const app = express();
app.get('/', (req, res) => res.send('Bot NIZE is running 24/7!'));
app.listen(process.env.PORT || 10000);

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.DirectMessages
    ],
    partials: [Partials.Channel, Partials.Message, Partials.Reaction]
});

// --- KONFIGURACJA ---
const CONFIG = {
    ADMIN_ROLE: "1437194858375680102",
    TIKTOK_CHANNEL: "1437380571180306534",
    WARN_LOG_CHANNEL: "1441576106556788766",
    VACATION_CHANNEL: "1452784717802766397",
    WATERMARK_TEXT: "DISCORD.GG/TESTYPL",
    DISCORD_USER1: "manager3194",
    DISCORD_USER2: "duns0649"
};

let warns = []; 
let vacations = [];

// --- LOGIKA GENEROWANIA STOPKI PDF (1:1) ---
async function addWatermark(pdfBuffer) {
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const pages = pdfDoc.getPages();
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

    for (const page of pages) {
        const { width, height } = page.getSize();

        // Niebieskie ramki
        page.drawRectangle({ x: 0, y: 0, width, height: 50, color: rgb(0.9, 0.95, 1) });
        page.drawRectangle({ x: 0, y: height - 20, width, height: 20, color: rgb(0.9, 0.95, 1) });
        page.drawRectangle({ x: width - 18, y: 0, width: 18, height, color: rgb(0.9, 0.95, 1) });
        page.drawRectangle({ x: 0, y: 0, width: 15, height, color: rgb(0.9, 0.95, 1) });

        // Skośne znaki wodne na środku
        for (let i = 1; i <= 5; i++) {
            page.drawText(CONFIG.WATERMARK_TEXT, {
                x: width / 2, y: (height / 6) * i, size: 35, font: boldFont,
                color: rgb(0, 0, 0), opacity: 0.07, rotate: degrees(15),
            });
        }

        const now = new Date().toISOString().replace(/T/, '/').slice(0, 16).replace(/-/g, '/');

        // GÓRA
        page.drawText(`DOKUMENT WYGENEROWANY DLA: ${CONFIG.WATERMARK_TEXT}`, { 
            x: width / 2 - 120, y: height - 13, size: 8, font: boldFont 
        });

        // DÓŁ - KONTAKT
        page.drawText(`KONTAKT: ${CONFIG.DISCORD_USER1} | ${CONFIG.DISCORD_USER2} | nizekontakt@int.pl | nize@int.pl`, { 
            x: width / 2 - 160, y: 35, size: 10, font: boldFont 
        });

        // DÓŁ - ZAKUP (Przywrócone)
        page.drawText(`W CELU ZAKUPU LUB PYTAŃ: ${CONFIG.WATERMARK_TEXT}`, { 
            x: width / 2 - 100, y: 23, size: 8, font: boldFont 
        });

        // Linia z © i DATA
        const footerLine = `NIZE © 2026 - Wszelkie Prawa Zastrzeżone | DATA: ${now}`;
        page.drawText(footerLine, { 
            x: width / 2 - 140, y: 11, size: 6.5, font: regularFont 
        });
    }
    return await pdfDoc.save();
}

// --- REJESTRACJA KOMEND SLASH ---
const commands = [
    new SlashCommandBuilder()
        .setName('wiad')
        .setDescription('Wysyła pliki na kanał')
        .addChannelOption(o => o.setName('kanal').setDescription('Kanał').setRequired(true))
        .addStringOption(o => o.setName('temat').setDescription('Temat').setRequired(true))
        .addStringOption(o => o.setName('wiadomosc').setDescription('Wiadomość').setRequired(true))
        .addAttachmentOption(o => o.setName('plik1').setDescription('PDF 1'))
        .addAttachmentOption(o => o.setName('plik2').setDescription('PDF 2'))
        .addAttachmentOption(o => o.setName('plik3').setDescription('PDF 3'))
        .addAttachmentOption(o => o.setName('plik4').setDescription('PDF 4'))
        .addAttachmentOption(o => o.setName('plik5').setDescription('PDF 5')),
    new SlashCommandBuilder()
        .setName('pv')
        .setDescription('Wysyła pliki w wiadomości prywatnej')
        .addUserOption(o => o.setName('osoba').setDescription('Osoba').setRequired(true))
        .addStringOption(o => o.setName('temat').setDescription('Temat').setRequired(true))
        .addStringOption(o => o.setName('wiadomosc').setDescription('Wiadomość').setRequired(true))
        .addAttachmentOption(o => o.setName('plik1').setDescription('PDF 1'))
        .addAttachmentOption(o => o.setName('plik2').setDescription('PDF 2'))
        .addAttachmentOption(o => o.setName('plik3').setDescription('PDF 3'))
        .addAttachmentOption(o => o.setName('plik4').setDescription('PDF 4'))
        .addAttachmentOption(o => o.setName('plik5').setDescription('PDF 5'))
];

client.once('ready', async () => {
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log(`✅ Komendy /wiad i /pv aktywne. Zalogowano: ${client.user.tag}`);
    } catch (e) { console.error(e); }
});

// --- INTERAKCJE (SLASH & BUTTONS) ---
client.on('interactionCreate', async (int) => {
    if (int.isButton() && int.customId.startsWith('unwarn_')) {
        const id = parseInt(int.customId.split('_')[1]);
        warns = warns.filter(w => w.id !== id);
        return int.update({ content: "✅ Warn został usunięty z systemu.", components: [] });
    }

    if (!int.isChatInputCommand()) return;
    if (!int.member.roles.cache.has(CONFIG.ADMIN_ROLE)) return int.reply({ content: "Brak uprawnień.", ephemeral: true });

    if (int.commandName === 'wiad' || int.commandName === 'pv') {
        await int.deferReply({ ephemeral: true });
        
        const target = int.options.getChannel('kanal') || int.options.getUser('osoba');
        const subject = int.options.getString('temat');
        const text = int.options.getString('wiadomosc');

        const attachments = [];
        for (let i = 1; i <= 5; i++) {
            const file = int.options.getAttachment(`plik${i}`);
            if (file && file.contentType === 'application/pdf') {
                const res = await axios.get(file.url, { responseType: 'arraybuffer' });
                const finalPdf = await addWatermark(res.data);
                attachments.push(new AttachmentBuilder(Buffer.from(finalPdf), { name: `NIZE_${file.name}` }));
            }
        }

        try {
            await target.send({ content: `### ${subject}\n${text}`, files: attachments });
            await int.editReply("✅ Wysłano przetworzone pliki.");
        } catch (e) {
            await int.editReply("❌ Błąd wysyłania: " + e.message);
        }
    }
});

// --- MODERACJA & URLOPY ---
client.on('messageCreate', async (msg) => {
    if (msg.author.bot) return;

    // TikTok Filter
    if (msg.channelId === CONFIG.TIKTOK_CHANNEL && !msg.content.includes('tiktok.com')) {
        return msg.delete().catch(() => {});
    }

    // Vacation Notifier
    if (msg.channelId === CONFIG.VACATION_CHANNEL) {
        msg.reply(`Cześć ${msg.author},\nTwój urlop został zapisany, ale opiekun musi go zatwierdzić.`);
    }

    // Prefiksowe !warn, !unwarn, !urlopy
    if (!msg.content.startsWith('!')) return;
    if (!msg.member.roles.cache.has(CONFIG.ADMIN_ROLE)) return;

    const args = msg.content.slice(1).split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === 'warn') {
        const member = msg.mentions.members.first();
        const reason = args.slice(1).join(' ') || "Brak powodu";
        if (!member) return msg.reply("Oznacz osobę!");

        const warnId = Date.now();
        warns.push({ id: warnId, userId: member.id, reason, admin: msg.author.tag });

        const logChan = client.channels.cache.get(CONFIG.WARN_LOG_CHANNEL);
        if (logChan) logChan.send(`⚠️ **WARN** | ID: ${warnId} | ${member} | Powód: ${reason} | Admin: ${msg.author.tag}`);
        
        await member.send(`Otrzymałeś warna na serwerze! Powód: ${reason}`).catch(() => {});
        msg.reply(`Nadano warna dla ${member.user.tag}.`);
    }

    if (command === 'unwarn') {
        const member = msg.mentions.members.first();
        if (!member) return msg.reply("Oznacz osobę!");
        const uWarns = warns.filter(w => w.userId === member.id);
        if (uWarns.length === 0) return msg.reply("Brak warnów.");

        const row = new ActionRowBuilder();
        uWarns.slice(0, 5).forEach(w => {
            row.addComponents(new ButtonBuilder().setCustomId(`unwarn_${w.id}`).setLabel(`Usuń: ${w.reason.slice(0, 10)}`).setStyle(ButtonStyle.Danger));
        });
        msg.reply({ content: `Wybierz warn do usunięcia:`, components: [row] });
    }

    if (command === 'urlopy') {
        const txt = vacations.map(v => `<@${v.userId}> do ${v.date}`).join('\n') || "Brak aktywnych urlopów.";
        msg.reply(`**Lista urlopów:**\n${txt}`);
    }
});

// --- ZATWIERDZANIE REAKCJĄ ---
client.on('messageReactionAdd', async (reaction, user) => {
    if (user.bot) return;
    if (reaction.emoji.name === '✅' && reaction.message.channelId === CONFIG.VACATION_CHANNEL) {
        const member = await reaction.message.guild.members.fetch(user.id);
        if (!member.roles.cache.has(CONFIG.ADMIN_ROLE)) return;

        const match = reaction.message.content.match(/do dnia (\d{2}\.\d{2}\.\d{4})/);
        if (match) {
            const date = match[1];
            vacations.push({ userId: reaction.message.author.id, date });
            reaction.message.reply(`✅ Urlop dla <@${reaction.message.author.id}> zatwierdzony do ${date}.`);
            reaction.message.author.send(`Twój urlop został zatwierdzony!`).catch(() => {});
        }
    }
});

client.login(process.env.TOKEN);
