import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } from "discord.js";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env.local") });

process.chdir(path.join(__dirname, ".."));
const { createUser } = await import("../lib/db.js");

const TOKEN = process.env.DISCORD_TOKEN;

if (!TOKEN) {
  console.error("DISCORD_TOKEN requis dans .env.local");
  process.exit(1);
}

function generatePassword(length = 16) {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%";
  let password = "";
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    password += chars[bytes[i] % chars.length];
  }
  return password;
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("ready", async () => {
  console.log(`Bot connecté en tant que ${client.user.tag}`);

  const command = new SlashCommandBuilder()
    .setName("register")
    .setDescription("Créer un compte pour accéder au site")
    .addStringOption((opt) =>
      opt.setName("username").setDescription("Ton nom d'utilisateur").setRequired(true)
    );

  const rest = new REST().setToken(TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), {
      body: [command.toJSON()],
    });
    console.log("Commande /register enregistrée");
  } catch (err) {
    console.error("Erreur enregistrement commande:", err);
  }
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== "register") return;

  const username = interaction.options.getString("username").toLowerCase().trim();

  if (!/^[a-z0-9_-]{3,20}$/.test(username)) {
    await interaction.reply({
      content: "**Erreur:** Le username doit contenir entre 3 et 20 caractères (lettres, chiffres, _ ou -).",
      flags: 64,
    });
    return;
  }

  try {
    const email = `${username}@sittest.local`;
    const password = generatePassword();
    const hashedPassword = await bcrypt.hash(password, 10);

    try {
      createUser(username, email, hashedPassword, interaction.user.id);
    } catch (dupErr) {
      if (dupErr.code === "DUPLICATE_USERNAME") {
        await interaction.reply({
          content: "**Erreur:** Ce username est déjà pris. Essaie un autre.",
          flags: 64,
        });
        return;
      }
      if (dupErr.code === "DUPLICATE_EMAIL") {
        await interaction.reply({
          content: "**Erreur:** Cet email est déjà utilisé. Essaie un autre username.",
          flags: 64,
        });
        return;
      }
      throw dupErr;
    }

    await interaction.reply({
      content: [
        "## Compte créé avec succès !",
        "",
        "Voici tes identifiants pour te connecter au site :",
        "",
        `**Email :** \`${email}\``,
        `**Mot de passe :** \`${password}\``,
        "",
        "Garde ces informations en sécurité, elles ne seront plus affichées.",
      ].join("\n"),
      flags: 64,
    });

    console.log(`Compte créé pour ${username} (Discord: ${interaction.user.tag})`);
  } catch (err) {
    console.error("Erreur /register:", err);
    await interaction.reply({
      content: "**Erreur:** Impossible de créer le compte. Réessaie plus tard.",
      flags: 64,
    });
  }
});

client.login(TOKEN);
