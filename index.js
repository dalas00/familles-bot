require('dotenv').config();

const { Client, GatewayIntentBits, Partials } = require('discord.js');

// Create Discord client with needed intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates
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

// Voice activity tracking: { guildId: Set<userId> } for users currently in voice
const voiceInChannel = {};

// How many points per minute spent in voice during the night window
const VOICE_POINT_PER_MINUTE = 1;

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

function getGuildVoiceSet(guildId) {
  if (!voiceInChannel[guildId]) voiceInChannel[guildId] = new Set();
  return voiceInChannel[guildId];
}

// Night window: from 21:00 to 02:00 (server time)
function isWithinNightWindow(date) {
  const hour = date.getHours();
  // 21,22,23,0,1
  return hour >= 21 || hour < 2;
}

const PREFIX = '!';

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// Track when users join/leave voice
client.on('voiceStateUpdate', (oldState, newState) => {
  const guildId = newState.guild.id;
  const set = getGuildVoiceSet(guildId);
  const userId = newState.id;

  const wasInVoice = !!oldState.channelId;
  const isInVoice = !!newState.channelId;

  if (!wasInVoice && isInVoice) {
    // joined voice
    set.add(userId);
  } else if (wasInVoice && !isInVoice) {
    // left voice
    set.delete(userId);
  } else if (wasInVoice && isInVoice && oldState.channelId !== newState.channelId) {
    // moved between channels – still considered "in voice"
    set.add(userId);
  }
});

// Every minute, give points to users sitting in voice during the night window
setInterval(() => {
  const now = new Date();
  if (!isWithinNightWindow(now)) return;

  for (const guild of client.guilds.cache.values()) {
    const guildId = guild.id;
    const set = getGuildVoiceSet(guildId);
    if (!set || set.size === 0) continue;

    const scores = getGuildScoresStore(guildId);
    for (const userId of set) {
      scores[userId] = (scores[userId] || 0) + VOICE_POINT_PER_MINUTE;
    }
  }
}, 60 * 1000);

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return; // ignore DMs

  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = args.shift()?.toLowerCase();

  if (command === 'help') {
    await message.reply(
      [
        '**Bot dyal tâches w points dyal l-famille**',
        `\`${PREFIX}addtask <type> [description]\` : tsajjel tâche dyalek dyal lyom. Types m3ana daba: **black_usb (10 points)**, **cloth (15 points)**.`,
        `\`${PREFIX}done\` : t3ellem bli skhit tâche dyalek.`,
        `\`${PREFIX}mytask\` : tchof chno hiya tâche dyalek dyal lyom.`,
        `\`${PREFIX}report\` : tchof chkoun dar tâche w chkoun la f had nhar.`,
        `\`${PREFIX}score\` : tchof ch7al 3andek dyal points f total.`,
        `\`${PREFIX}top\` : tchof classement dyal l-famille f points.`,
        '',
        '**Bonus night points:** ila kont gales f voice bin 21h w 2 dyal sbah, kol d9i9a kat3ti **1 point** f score.'
      ].join('\n')
    );
  }

  // Add or update user's task for today
  if (command === 'addtask') {
    const baseTaskKey = args.shift();
    const extraDescription = args.join(' ');

    if (!baseTaskKey) {
      await message.reply(
        `Ktib type dyal tâche, b7al: \`${PREFIX}addtask black_usb\` ola \`${PREFIX}addtask cloth\`.\n` +
          `T9der tzed description zyada: \`${PREFIX}addtask cloth n7yed l7wayej mn machine\`.`
      );
      return;
    }

    const normalizedKey = baseTaskKey.toLowerCase();
    const known = TASK_POINTS[normalizedKey];

    if (!known) {
      await message.reply(
        `Ma 3reftch had type dyal tâche: **${baseTaskKey}**.\n` +
          `Types li 3ndna daba: **black_usb** (${TASK_POINTS.black_usb} points), **cloth** (${TASK_POINTS.cloth} points).`
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
      `✅ Tâche dyalk dyal lyom tsajlat: **${taskText}**. Ila drti \`${PREFIX}done\` ghadi tzid lik **${TASK_POINTS[normalizedKey]} points**.`
    );
  }

  // Mark task as done
  if (command === 'done') {
    const store = getGuildDayStore(message.guild.id);
    const userId = message.author.id;

    if (!store[userId]) {
      await message.reply(`Mazal ma 3endekch tâche dyal lyom. Est3mel \`${PREFIX}addtask\` bach tsajjel wa7da.`);
      return;
    }

    const entry = store[userId];

    if (entry.done) {
      await message.reply('Tâche dyalk dyal lyom rah deja ma3loma blli skhit-ha 👍');
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

    await message.reply(`🎉 3afak 3lik ! Tâche dyalk dyal lyom wlat **skhiya**.${gainMsg}`);
  }

  // Show user's task
  if (command === 'mytask') {
    const store = getGuildDayStore(message.guild.id);
    const userId = message.author.id;

    if (!store[userId]) {
      await message.reply(`Mazal ma 3endekch tâche dyal lyom. Est3mel \`${PREFIX}addtask\` bach tsajjel wa7da.`);
      return;
    }

    const status = store[userId].done ? '✅ faite' : '⏳ pas encore faite';
    const statusText = store[userId].done ? '✅ skhiya' : '⏳ mazal ma skhitich';
    await message.reply(`Tâche dyalk dyal lyom hiya: **${store[userId].task}** (${statusText})`);
  }

  // Daily report command (anyone can use; you can restrict by role if you want)
  if (command === 'report') {
    const store = getGuildDayStore(message.guild.id);
    const memberIds = Object.keys(store);

    if (memberIds.length === 0) {
      await message.reply('Ma tsajlat hata tâche f had nhar.');
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
    let report = `📝 **Rapport dyal tâches dyal ${today}**\n\n`;

    report += '**✅ Li skhaw tâche dyalhom:**\n';
    report += doneLines.length ? doneLines.join('\n') : '- 7ta wa7ed 😅';
    report += '\n\n**❌ Li mazal ma skhaw tâche:**\n';
    report += notDoneLines.length ? notDoneLines.join('\n') : '- 7ta wa7ed, kola chi khdam مزيان ! 🎉';

    await message.reply(report);
  }

  // Show user's total score
  if (command === 'score') {
    const scores = getGuildScoresStore(message.guild.id);
    const userId = message.author.id;
    const total = scores[userId] || 0;
    await message.reply(`Score total dyalk daba howa **${total} points**.`);
  }

  // Show top scores
  if (command === 'top') {
    const scores = getGuildScoresStore(message.guild.id);
    const entries = Object.entries(scores);

    if (entries.length === 0) {
      await message.reply('Mazal ma kayn 7ta wa7ed 3ando points.');
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

    await message.reply(`🏆 **Top scores dyal l-famille**:\n${lines.join('\n')}`);
  }
});

// Start bot
const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('Veuillez définir DISCORD_TOKEN dans votre fichier .env');
  process.exit(1);
}

client.login(token);

