require('dotenv').config();

const { Client, GatewayIntentBits, Partials } = require('discord.js');

// Create Discord client with needed intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel]
});

// Simple in-memory storage for tasks: { guildId: { dateKey: { userId: { task, baseTaskKey, done, pointsAwarded } } } }
const tasksStore = {};

// In-memory scores per guild: { guildId: { userId: totalPoints } }
const scoresStore = {};

// Task types and their points
const TASK_POINTS = {
  black_usb: 10,
  cloth: 15
};

// Helper to get today's key (per server local date, but using UTC here for simplicity)
function getTodayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getGuildDayStore(guildId) {
  const dateKey = getTodayKey();
  if (!tasksStore[guildId]) tasksStore[guildId] = {};
  if (!tasksStore[guildId][dateKey]) tasksStore[guildId][dateKey] = {};
  return tasksStore[guildId][dateKey];
}

function getGuildScoresStore(guildId) {
  if (!scoresStore[guildId]) scoresStore[guildId] = {};
  return scoresStore[guildId];
}

const PREFIX = '!';

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return; // ignore DMs

  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = args.shift()?.toLowerCase();

  if (command === 'help') {
    await message.reply(
      [
        '**Bot d\'assignation de tâches (famille)**',
        `\`${PREFIX}addtask <type> [description]\` : ajout de ta tâche du jour. Types spéciaux: **black_usb (10 points)**, **cloth (15 points)**.`,
        `\`${PREFIX}done\` : marquer ta tâche du jour comme faite.`,
        `\`${PREFIX}mytask\` : voir ta tâche du jour.`,
        `\`${PREFIX}report\` : (admin) voir qui a fait / pas fait sa tâche aujourd'hui.`,
        `\`${PREFIX}score\` : voir ton score total.`,
        `\`${PREFIX}top\` : classement des scores.`
      ].join('\n')
    );
  }

  // Add or update user's task for today
  if (command === 'addtask') {
    const baseTaskKey = args.shift();
    const extraDescription = args.join(' ');

    if (!baseTaskKey) {
      await message.reply(
        `Merci d'écrire le type de tâche, par ex: \`${PREFIX}addtask black_usb\` ou \`${PREFIX}addtask cloth\`.\n` +
          `Tu peux aussi ajouter une description: \`${PREFIX}addtask cloth plier les vêtements\`.`
      );
      return;
    }

    const normalizedKey = baseTaskKey.toLowerCase();
    const known = TASK_POINTS[normalizedKey];

    if (!known) {
      await message.reply(
        `Type de tâche inconnu: **${baseTaskKey}**.\n` +
          `Types connus: **black_usb** (${TASK_POINTS.black_usb} points), **cloth** (${TASK_POINTS.cloth} points).`
      );
      return;
    }

    const taskText = extraDescription
      ? `${normalizedKey} - ${extraDescription}`
      : normalizedKey;

    const store = getGuildDayStore(message.guild.id);
    const userId = message.author.id;

    store[userId] = {
      task: taskText,
      baseTaskKey: normalizedKey,
      done: false,
      pointsAwarded: false
    };

    await message.reply(
      `✅ Ta tâche d'aujourd'hui est enregistrée: **${taskText}** (${TASK_POINTS[normalizedKey]} points quand tu feras \`${PREFIX}done\`).`
    );
  }

  // Mark task as done
  if (command === 'done') {
    const store = getGuildDayStore(message.guild.id);
    const userId = message.author.id;

    if (!store[userId]) {
      await message.reply(`Tu n'as pas encore de tâche pour aujourd'hui. Utilise \`${PREFIX}addtask\` pour en ajouter une.`);
      return;
    }

    const entry = store[userId];

    if (entry.done) {
      await message.reply('Ta tâche du jour est déjà marquée comme faite 👍');
      return;
    }

    entry.done = true;

    const points = TASK_POINTS[entry.baseTaskKey] || 0;
    let gainMsg = '';

    if (!entry.pointsAwarded && points > 0) {
      entry.pointsAwarded = true;
      const scores = getGuildScoresStore(message.guild.id);
      scores[userId] = (scores[userId] || 0) + points;
      gainMsg = ` Tu gagnes **${points} points** pour la tâche **${entry.baseTaskKey}**.`;
    }

    await message.reply(`🎉 Bravo ! Ta tâche du jour est marquée comme **faite**.${gainMsg}`);
  }

  // Show user's task
  if (command === 'mytask') {
    const store = getGuildDayStore(message.guild.id);
    const userId = message.author.id;

    if (!store[userId]) {
      await message.reply(`Tu n'as pas encore de tâche pour aujourd'hui. Utilise \`${PREFIX}addtask\` pour en ajouter une.`);
      return;
    }

    const status = store[userId].done ? '✅ faite' : '⏳ pas encore faite';
    await message.reply(`Ta tâche d'aujourd'hui: **${store[userId].task}** (${status})`);
  }

  // Daily report command (anyone can use; you can restrict by role if you want)
  if (command === 'report') {
    const store = getGuildDayStore(message.guild.id);
    const memberIds = Object.keys(store);

    if (memberIds.length === 0) {
      await message.reply('Aucune tâche enregistrée pour aujourd\'hui.');
      return;
    }

    let doneLines = [];
    let notDoneLines = [];

    for (const userId of memberIds) {
      const entry = store[userId];
      const member = await message.guild.members.fetch(userId).catch(() => null);
      const displayName = member ? member.displayName : `<@${userId}>`;

      const line = `- ${displayName}: **${entry.task}**`;
      if (entry.done) {
        doneLines.push(line);
      } else {
        notDoneLines.push(line);
      }
    }

    const today = getTodayKey();
    let report = `📝 **Rapport des tâches pour ${today}**\n\n`;

    report += '**✅ Ont fait leur tâche:**\n';
    report += doneLines.length ? doneLines.join('\n') : '- Personne 😅';
    report += '\n\n**❌ N\'ont pas fait leur tâche:**\n';
    report += notDoneLines.length ? notDoneLines.join('\n') : '- Personne, tout le monde a bien travaillé ! 🎉';

    await message.reply(report);
  }

  // Show user's total score
  if (command === 'score') {
    const scores = getGuildScoresStore(message.guild.id);
    const userId = message.author.id;
    const total = scores[userId] || 0;
    await message.reply(`Ton score total est de **${total} points**.`);
  }

  // Show top scores
  if (command === 'top') {
    const scores = getGuildScoresStore(message.guild.id);
    const entries = Object.entries(scores);

    if (entries.length === 0) {
      await message.reply('Personne n\'a encore de points.');
      return;
    }

    // sort by score desc
    entries.sort((a, b) => b[1] - a[1]);

    const maxToShow = 10;
    const lines = [];

    for (let i = 0; i < Math.min(maxToShow, entries.length); i++) {
      const [userId, pts] = entries[i];
      const member = await message.guild.members.fetch(userId).catch(() => null);
      const displayName = member ? member.displayName : `<@${userId}>`;
      lines.push(`${i + 1}. ${displayName}: **${pts} points**`);
    }

    await message.reply(`🏆 **Top scores de la famille**:\n${lines.join('\n')}`);
  }
});

// Start bot
const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('Veuillez définir DISCORD_TOKEN dans votre fichier .env');
  process.exit(1);
}

client.login(token);

