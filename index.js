
require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Partials,
  SlashCommandBuilder,
  REST,
  Routes,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags
} = require("discord.js");

const Database = require("better-sqlite3");

// ==============================
// VORTEX CONFIGURATION
// ==============================

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID || null;
const RED = 0xE53935;

if (!TOKEN || !CLIENT_ID) {
  console.error("DISCORD_TOKEN veya CLIENT_ID eksik!");
  process.exit(1);
}

// ==============================
// DATABASE
// ==============================

const db = new Database(process.env.DB_PATH || "vortex.sqlite");

db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS settings (
  guild_id TEXT PRIMARY KEY,
  log_channel TEXT,
  welcome_channel TEXT,
  welcome_message TEXT,
  autorole_id TEXT,
  ticket_category TEXT,
  support_role TEXT
);

CREATE TABLE IF NOT EXISTS tickets (
  channel_id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS warnings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  moderator_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
`);

function getSettings(guildId) {
  return db.prepare(
    "SELECT * FROM settings WHERE guild_id = ?"
  ).get(guildId) || {};
}

function updateSetting(guildId, field, value) {
  const allowed = [
    "log_channel",
    "welcome_channel",
    "welcome_message",
    "autorole_id",
    "ticket_category",
    "support_role"
  ];

  if (!allowed.includes(field)) return;

  db.prepare(`
    INSERT INTO settings (guild_id, ${field})
    VALUES (?, ?)
    ON CONFLICT(guild_id)
    DO UPDATE SET ${field} = excluded.${field}
  `).run(guildId, value);
}

// ==============================
// CLIENT
// ==============================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.GuildMember
  ]
});

// ==============================
// EMBED
// ==============================

function makeEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(RED)
    .setTitle(`VORTEX | ${title}`)
    .setDescription(description)
    .setTimestamp()
    .setFooter({ text: "VORTEX Discord Bot" });
}

// ==============================
// LOG SYSTEM
// ==============================

async function sendLog(guild, title, description) {
  if (!guild) return;

  const settings = getSettings(guild.id);
  if (!settings.log_channel) return;

  const channel = guild.channels.cache.get(settings.log_channel);
  if (!channel || !channel.isTextBased()) return;

  await channel.send({
    embeds: [makeEmbed(title, description)]
  }).catch(() => {});
}

// ==============================
// SLASH COMMANDS
// ==============================

const commands = [

  new SlashCommandBuilder()
    .setName("yardim")
    .setDescription("VORTEX komutlarını gösterir."),

  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Botun gecikmesini gösterir."),

  new SlashCommandBuilder()
    .setName("sunucu")
    .setDescription("Sunucu bilgilerini gösterir."),

  new SlashCommandBuilder()
    .setName("kullanici")
    .setDescription("Kullanıcı bilgilerini gösterir.")
    .addUserOption(o =>
      o.setName("uye")
        .setDescription("Bilgileri gösterilecek üye")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("avatar")
    .setDescription("Kullanıcının avatarını gösterir.")
    .addUserOption(o =>
      o.setName("uye")
        .setDescription("Avatarı gösterilecek üye")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Üyeyi sunucudan yasaklar.")
    .addUserOption(o =>
      o.setName("uye").setDescription("Üye").setRequired(true)
    )
    .addStringOption(o =>
      o.setName("sebep").setDescription("İşlem sebebi").setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Üyeyi sunucudan atar.")
    .addUserOption(o =>
      o.setName("uye").setDescription("Üye").setRequired(true)
    )
    .addStringOption(o =>
      o.setName("sebep").setDescription("İşlem sebebi").setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

  new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Üyeye süreli iletişim kısıtlaması uygular.")
    .addUserOption(o =>
      o.setName("uye").setDescription("Üye").setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName("dakika")
        .setDescription("Dakika")
        .setMinValue(1)
        .setMaxValue(40320)
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName("sebep").setDescription("Sebep").setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  new SlashCommandBuilder()
    .setName("temizle")
    .setDescription("Kanaldaki mesajları temizler.")
    .addIntegerOption(o =>
      o.setName("adet")
        .setDescription("1-100 arası")
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName("uyari")
    .setDescription("Bir üyeye uyarı kaydı ekler.")
    .addUserOption(o =>
      o.setName("uye").setDescription("Üye").setRequired(true)
    )
    .addStringOption(o =>
      o.setName("sebep").setDescription("Uyarı sebebi").setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  new SlashCommandBuilder()
    .setName("uyarilar")
    .setDescription("Bir üyenin uyarı kayıtlarını gösterir.")
    .addUserOption(o =>
      o.setName("uye").setDescription("Üye").setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  new SlashCommandBuilder()
    .setName("log-kur")
    .setDescription("Sunucunun log kanalını ayarlar.")
    .addChannelOption(o =>
      o.setName("kanal")
        .setDescription("Log kanalı")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName("hosgeldin-kur")
    .setDescription("Karşılama kanalını ayarlar.")
    .addChannelOption(o =>
      o.setName("kanal")
        .setDescription("Karşılama kanalı")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName("mesaj")
        .setDescription("{user}, {server} ve {count} kullanılabilir.")
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName("otorol")
    .setDescription("Yeni üyelere verilecek rolü ayarlar.")
    .addRoleOption(o =>
      o.setName("rol").setDescription("Verilecek rol").setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  new SlashCommandBuilder()
    .setName("ticket-kur")
    .setDescription("Ticket paneli oluşturur.")
    .addChannelOption(o =>
      o.setName("kategori")
        .setDescription("Ticket kategori kanalı")
        .addChannelTypes(ChannelType.GuildCategory)
        .setRequired(false)
    )
    .addRoleOption(o =>
      o.setName("destek-rolü")
        .setDescription("Ticketları görebilecek destek rolü")
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  new SlashCommandBuilder()
    .setName("ticket-kapat")
    .setDescription("Açık ticket kanalını kapatır.")
];

const rest = new REST({ version: "10" }).setToken(TOKEN);

// ==============================
// READY
// ==============================

client.once("ready", async () => {
  console.log(`VORTEX aktif: ${client.user.tag}`);

  client.user.setPresence({
    status: "online",
    activities: [{
      name: "VORTEX",
      type: 2
    }]
  });

  try {
    const body = commands.map(command => command.toJSON());

    if (GUILD_ID) {
      await rest.put(
        Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
        { body }
      );
      console.log("Sunucu komutları yüklendi.");
    } else {
      await rest.put(
        Routes.applicationCommands(CLIENT_ID),
        { body }
      );
      console.log("Global komutlar yüklendi.");
    }
  } catch (error) {
    console.error("Komut yükleme hatası:", error);
  }
});

// ==============================
// MEMBER JOIN
// ==============================

client.on("guildMemberAdd", async member => {
  const settings = getSettings(member.guild.id);

  if (settings.autorole_id) {
    const role = member.guild.roles.cache.get(settings.autorole_id);

    if (role && role.position < member.guild.members.me.roles.highest.position) {
      await member.roles.add(role).catch(() => {});
    }
  }

  if (settings.welcome_channel) {
    const channel = member.guild.channels.cache.get(settings.welcome_channel);

    if (channel) {
      const message = settings.welcome_message ||
        "Hoş geldin {user}! {server} sunucusunda {count}. üyesin.";

      await channel.send(
        message
          .replaceAll("{user}", `${member}`)
          .replaceAll("{server}", member.guild.name)
          .replaceAll("{count}", `${member.guild.memberCount}`)
      ).catch(() => {});
    }
  }

  await sendLog(
    member.guild,
    "Üye Katıldı",
    `${member.user.tag} sunucuya katıldı.`
  );
});

// ==============================
// MEMBER LEAVE
// ==============================

client.on("guildMemberRemove", async member => {
  await sendLog(
    member.guild,
    "Üye Ayrıldı",
    `${member.user.tag} sunucudan ayrıldı.`
  );
});

// ==============================
// MESSAGE DELETE
// ==============================

client.on("messageDelete", async message => {
  if (!message.guild || message.author?.bot) return;

  await sendLog(
    message.guild,
    "Mesaj Silindi",
    `Kanal: ${message.channel}\nYazar: ${message.author || "Bilinmiyor"}\nMesaj: ${(message.content || "İçerik alınamadı").slice(0, 900)}`
  );
});

// ==============================
// MESSAGE EDIT
// ==============================

client.on("messageUpdate", async (oldMessage, newMessage) => {
  if (!newMessage.guild || newMessage.author?.bot) return;

  if (oldMessage.partial) {
    await oldMessage.fetch().catch(() => null);
  }

  if (oldMessage.content === newMessage.content) return;

  await sendLog(
    newMessage.guild,
    "Mesaj Düzenlendi",
    `Üye: ${newMessage.author}\nKanal: ${newMessage.channel}\nEski: ${(oldMessage.content || "Bilinmiyor").slice(0, 400)}\nYeni: ${(newMessage.content || "Bilinmiyor").slice(0, 400)}`
  );
});

// ==============================
// ANTI-SPAM
// ==============================

const spamTracker = new Map();

client.on("messageCreate", async message => {
  if (!message.guild || message.author.bot) return;

  const key = `${message.guild.id}:${message.author.id}`;
  const now = Date.now();

  const history = (spamTracker.get(key) || [])
    .filter(time => now - time < 5000);

  history.push(now);
  spamTracker.set(key, history);

  if (history.length >= 6) {
    const member = message.member;

    if (member && member.moderatable) {
      await member.timeout(
        30 * 1000,
        "VORTEX otomatik spam koruması"
      ).catch(() => {});

      await message.channel.send(
        `${message.author}, spam nedeniyle kısa süreli kısıtlandı.`
      ).catch(() => {});

      await sendLog(
        message.guild,
        "Anti-Spam",
        `${message.author.tag} otomatik spam korumasına takıldı.`
      );
    }

    spamTracker.delete(key);
  }
});

// ==============================
// INTERACTIONS
// ==============================

client.on("interactionCreate", async interaction => {
  try {

    // --------------------------
    // SLASH COMMANDS
    // --------------------------

    if (interaction.isChatInputCommand()) {
      const guild = interaction.guild;
      const user = interaction.user;
      const member = interaction.member;

      if (!guild) {
        return interaction.reply({
          content: "Bu komut yalnızca sunucularda kullanılabilir.",
          flags: MessageFlags.Ephemeral
        });
      }

      const command = interaction.commandName;

      if (command === "yardim") {
        const embed = makeEmbed(
          "Komut Listesi",
          "**GENEL**\n`/yardim` `/ping` `/sunucu` `/kullanici` `/avatar`\n\n" +
          "**MODERASYON**\n`/ban` `/kick` `/timeout` `/temizle` `/uyari` `/uyarilar`\n\n" +
          "**SİSTEMLER**\n`/log-kur` `/hosgeldin-kur` `/otorol`\n\n" +
          "**TICKET**\n`/ticket-kur` `/ticket-kapat`"
        );

        return interaction.reply({ embeds: [embed] });
      }

      if (command === "ping") {
        return interaction.reply({
          embeds: [
            makeEmbed("Ping", `🏓 Gecikme: **${client.ws.ping} ms**`)
          ]
        });
      }

      if (command === "sunucu") {
        const embed = makeEmbed(
          "Sunucu Bilgileri",
          `**Ad:** ${guild.name}\n` +
          `**ID:** ${guild.id}\n` +
          `**Üye:** ${guild.memberCount}\n` +
          `**Oluşturulma:** <t:${Math.floor(guild.createdTimestamp / 1000)}:D>`
        );

        if (guild.iconURL()) embed.setThumbnail(guild.iconURL());

        return interaction.reply({ embeds: [embed] });
      }

      if (command === "kullanici") {
        const target = interaction.options.getUser("uye") || user;

        const embed = makeEmbed(
          "Kullanıcı Bilgileri",
          `**Kullanıcı:** ${target}\n` +
          `**ID:** ${target.id}\n` +
          `**Hesap:** <t:${Math.floor(target.createdTimestamp / 1000)}:D>`
        ).setThumbnail(target.displayAvatarURL());

        return interaction.reply({ embeds: [embed] });
      }

      if (command === "avatar") {
        const target = interaction.options.getUser("uye") || user;

        const embed = makeEmbed(
          "Avatar",
          `[Avatarı aç](${target.displayAvatarURL({ size: 1024 })})`
        ).setImage(target.displayAvatarURL({ size: 1024 }));

        return interaction.reply({ embeds: [embed] });
      }

      if (command === "ban") {
        const target = interaction.options.getUser("uye");
        const reason = interaction.options.getString("sebep") || "Sebep belirtilmedi.";
        const targetMember = await guild.members.fetch(target.id);

        if (!targetMember.bannable) {
          return interaction.reply({
            content: "Bu üyeye ban uygulayamıyorum. Rol sırasını kontrol et.",
            flags: MessageFlags.Ephemeral
          });
        }

        await targetMember.ban({ reason: `${reason} | Yetkili: ${user.tag}` });

        await sendLog(guild, "Ban", `${target.tag} yasaklandı.\nSebep: ${reason}\nYetkili: ${user.tag}`);

        return interaction.reply({
          embeds: [makeEmbed("Ban", `${target.tag} sunucudan yasaklandı.`)]
        });
      }

      if (command === "kick") {
        const target = interaction.options.getUser("uye");
        const reason = interaction.options.getString("sebep") || "Sebep belirtilmedi.";
        const targetMember = await guild.members.fetch(target.id);

        if (!targetMember.kickable) {
          return interaction.reply({
            content: "Bu üyeyi sunucudan atamıyorum.",
            flags: MessageFlags.Ephemeral
          });
        }

        await targetMember.kick(`${reason} | Yetkili: ${user.tag}`);

        await sendLog(guild, "Kick", `${target.tag} sunucudan atıldı.\nSebep: ${reason}\nYetkili: ${user.tag}`);

        return interaction.reply({
          embeds: [makeEmbed("Kick", `${target.tag} sunucudan atıldı.`)]
        });
      }

      if (command === "timeout") {
        const target = interaction.options.getUser("uye");
        const minutes = interaction.options.getInteger("dakika");
        const reason = interaction.options.getString("sebep") || "Sebep belirtilmedi.";
        const targetMember = await guild.members.fetch(target.id);

        if (!targetMember.moderatable) {
          return interaction.reply({
            content: "Bu üyeye timeout uygulayamıyorum.",
            flags: MessageFlags.Ephemeral
          });
        }

        await targetMember.timeout(
          minutes * 60 * 1000,
          `${reason} | Yetkili: ${user.tag}`
        );

        await sendLog(guild, "Timeout", `${target.tag}: ${minutes} dakika.\nSebep: ${reason}`);

        return interaction.reply({
          embeds: [makeEmbed("Timeout", `${target.tag} için ${minutes} dakikalık kısıtlama uygulandı.`)]
        });
      }

      if (command === "temizle") {
        const amount = interaction.options.getInteger("adet");

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const deleted = await interaction.channel.bulkDelete(amount, true);

        await sendLog(guild, "Mesaj Temizleme", `${user.tag}, ${deleted.size} mesaj temizledi.`);

        return interaction.editReply(`${deleted.size} mesaj temizlendi. 14 günden eski mesajlar toplu silinemez.`);
      }

      if (command === "uyari") {
        const target = interaction.options.getUser("uye");
        const reason = interaction.options.getString("sebep");

        db.prepare(`
          INSERT INTO warnings
          (guild_id, user_id, moderator_id, reason, created_at)
          VALUES (?, ?, ?, ?, ?)
        `).run(guild.id, target.id, user.id, reason, Date.now());

        await sendLog(guild, "Üye Uyarıldı", `${target.tag}\nSebep: ${reason}\nYetkili: ${user.tag}`);

        return interaction.reply({
          embeds: [makeEmbed("Uyarı Kaydedildi", `${target} için uyarı kaydedildi.\n**Sebep:** ${reason}`)]
        });
      }

      if (command === "uyarilar") {
        const target = interaction.options.getUser("uye");

        const warnings = db.prepare(`
          SELECT * FROM warnings
          WHERE guild_id = ? AND user_id = ?
          ORDER BY id DESC LIMIT 10
        `).all(guild.id, target.id);

        if (!warnings.length) {
          return interaction.reply({
            content: "Bu kullanıcının uyarı kaydı bulunamadı.",
            flags: MessageFlags.Ephemeral
          });
        }

        const description = warnings.map(w =>
          `**#${w.id}** — ${w.reason}\nYetkili: <@${w.moderator_id}>`
        ).join("\n\n");

        return interaction.reply({
          embeds: [makeEmbed(`${target.username} | Uyarılar`, description)]
        });
      }

      if (command === "log-kur") {
        const channel = interaction.options.getChannel("kanal");

        updateSetting(guild.id, "log_channel", channel.id);

        return interaction.reply({
          embeds: [makeEmbed("Log Sistemi", `Log kanalı ${channel} olarak ayarlandı.`)]
        });
      }

      if (command === "hosgeldin-kur") {
        const channel = interaction.options.getChannel("kanal");
        const message = interaction.options.getString("mesaj") ||
          "Hoş geldin {user}! {server} sunucusunda {count}. üyesin.";

        updateSetting(guild.id, "welcome_channel", channel.id);
        updateSetting(guild.id, "welcome_message", message);

        return interaction.reply({
          embeds: [makeEmbed("Karşılama Sistemi", `Karşılama kanalı: ${channel}\nMesaj: ${message}`)]
        });
      }

      if (command === "otorol") {
        const role = interaction.options.getRole("rol");

        if (role.managed || role.position >= guild.members.me.roles.highest.position) {
          return interaction.reply({
            content: "Bu rolü veremem. Bot rolünü yukarı taşı veya başka rol seç.",
            flags: MessageFlags.Ephemeral
          });
        }

        updateSetting(guild.id, "autorole_id", role.id);

        return interaction.reply({
          embeds: [makeEmbed("Otomatik Rol", `Yeni üyelere ${role} rolü verilecek.`)]
        });
      }

      if (command === "ticket-kur") {
        const category = interaction.options.getChannel("kategori");
        const supportRole = interaction.options.getRole("destek-rolü");

        updateSetting(guild.id, "ticket_category", category?.id || null);
        updateSetting(guild.id, "support_role", supportRole?.id || null);

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("vortex_ticket_open")
            .setLabel("Destek Talebi Oluştur")
            .setEmoji("🎫")
            .setStyle(ButtonStyle.Danger)
        );

        const embed = makeEmbed(
          "Destek Merkezi",
          "Destek ekibimizle görüşmek için aşağıdaki butona basarak ticket oluşturabilirsin."
        );

        return interaction.reply({
          embeds: [embed],
          components: [row]
        });
      }

      if (command === "ticket-kapat") {
        const ticket = db.prepare(
          "SELECT * FROM tickets WHERE channel_id = ?"
        ).get(interaction.channelId);

        if (!ticket) {
          return interaction.reply({
            content: "Bu kanal bir ticket değil.",
            flags: MessageFlags.Ephemeral
          });
        }

        const isOwner = ticket.user_id === user.id;
        const isStaff = interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels);

        if (!isOwner && !isStaff) {
          return interaction.reply({
            content: "Bu ticket'ı kapatma yetkin yok.",
            flags: MessageFlags.Ephemeral
          });
        }

        await interaction.reply("Ticket kapatılıyor...");

        db.prepare("DELETE FROM tickets WHERE channel_id = ?")
          .run(interaction.channelId);

        setTimeout(() => {
          interaction.channel.delete().catch(() => {});
        }, 3000);

        return;
      }
    }

    // --------------------------
    // BUTTONS
    // --------------------------

    if (interaction.isButton()) {

      if (interaction.customId === "vortex_ticket_open") {
        const guild = interaction.guild;
        const settings = getSettings(guild.id);

        const existing = db.prepare(
          "SELECT * FROM tickets WHERE guild_id = ? AND user_id = ?"
        ).get(guild.id, interaction.user.id);

        if (existing) {
          const existingChannel = guild.channels.cache.get(existing.channel_id);

          if (existingChannel) {
            return interaction.reply({
              content: `Zaten açık ticket'ın var: ${existingChannel}`,
              flags: MessageFlags.Ephemeral
            });
          }

          db.prepare("DELETE FROM tickets WHERE channel_id = ?")
            .run(existing.channel_id);
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const overwrites = [
          {
            id: guild.roles.everyone.id,
            deny: [PermissionFlagsBits.ViewChannel]
          },
          {
            id: interaction.user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory
            ]
          },
          {
            id: client.user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.ManageChannels
            ]
          }
        ];

        if (settings.support_role) {
          overwrites.push({
            id: settings.support_role,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory
            ]
          });
        }

        const channel = await guild.channels.create({
          name: `ticket-${interaction.user.username}`
            .toLowerCase()
            .replace(/[^a-z0-9-]/g, "")
            .slice(0, 90),
          type: ChannelType.GuildText,
          parent: settings.ticket_category || undefined,
          permissionOverwrites: overwrites
        });

        db.prepare(`
          INSERT INTO tickets (channel_id, guild_id, user_id)
          VALUES (?, ?, ?)
        `).run(channel.id, guild.id, interaction.user.id);

        const closeRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("vortex_ticket_close")
            .setLabel("Ticket Kapat")
            .setEmoji("🔒")
            .setStyle(ButtonStyle.Danger)
        );

        await channel.send({
          content: `${interaction.user} destek talebin oluşturuldu.`,
          embeds: [
            makeEmbed("Destek Talebi", "Sorununu veya talebini buraya yazabilirsin. Destek ekibi seninle ilgilenecek.")
          ],
          components: [closeRow]
        });

        await sendLog(guild, "Ticket Açıldı", `${interaction.user.tag} tarafından ${channel} açıldı.`);

        return interaction.editReply(`Ticket oluşturuldu: ${channel}`);
      }

      if (interaction.customId === "vortex_ticket_close") {
        const ticket = db.prepare(
          "SELECT * FROM tickets WHERE channel_id = ?"
        ).get(interaction.channelId);

        if (!ticket) {
          return interaction.reply({
            content: "Ticket kaydı bulunamadı.",
            flags: MessageFlags.Ephemeral
          });
        }

        const isOwner = ticket.user_id === interaction.user.id;
        const isStaff = interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels);

        if (!isOwner && !isStaff) {
          return interaction.reply({
            content: "Bu ticket'ı kapatma yetkin yok.",
            flags: MessageFlags.Ephemeral
          });
        }

        await interaction.reply("Ticket kapatılıyor...");

        db.prepare("DELETE FROM tickets WHERE channel_id = ?")
          .run(interaction.channelId);

        await sendLog(
          interaction.guild,
          "Ticket Kapatıldı",
          `${interaction.channel.name} kapatıldı.`
        );

        setTimeout(() => {
          interaction.channel.delete().catch(() => {});
        }, 3000);
      }
    }

  } catch (error) {
    console.error("Interaction hatası:", error);

    const response = {
      content: "Bir hata oluştu. Botun Railway kayıtlarını kontrol et.",
      flags: MessageFlags.Ephemeral
    };

    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(response).catch(() => {});
    } else {
      await interaction.reply(response).catch(() => {});
    }
  }
});

// ==============================
// LOGIN
// ==============================

client.login(TOKEN);
