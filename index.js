const { Client, GatewayIntentBits, Partials, AttachmentBuilder, EmbedBuilder, PermissionsBitField } = require('discord.js');
const { PDFDocument, rgb, degrees, StandardFonts } = require('pdf-lib');
const fontkit = require('@fontkit/idle');
const axios = require('axios');
require('dotenv').config();

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
    PREFIX: '!',
    ROLE_ADMIN: '1437194858375680102',
    CH_TIKTOK: '1437380571180306534',
    CH_LOG_WARNS: '1441576106556788766',
    CH_URLOPY: '1452784717802766397',
    WATERMARK_URL: "https://discord.gg/TESTYPL",
    WATERMARK_TEXT: "DISCORD.GG/TESTYPL",
    FONT_BOLD: "https://raw.githubusercontent.com/MiasteczkoZawiczyn/pomocniknr1/main/Helvetica-Bold.ttf"
};

// Bazy danych (w pamięci RAM - dla stałych danych użyj MongoDB/SQLite)
let warnings = [];
let urlopy = [];

// --- LOGIKA PDF (STOPKA 1:1) ---
async function processPdf(buffer) {
    const pdfDoc = await PDFDocument.load(buffer);
    pdfDoc.registerFontkit(fontkit);
    
    // Pobieranie czcionki bold dla efektu 1:1
    const fontBytes = await axios.get(CONFIG.FONT_BOLD, { responseType: 'arraybuffer' }).then(res => res.data);
    const customFont = await pdfDoc.embedFont(fontBytes);
    const pages = pdfDoc.getPages();

    for (const page of pages) {
        const { width, height } = page.getSize();
        
        // Ramki (tło stopek)
        page.drawRectangle({ x: 0, y: 0, width, height: 50, color: rgb(0.9, 0.95, 1) });
        page.drawRectangle({ x: 0, y: height - 20, width, height: 20, color: rgb(0.9, 0.95, 1) });
        page.drawRectangle({ x: width - 18, y: 0, width: 18, height, color: rgb(0.9, 0.95, 1) });
        page.drawRectangle({ x: 0, y: 0, width: 15, height, color: rgb(0.9, 0.95, 1) });

        // Centralne znaki wodne (półprzezroczyste)
        for (let i = 1; i <= 5; i++) {
            page.drawText(CONFIG.WATERMARK_TEXT, {
                x: width / 2 + (i % 2 === 0 ? -30 : 30),
                y: (height / 6) * i,
                size: 35,
                font: customFont,
                color: rgb(0, 0, 0),
                opacity: 0.07,
                rotate: degrees(i % 2 === 0 ? 15 : -15),
            });
        }

        // Stopka tekstowa (uproszczony przykład pozycjonowania jak w Pythonie)
        const dateStr = new Date().toISOString().replace('T', '/').slice(0, 16);
        page.drawText(`NIZE © 2026 - Wszelkie Prawa Zastrzeżone | DATA: ${dateStr}`, {
            x: width / 2 - 150,
            y: 10,
            size: 8,
            font: customFont,
            color: rgb(0, 0, 0)
        });
    }

    return await pdfDoc.save();
}

// --- EVENTY ---

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // 1. Filtr TikTok
    if (message.channel.id === CONFIG.CH_TIKTOK) {
        if (!message.content.includes('tiktok.com')) {
            await message.delete();
            return;
        }
    }

    // 2. Automatyczna odpowiedź na urlop
    if (message.channel.id === CONFIG.CH_URLOPY) {
        message.reply(`Cześć ${message.author},\nTwój urlop został zapisany, ale opiekun musi zatwierdzić twoje zgłoszenie. Otrzymasz informację o zatwierdzeniu.`);
    }

    // --- KOMENDY ---
    const args = message.content.slice(CONFIG.PREFIX.length).trim().split(/ +/);
    const command = args.shift()?.toLowerCase();

    if (!message.content.startsWith(CONFIG.PREFIX)) return;

    // Sprawdzanie roli admina
    const isAdmin = message.member.roles.cache.has(CONFIG.ROLE_ADMIN);
    if (!isAdmin) return;

    // !warn @user powod
    if (command === 'warn') {
        const target = message.mentions.members.first();
        const reason = args.slice(1).join(' ') || 'Brak powodu';
        if (!target) return message.reply('Oznacz kogo chcesz zwarnować.');

        const warnObj = { id: Date.now(), userId: target.id, reason, date: new Date().toLocaleString() };
        warnings.push(warnObj);

        // Powiadomienie kanał logów
        const logChannel = client.channels.cache.get(CONFIG.CH_LOG_WARNS);
        logChannel.send(`⚠️ **WARN** | Użytkownik: ${target} | Powód: ${reason} | ID: ${warnObj.id}`);
        
        // PV do usera
        try { await target.send(`Dostałeś warna na serwerze! Powód: ${reason}`); } catch(e) {}
    }

    // !unwarn @user
    if (command === 'unwarn') {
        const target = message.mentions.members.first();
        if (!target) return message.reply('Oznacz osobę.');

        const userWarns = warnings.filter(w => w.userId === target.id);
        if (userWarns.length === 0) return message.reply('Ten użytkownik nie ma warnów.');

        let list = userWarns.map((w, i) => `${i + 1}. [${w.date}] - ${w.reason} (ID: ${w.id})`).join('\n');
        message.reply(`Wybierz numer warna do usunięcia (odpisz samym numerem):\n${list}`);

        const filter = m => m.author.id === message.author.id;
        const collector = message.channel.createMessageCollector({ filter, max: 1, time: 15000 });

        collector.on('collect', m => {
            const idx = parseInt(m.content) - 1;
            if (userWarns[idx]) {
                warnings = warnings.filter(w => w.id !== userWarns[idx].id);
                message.reply('✅ Warn usunięty z systemu.');
            }
        });
    }

    // !urlopy
    if (command === 'urlopy') {
        if (urlopy.length === 0) return message.reply('Brak aktywnych urlopów.');
        const embed = new EmbedBuilder()
            .setTitle('Aktywne Urlopy')
            .setDescription(urlopy.map(u => `<@${u.userId}> do ${u.date} - ${u.reason}`).join('\n'));
        message.reply({ embeds: [embed] });
    }
});

// --- SLASH COMMANDS (Wiadomości z plikami) ---
// Uwaga: W JS lepiej użyć Slash Commands (/) lub zwykłych komend. Tutaj obsłużymy prefixową wersję komendy /wiad
client.on('messageCreate', async (message) => {
    if (!message.content.startsWith('/') || message.author.bot) return;
    if (!message.member.roles.cache.has(CONFIG.ROLE_ADMIN)) return;

    const parts = message.content.split(' ');
    const cmd = parts[0];

    if (cmd === '/wiad' || cmd === '/pv') {
        const channelOrUser = message.mentions.channels.first() || message.mentions.users.first();
        const text = parts.slice(2).join(' ');
        
        message.channel.send("⏳ Przetwarzam pliki...");

        const attachments = [];
        for (const [id, att] of message.attachments) {
            if (att.name.endsWith('.pdf')) {
                const res = await axios.get(att.url, { responseType: 'arraybuffer' });
                const modifiedPdf = await processPdf(res.data);
                attachments.push(new AttachmentBuilder(Buffer.from(modifiedPdf), { name: `NIZE_${att.name}` }));
            } else {
                attachments.push(new AttachmentBuilder(att.url, { name: att.name }));
            }
        }

        if (cmd === '/wiad' && channelOrUser) {
            await channelOrUser.send({ content: text, files: attachments });
        } else if (cmd === '/pv' && channelOrUser) {
            await channelOrUser.send({ content: text, files: attachments });
        }
        message.channel.send("✅ Wysłano.");
    }
});

// --- SYSTEM ZATWIERDZANIA URLOPÓW ---
client.on('messageReactionAdd', async (reaction, user) => {
    if (user.bot) return;
    if (reaction.emoji.name === '✅' && reaction.message.channel.id === CONFIG.CH_URLOPY) {
        const member = await reaction.message.guild.members.fetch(user.id);
        if (!member.roles.cache.has(CONFIG.ROLE_ADMIN)) return;

        // Parsowanie wzoru: "do dnia 29.01.2026 Z powodu 123"
        const content = reaction.message.content;
        const dateMatch = content.match(/do dnia (\d{2}\.\d{2}\.\d{4})/);
        const reasonMatch = content.split('Z powodu')[1];

        if (dateMatch) {
            const urlop = {
                userId: reaction.message.author.id,
                date: dateMatch[1],
                reason: reasonMatch ? reasonMatch.trim() : 'Brak powodu'
            };
            urlopy.push(urlop);
            
            reaction.message.reply(`✅ Urlop użytkownika <@${urlop.userId}> został zatwierdzony przez <@${user.id}>.`);
            try {
                await reaction.message.author.send(`Twój urlop do dnia ${urlop.date} został zatwierdzony!`);
            } catch(e) {}
        }
    }
});

client.login(process.env.TOKEN);
